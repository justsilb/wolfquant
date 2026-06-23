# WolfQuant Architecture

## Overview

WolfQuant is a self-contained trading dashboard with three layers:

```
┌─────────────────────────────────────────────────────┐
│                  React Frontend                     │
│  Portfolio │ Charts │ Positions │ Trade History     │
│         ↕ REST API  +  WebSocket quotes             │
├─────────────────────────────────────────────────────┤
│                FastAPI Backend                      │
│  /api/dashboard  /api/performance  /api/trades     │
│  /api/stock-performance  /ws/quotes                │
│         ↕ SQLite                                    │
├─────────────────────────────────────────────────────┤
│              SQLite Warehouse                       │
│  trades │ portfolio_snapshots │ market_snapshots    │
└─────────────────────────────────────────────────────┘
```

## Data Flow

### Quote Pipeline
1. Background thread fetches quotes from Yahoo Finance every N seconds
2. Quotes stored in thread-safe in-memory dict
3. WebSocket pushes to all connected clients every 5 seconds
4. REST endpoint `/api/quotes` serves latest snapshot on demand

### Trade Pipeline
1. Trades ingested into `trades` table (from broker API, CSV, or manual entry)
2. Portfolio snapshots captured periodically into `portfolio_snapshots`
3. Dashboard queries trades table + snapshots, computes live positions

### P&L Computation
- **FIFO matching:** Sells matched against oldest available buys for each symbol
- **Realized P&L:** `(sell_price × matched_qty) - cost_basis`
- **Total P&L:** `live_portfolio - total_deposits`
- **Win rate / Profit factor:** Computed from all FIFO-matched closed trades

## Database Schema

### `trades` — Every executed trade
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Auto-increment PK |
| trade_id | TEXT UNIQUE | Order ID from broker |
| timestamp | TEXT | ISO 8601 execution time |
| symbol | TEXT | Ticker symbol |
| side | TEXT | 'buy' or 'sell' |
| quantity | REAL | Number of shares |
| price | REAL | Fill price |
| fees | REAL | Regulatory + broker fees |
| pnl_dollar | REAL | Realized P&L (if closing) |
| pnl_pct | REAL | Realized P&L % (if closing) |

### `portfolio_snapshots` — Periodic account state
| Column | Type | Description |
|--------|------|-------------|
| timestamp | TEXT | ISO 8601 capture time |
| portfolio_value | REAL | Total account value |
| cash | REAL | Buying power / settled cash |
| spy_price | REAL | SPY benchmark at capture |
| vxx_price | REAL | VXX volatility at capture |

### `market_snapshots` — Individual stock quotes
| Column | Type | Description |
|--------|------|-------------|
| timestamp | TEXT | ISO 8601 quote time |
| symbol | TEXT | Ticker |
| price | REAL | Last price |
| change_pct | REAL | Daily change % |
| volume | REAL | Daily volume |

## API Reference

### `GET /api/dashboard`
Full dashboard payload. Returns:
```json
{
  "time": "2026-06-23T01:00:00Z",
  "summary": {
    "portfolio": 4084.69,
    "cash": 4084.69,
    "equity": 0.0,
    "total_pnl": 84.69,
    "win_rate": 72.5,
    "profit_factor": 1.93,
    "total_fees": 0.30,
    "spy_price": 585.32,
    "vxx_price": 14.20
  },
  "positions": [...],
  "trades": [...],
  "performance": [...],
  "quotes": {...}
}
```

### `GET /api/performance?days=7`
Portfolio performance timeseries. Returns `{"points": [...]}` with
deposits baseline prepended for correct percentage normalization.

### `GET /api/stock-performance?days=7`
Individual stock price journeys. Returns `{"series": [...]}` with
full buy→sell price history per trade, normalized to % return.

### `GET /api/trades?days=30`
Trade history with FIFO-computed realized P&L.

### `GET /api/quotes`
Current live quotes snapshot.

### `WS /ws/quotes`
WebSocket live quote stream. Pushes on connect and every 5 seconds.

## Configuration

All settings via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| WOLFQUANT_PORT | 8080 | Server port |
| WOLFQUANT_DB_PATH | ./data/wolfquant.db | SQLite path |
| WOLFQUANT_TICKERS | SPY,VXX | Tracked tickers |
| WOLFQUANT_DEPOSITS | 0 | Total deposits |
| WOLFQUANT_QUOTE_INTERVAL | 15 | Quote fetch seconds |
| WOLFQUANT_LOG_LEVEL | INFO | Logging level |

## Extending WolfQuant

### Adding a new broker
1. Implement a function that pulls filled orders from your broker API
2. Convert to WolfQuant trade format: `{trade_id, timestamp, symbol, side, quantity, price, fees}`
3. Insert into `trades` table via `get_connection()`
4. Portfolio snapshots auto-populate from the trade ledger

### Adding a new chart
1. Add a FastAPI endpoint in `server.py`
2. Add a React component in `frontend/src/components/`
3. Wire into `App.jsx`

### Adding a new metric card
1. Compute the metric in `/api/dashboard` → `summary` dict
2. Add display in `PortfolioCards.jsx`
