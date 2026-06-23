"""WolfQuant Server — FastAPI backend for the trading dashboard.

Core endpoints:
  GET  /api/dashboard          — Full dashboard payload (portfolio, trades, charts)
  GET  /api/performance?days=N — Portfolio performance timeseries
  GET  /api/stock-performance?days=N — Individual stock price journeys
  GET  /api/trades?days=N      — Trade history
  GET  /api/quotes             — Current live quotes snapshot
  WS   /ws/quotes              — WebSocket live quote stream

All data is computed from the SQLite warehouse. No secrets, no
hardcoded tickers — everything via environment variables.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
import urllib.request
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import get_connection, init_db

# ── Logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
LOG = logging.getLogger("wolfquant")

# ── Paths ────────────────────────────────────────────────────────────
STATIC_DIR = Path(__file__).parent.parent
REACT_DIST = STATIC_DIR / "frontend" / "dist"
REACT_READY = REACT_DIST.exists() and (REACT_DIST / "index.html").exists()
INDEX_HTML = (REACT_DIST if REACT_READY else STATIC_DIR) / "index.html"

# ── Quote state (thread-safe) ────────────────────────────────────────
_quotes_lock = threading.Lock()
_quotes_state: dict[str, Any] = {
    "quotes": {},       # {symbol: {price, change_pct, volume, high, low}}
    "last_fetch": None,
}


def _fetch_quotes() -> None:
    """Fetch live quotes from Yahoo Finance for configured tickers."""
    for symbol in settings.TICKERS:
        try:
            url = settings.YAHOO_CHART_URL.format(sym=symbol)
            req = urllib.request.Request(url, headers={"User-Agent": "WolfQuant/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            result = data.get("chart", {}).get("result", [])
            if result:
                meta = result[0]["meta"]
                quote = {
                    "price": meta.get("regularMarketPrice", 0),
                    "change_pct": meta.get("regularMarketChangePercent", 0),
                    "volume": meta.get("regularMarketVolume", 0),
                    "high": meta.get("regularMarketDayHigh", 0),
                    "low": meta.get("regularMarketDayLow", 0),
                }
                with _quotes_lock:
                    _quotes_state["quotes"][symbol] = quote
        except Exception:
            pass
        time.sleep(settings.QUOTE_FETCH_DELAY)
    with _quotes_lock:
        _quotes_state["last_fetch"] = datetime.now(timezone.utc).isoformat()


def _get_quotes_snapshot() -> dict[str, Any]:
    """Thread-safe snapshot of current quotes."""
    with _quotes_lock:
        return {
            "quotes": dict(_quotes_state["quotes"]),
            "last_fetch": _quotes_state["last_fetch"],
        }


# ── WebSocket broadcast ──────────────────────────────────────────────
_ws_clients: set[WebSocket] = set()


async def _ws_broadcast_loop() -> None:
    """Periodically push quotes to all connected WebSocket clients."""
    while True:
        await asyncio.sleep(settings.WS_PUSH_INTERVAL)
        snapshot = json.dumps(_get_quotes_snapshot())
        dead: list[WebSocket] = []
        for ws in _ws_clients:
            try:
                await ws.send_text(snapshot)
            except Exception:
                dead.append(ws)
        for ws in dead:
            _ws_clients.discard(ws)


# ── Background quote fetcher ─────────────────────────────────────────
def _quote_fetch_loop() -> None:
    """Background thread: pull quotes on configured interval."""
    while True:
        _fetch_quotes()
        time.sleep(settings.QUOTE_INTERVAL)


# ── FIFO P&L matching ────────────────────────────────────────────────
def _compute_fifo_pnl(conn) -> dict[int, float]:
    """Compute FIFO-matched realized P&L for all sell trades.

    Returns dict mapping rowid → pnl_dollar.
    """
    rows = conn.execute(
        "SELECT rowid AS _rowid, symbol, side, quantity, price "
        "FROM trades WHERE price > 0 ORDER BY symbol, timestamp"
    ).fetchall()

    buy_lots: dict[str, deque] = defaultdict(deque)
    pnl_map: dict[int, float] = {}

    for r in rows:
        qty = float(r["quantity"])
        price = float(r["price"])
        if r["side"] == "buy":
            buy_lots[r["symbol"]].append((qty, price))
        else:
            remaining = qty
            cost_basis = 0.0
            matched = 0.0
            while remaining > 0.0001 and buy_lots[r["symbol"]]:
                lot_qty, lot_price = buy_lots[r["symbol"]][0]
                taken = min(remaining, lot_qty)
                cost_basis += taken * lot_price
                matched += taken
                remaining -= taken
                if taken >= lot_qty - 0.0001:
                    buy_lots[r["symbol"]].popleft()
                else:
                    buy_lots[r["symbol"]][0] = (lot_qty - taken, lot_price)
            if matched > 0:
                pnl_map[r["_rowid"]] = round((price * matched) - cost_basis, 2)

    return pnl_map


# ── FastAPI app ──────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background loops on startup, clean shutdown."""
    # Start quote fetcher thread
    quote_thread = threading.Thread(target=_quote_fetch_loop, daemon=True)
    quote_thread.start()

    # Start WebSocket broadcast
    ws_task = asyncio.create_task(_ws_broadcast_loop())

    # Initialize DB
    init_db(settings.DB_PATH)
    LOG.info("WolfQuant v%s started — %s", __import__("wolfquant").__version__, settings.DB_PATH)

    yield

    ws_task.cancel()
    LOG.info("WolfQuant shutdown")


app = FastAPI(
    title="WolfQuant API",
    version="1.0.0",
    lifespan=lifespan,
    **settings.FASTAPI_DOCS_KWARGS,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Static files ─────────────────────────────────────────────────────
if REACT_READY:
    app.mount("/assets", StaticFiles(directory=REACT_DIST / "assets"), name="assets")


@app.get("/api/quotes")
def api_quotes():
    """Current live quotes for all tracked tickers."""
    return _get_quotes_snapshot()


@app.get("/api/dashboard")
def api_dashboard():
    """Full dashboard payload — portfolio, trades, performance, quotes."""
    try:
        conn = get_connection(settings.DB_PATH)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)

    try:
        # Portfolio snapshot
        latest = conn.execute(
            "SELECT * FROM portfolio_snapshots ORDER BY timestamp DESC LIMIT 1"
        ).fetchone()

        portfolio_value = float(latest["portfolio_value"]) if latest and latest["portfolio_value"] else 0.0
        cash = float(latest["cash"]) if latest and latest["cash"] else 0.0

        # Deposits and fees
        total_deposits = float(
            conn.execute("SELECT COALESCE(SUM(amount), 0) FROM deposits").fetchone()[0]
            if _table_exists(conn, "deposits")
            else settings.DEPOSITS
        )
        total_fees = round(
            conn.execute("SELECT COALESCE(SUM(fees), 0) FROM trades").fetchone()[0], 2
        )

        # Compute total FIFO P&L (for cash fallback when no snapshots)
        total_fifo_pnl = 0.0
        all_trades_fifo = conn.execute(
            "SELECT rowid AS _rowid, symbol, side, quantity, price "
            "FROM trades WHERE price > 0 ORDER BY symbol, timestamp"
        ).fetchall()
        buy_lots_fifo: dict[str, deque] = defaultdict(deque)
        for t in all_trades_fifo:
            qty = float(t["quantity"])
            price = float(t["price"])
            if t["side"] == "buy":
                buy_lots_fifo[t["symbol"]].append((qty, price))
            else:
                remaining = qty
                cost_basis = 0.0
                while remaining > 0.0001 and buy_lots_fifo[t["symbol"]]:
                    lot_qty, lot_price = buy_lots_fifo[t["symbol"]][0]
                    taken = min(remaining, lot_qty)
                    cost_basis += taken * lot_price
                    remaining -= taken
                    if taken >= lot_qty - 0.0001:
                        buy_lots_fifo[t["symbol"]].popleft()
                    else:
                        buy_lots_fifo[t["symbol"]][0] = (lot_qty - taken, lot_price)
                if remaining <= 0.0001:
                    total_fifo_pnl += (price * qty) - cost_basis

        # Fallback: no snapshots → derive cash from deposits + P&L - fees
        if portfolio_value == 0.0 and cash == 0.0:
            cash = round(total_deposits + total_fifo_pnl - total_fees, 2)
            portfolio_value = cash

        # Live positions from trades ledger
        pos_rows = conn.execute("""
            SELECT
                symbol,
                SUM(CASE WHEN side='buy' THEN quantity ELSE -quantity END) as shares,
                CASE WHEN SUM(CASE WHEN side='buy' THEN quantity ELSE 0 END) > 0
                     THEN SUM(CASE WHEN side='buy' THEN quantity * COALESCE(price,0) ELSE 0 END)
                          / SUM(CASE WHEN side='buy' THEN quantity ELSE 0 END)
                     ELSE 0 END as avg_cost
            FROM trades
            GROUP BY symbol
            HAVING shares > 0.005
        """).fetchall()

        # Enrich positions with live prices
        live_positions = []
        live_equity = 0.0
        quotes_snap = _get_quotes_snapshot()["quotes"]
        for row in pos_rows:
            sym = row["symbol"]
            shares = float(row["shares"])
            cost = float(row["avg_cost"])
            quote = quotes_snap.get(sym, {})
            live_price = float(quote.get("price", 0)) if quote else 0
            if not live_price:
                live_price = cost
            pos_value = shares * live_price
            live_equity += pos_value
            pnl = pos_value - (shares * cost) if cost else 0
            live_positions.append({
                "symbol": sym,
                "shares": round(shares, 6),
                "cost": round(cost, 2),
                "price": live_price,
                "pnl": f"${pnl:+.2f}" if pnl else "$0.00",
                "pnl_pct": round((live_price - cost) / cost * 100, 2) if cost else 0,
            })

        # Total portfolio
        live_portfolio = round(live_equity + cash, 2) if live_equity > 0 else portfolio_value
        total_pnl_realized = round(live_portfolio - total_deposits, 2)

        # Benchmarks
        spy_quote = quotes_snap.get("SPY", {})
        spy_price = float(spy_quote.get("price", 0)) if spy_quote else 0.0
        spy_change_pct = float(spy_quote.get("change_pct", 0)) if spy_quote else None
        vxx_quote = quotes_snap.get("VXX", {})
        vxx_price = float(vxx_quote.get("price", 0)) if vxx_quote else 0.0

        # Win rate / profit factor from FIFO matching
        pnl_map = _compute_fifo_pnl(conn)
        wins = sum(1 for p in pnl_map.values() if p > 0)
        losses = sum(1 for p in pnl_map.values() if p < 0)
        total_closed = wins + losses
        gross_wins = sum(p for p in pnl_map.values() if p > 0)
        gross_losses = sum(abs(p) for p in pnl_map.values() if p < 0)
        win_rate = round(wins / total_closed * 100, 1) if total_closed > 0 else None
        profit_factor = round(gross_wins / gross_losses, 2) if gross_losses > 0 else (None if gross_wins == 0 else 99.99)
        avg_win = round(gross_wins / wins, 2) if wins else None
        avg_loss = round(gross_losses / losses, 2) if losses else None
        avg_wl_ratio = round(avg_win / avg_loss, 2) if avg_win and avg_loss else None

        # Recent trades
        raw_trades = conn.execute(
            "SELECT rowid AS _rowid, * FROM trades ORDER BY timestamp DESC LIMIT 30"
        ).fetchall()
        trades = []
        for t in raw_trades:
            d = dict(t)
            rowid = d.pop("_rowid", None)
            if d["side"] == "sell":
                d.pop("pnl_dollar", None)
                d.pop("pnl_pct", None)
                pnl = pnl_map.get(rowid)
                if pnl is not None:
                    d["pnl"] = round(pnl, 2)
            else:
                d.pop("pnl_dollar", None)
                d.pop("pnl_pct", None)
            trades.append(d)

        # Performance timeseries (last 7 days for dashboard)
        perf_rows = conn.execute(
            "SELECT timestamp, portfolio_value, spy_price, vxx_price "
            "FROM portfolio_snapshots "
            "WHERE timestamp >= datetime('now', '-7 days') "
            "  AND portfolio_value >= 100 "
            "ORDER BY timestamp ASC"
        ).fetchall()

        performance = []
        if perf_rows:
            baseline = {
                "timestamp": perf_rows[0]["timestamp"],
                "portfolio": total_deposits,
                "spy": perf_rows[0]["spy_price"],
                "vxx": perf_rows[0]["vxx_price"],
                "source": "baseline",
            }
            performance.append(baseline)
            for r in perf_rows:
                performance.append({
                    "timestamp": r["timestamp"],
                    "portfolio": r["portfolio_value"],
                    "spy": r["spy_price"],
                    "vxx": r["vxx_price"],
                    "source": "snapshot",
                })

        summary = {
            "portfolio": round(live_portfolio, 2),
            "cash": round(cash, 2),
            "equity": round(live_equity, 2),
            "positions_count": len(live_positions),
            "total_pnl": total_pnl_realized,
            "total_closed_trades": total_closed,
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "avg_win": avg_win,
            "avg_loss": avg_loss,
            "avg_wl_ratio": avg_wl_ratio,
            "total_fees": total_fees,
            "spy_price": round(spy_price, 2),
            "spy_change_pct": round(spy_change_pct, 2) if spy_change_pct else None,
            "vxx_price": round(vxx_price, 2),
        }

        return {
            "time": datetime.now(timezone.utc).isoformat(),
            "summary": summary,
            "positions": live_positions,
            "trades": trades,
            "performance": performance,
            "quotes": quotes_snap,
        }

    except Exception as exc:
        LOG.exception("Dashboard error")
        return JSONResponse({"error": str(exc)}, status_code=500)
    finally:
        conn.close()


@app.get("/api/performance")
def api_performance(days: int = Query(default=7, ge=1, le=365)):
    """Portfolio performance timeseries — normalized to deposits baseline."""
    try:
        conn = get_connection(settings.DB_PATH)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)

    try:
        total_deposits = float(
            conn.execute("SELECT COALESCE(SUM(amount), 0) FROM deposits").fetchone()[0]
            if _table_exists(conn, "deposits")
            else settings.DEPOSITS
        )

        rows = conn.execute(
            "SELECT timestamp, portfolio_value, spy_price, vxx_price "
            "FROM portfolio_snapshots "
            "WHERE timestamp >= datetime('now', ?) "
            "  AND portfolio_value >= 100 "
            "ORDER BY timestamp ASC",
            (f"-{days} days",),
        ).fetchall()

        # Hourly dedup
        hourly: dict[str, dict] = {}
        for r in rows:
            hour_key = r["timestamp"][:13]
            hourly[hour_key] = {
                "timestamp": r["timestamp"],
                "portfolio": r["portfolio_value"],
                "spy": r["spy_price"],
                "vxx": r["vxx_price"],
            }
        points = sorted(hourly.values(), key=lambda x: x["timestamp"])

        # Prepend deposits baseline
        if points and total_deposits > 0:
            baseline = dict(points[0])
            baseline["portfolio"] = total_deposits
            points.insert(0, baseline)

        return {"points": points}

    except Exception as exc:
        LOG.exception("Performance error")
        return JSONResponse({"error": str(exc)}, status_code=500)
    finally:
        conn.close()


@app.get("/api/stock-performance")
def api_stock_performance(days: int = Query(default=7, ge=1, le=365)):
    """Individual stock price journeys — full buy→sell history per trade."""
    try:
        conn = get_connection(settings.DB_PATH)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)

    try:
        cutoff = f"-{days} days"

        # Find closed trades (buy→sell pairs) within the date window
        all_trades = conn.execute(
            "SELECT rowid AS _rowid, symbol, side, quantity, price, timestamp "
            "FROM trades WHERE price > 0 ORDER BY symbol, timestamp"
        ).fetchall()

        buy_lots: dict[str, deque] = defaultdict(deque)
        round_trips = []

        for t in all_trades:
            qty = float(t["quantity"])
            price = float(t["price"])
            if t["side"] == "buy":
                buy_lots[t["symbol"]].append((qty, price, t["timestamp"]))
            else:
                remaining = qty
                cost_basis = 0.0
                matched = 0.0
                buy_ts = None
                while remaining > 0.0001 and buy_lots[t["symbol"]]:
                    lot_qty, lot_price, lot_ts = buy_lots[t["symbol"]][0]
                    taken = min(remaining, lot_qty)
                    cost_basis += taken * lot_price
                    matched += taken
                    remaining -= taken
                    if buy_ts is None:
                        buy_ts = lot_ts
                    if taken >= lot_qty - 0.0001:
                        buy_lots[t["symbol"]].popleft()
                    else:
                        buy_lots[t["symbol"]][0] = (lot_qty - taken, lot_price, lot_ts)
                if matched > 0 and buy_ts:
                    round_trips.append({
                        "symbol": t["symbol"],
                        "buy_ts": buy_ts,
                        "sell_ts": t["timestamp"],
                        "buy_price": cost_basis / matched,
                        "sell_price": price,
                        "matched": matched,
                    })

        # Filter to date range by sell time
        cutoff_row = conn.execute(
            "SELECT datetime('now', ?)", (cutoff,)
        ).fetchone()[0]
        round_trips = [rt for rt in round_trips if rt["sell_ts"] >= cutoff_row]

        # Get price bars for each round trip (scaled to % return)
        COLORS = [
            "#22c55e", "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6",
            "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
        ]
        series = []
        color_idx = 0

        for rt in round_trips[:50]:  # cap at 50 series
            sym = rt["symbol"]
            buy_price = rt["buy_price"]
            sell_price = rt["sell_price"]
            pnl_pct = round((sell_price - buy_price) / buy_price * 100, 2)
            color = COLORS[color_idx % len(COLORS)]
            color_idx += 1

            # Get 5-min bars between buy and sell
            bars = conn.execute(
                "SELECT timestamp, close FROM backtest_bars "
                "WHERE symbol = ? AND timestamp >= ? AND timestamp <= ? "
                "ORDER BY timestamp ASC",
                (sym, rt["buy_ts"], rt["sell_ts"]),
            ).fetchall()

            data = []
            if bars:
                for b in bars:
                    pct = (float(b["close"]) - buy_price) / buy_price * 100
                    data.append({"timestamp": b["timestamp"], "pct": round(pct, 2)})

            series.append({
                "symbol": sym,
                "label": f"{sym} ({pnl_pct:+.1f}%)",
                "color": color,
                "buy_price": round(buy_price, 2),
                "sell_price": round(sell_price, 2),
                "pnl_pct": pnl_pct,
                "data": data,
            })

        return {"series": series}

    except Exception as exc:
        LOG.exception("Stock performance error")
        return JSONResponse({"error": str(exc)}, status_code=500)
    finally:
        conn.close()


@app.get("/api/trades")
def api_trades(days: int = Query(default=30, ge=1, le=365)):
    """Trade history with FIFO-computed realized P&L."""
    try:
        conn = get_connection(settings.DB_PATH)
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)

    try:
        cutoff = f"-{days} days"
        rows = conn.execute(
            "SELECT rowid AS _rowid, * FROM trades "
            "WHERE timestamp >= datetime('now', ?) "
            "ORDER BY timestamp DESC",
            (cutoff,),
        ).fetchall()

        pnl_map = _compute_fifo_pnl(conn)
        trades = []
        for r in rows:
            d = dict(r)
            rowid = d.pop("_rowid", None)
            if d["side"] == "sell":
                d.pop("pnl_dollar", None)
                d.pop("pnl_pct", None)
                pnl = pnl_map.get(rowid)
                if pnl is not None:
                    d["pnl"] = round(pnl, 2)
            else:
                d.pop("pnl_dollar", None)
                d.pop("pnl_pct", None)
            trades.append(d)

        return {"trades": trades}

    except Exception as exc:
        LOG.exception("Trades error")
        return JSONResponse({"error": str(exc)}, status_code=500)
    finally:
        conn.close()


# ── WebSocket ────────────────────────────────────────────────────────
@app.websocket("/ws/quotes")
async def ws_quotes(websocket: WebSocket):
    """Live quote stream — pushes current quotes on connect and on interval."""
    await websocket.accept()
    _ws_clients.add(websocket)
    try:
        # Send current state immediately
        await websocket.send_text(json.dumps(_get_quotes_snapshot()))
        # Keep connection alive
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _ws_clients.discard(websocket)


# ── SPA fallback ─────────────────────────────────────────────────────
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve React SPA — all non-API routes return index.html."""
    if REACT_READY and (REACT_DIST / full_path).exists():
        return FileResponse(REACT_DIST / full_path)
    if REACT_READY:
        return FileResponse(REACT_DIST / "index.html")
    return JSONResponse({"error": "Frontend not built. Run: cd frontend && npm run build"}, status_code=404)


# ── Helpers ──────────────────────────────────────────────────────────
def _table_exists(conn, table_name: str) -> bool:
    """Check if a table exists in the database."""
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    ).fetchone()
    return row is not None
