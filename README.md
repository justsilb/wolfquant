<p align="center">
  <img src="https://img.shields.io/badge/status-production--hardened-brightgreen" alt="Production Hardened">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
  <img src="https://img.shields.io/badge/python-3.9%2B-blue" alt="Python 3.9+">
  <img src="https://img.shields.io/badge/frontend-React-61DAFB" alt="React">
</p>

# 🐺 WolfQuant

> **Your trading command center.** Real-time portfolio tracking, accurate P&L, and performance analytics — all from a single SQLite file. No cloud. No subscription. No bullshit.

WolfQuant is the dashboard every retail trader wishes their broker provided: FIFO-matched realized P&L (not just "average cost"), portfolio performance normalized to deposits, individual stock price journeys, and live quotes — all in a clean, real-time React dashboard.

Built from months of live trading. Hardened by real losses. Open-sourced so you don't have to learn the same lessons the hard way.

---

## What problem does this solve?

Broker dashboards lie. They show "average cost" P&L that doesn't account for multiple buy lots. They don't normalize performance to your deposits, so a $100 gain on $4,000 deposits looks identical to $100 on $400. They mix in dividend reinvestment trades with your active trading, diluting your win rate.

WolfQuant fixes all of this:

| Broker Dashboard | WolfQuant |
|-----------------|-----------|
| Average-cost P&L (misleading) | **FIFO-matched P&L** (tax-lot accurate) |
| No deposits baseline | **Normalized to deposits** (0% = break-even) |
| All accounts mixed | **Scoped to your strategy** |
| Vendor lock-in | **Your data, your database** |
| Black box | **Open source — inspect everything** |

---

## Who is this for?

- **Active traders** who want accurate P&L tracking across multiple buys/sells
- **Algo traders** who need a real-time dashboard for their automated strategies  
- **Portfolio trackers** who want performance charts normalized to invested capital
- **Data nerds** who want a SQLite warehouse of every trade, quote, and snapshot
- **Anyone** tired of their broker's "average cost" fantasy P&L

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+ (for the frontend)
- 5 minutes

### 1. Clone & install

```bash
git clone https://github.com/justsilb/wolfquant.git
cd wolfquant

# Python backend
pip install -r requirements.txt

# React frontend
cd frontend && npm install && npm run build && cd ..
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` — the only thing you need to change is your ticker list:

```env
WOLFQUANT_TICKERS=SPY,VXX,AAPL,MSFT,GOOGL
WOLFQUANT_DEPOSITS=10000     # your total deposits for accurate P&L
```

### 3. Start

```bash
python -m wolfquant
```

Open **[http://localhost:8080](http://localhost:8080)**. That's it.

### 4. Add your trades

WolfQuant reads from a SQLite database. Import trades however you like:

```python
from wolfquant.database import get_connection

conn = get_connection()
conn.execute("""
    INSERT INTO trades (trade_id, timestamp, symbol, side, quantity, price, fees)
    VALUES (?, ?, ?, ?, ?, ?, ?)
""", ("order-123", "2026-06-22T14:30:00Z", "AAPL", "buy", 10, 185.50, 0.03))
conn.commit()
```

Or point `WOLFQUANT_DB_PATH` at your existing warehouse. WolfQuant auto-creates tables on first run.

---

## Configuration Reference

All settings via environment variables or `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `WOLFQUANT_PORT` | `8080` | HTTP server port |
| `WOLFQUANT_HOST` | `0.0.0.0` | Bind address |
| `WOLFQUANT_DB_PATH` | `./data/wolfquant.db` | SQLite database path (auto-created) |
| `WOLFQUANT_TICKERS` | `SPY,VXX` | Comma-separated tickers to track |
| `WOLFQUANT_DEPOSITS` | `0` | Total deposits (for P&L = portfolio − deposits) |
| `WOLFQUANT_QUOTE_INTERVAL` | `15` | Seconds between quote refresh cycles |
| `WOLFQUANT_LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `WOLFQUANT_API_DOCS` | (empty) | Set to `1` to enable `/docs` (FastAPI Swagger) |

---

## API Endpoints

WolfQuant exposes a REST API + WebSocket. Use it headlessly, build your own frontend, or script against it.

### `GET /api/dashboard`
Full dashboard payload — portfolio, positions, recent trades, performance data, and live quotes.

### `GET /api/performance?days=7`
Portfolio performance timeseries normalized to deposits. `0%` = break-even on invested capital.

### `GET /api/stock-performance?days=7`
Individual stock price journeys — full buy→sell price history for each closed trade, normalized to % return.

### `GET /api/trades?days=30`
Trade history with FIFO-computed realized P&L on every sell.

### `GET /api/quotes`
Current live quote snapshot for all configured tickers.

### `WS /ws/quotes`
WebSocket stream — pushes current quotes on connect, then every 5 seconds.

---

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Yahoo       │     │  SQLite      │     │  FastAPI      │
│  Finance     │────▶│  Warehouse   │────▶│  Server       │
│  (quotes)    │     │  (single .db)│     │  (REST + WS)  │
└──────────────┘     └──────┬───────┘     └──────┬───────┘
                            │                    │
                    ┌───────▼───────┐    ┌───────▼───────┐
                    │  Your Trades  │    │  React SPA    │
                    │  (any source) │    │  Dashboard    │
                    └───────────────┘    └───────────────┘
```

- **Zero external dependencies** — just Python + SQLite + a browser
- **Single-file database** — backup, copy, or share your entire trading history
- **Headless-ready** — use the API without the frontend for automation
- **WebSocket quotes** — real-time price updates to all connected clients

Full architecture docs: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Data Integrity — 10 Lessons from Live Trading

These cost real money to learn. Full details in [docs/LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md).

1. **Use `portfolio_value`, not `cash + equity`** — Cash is buying power, not settled value
2. **Deposits baseline for charts** — Without it, charts show 100%+ growth on a $4K portfolio
3. **Absolute floor filter, not ratio** — Don't silently eliminate underwater periods
4. **API endpoint consistency** — Two endpoints computing the same thing MUST use identical logic
5. **SQLite `rowid` aliasing** — `SELECT rowid, *` is broken; use `rowid AS _rowid`
6. **Account scoping** — Drip/recurring trades dilute your metrics; scope to your strategy
7. **Cash fallback for missing snapshots** — Derive cash from the trade ledger when snapshots are empty
8. **Double-encoded JSON from brokers** — Some APIs nest JSON inside JSON; always validate
9. **FIFO silent failure** — Check `sells_with_pnl / total_sells`; investigate gaps
10. **Conviction over clock** — Close when the thesis invalidates, not when the clock ticks

---

## FAQ

### Do I need a broker API connection?
No. WolfQuant reads from a SQLite database. Import your trades however you want — CSV, broker API, manual entry, cron job.

### Does it work with Interactive Brokers / Alpaca / Robinhood?
Yes — the `trades` table is broker-agnostic. As long as you can get your fills into the database (symbol, side, quantity, price, fees, timestamp), WolfQuant handles the rest.

### Is my data safe?
Your data never leaves your machine. There's no cloud component, no telemetry, no analytics. It's a local server talking to a local SQLite file.

### Can I run it headlessly?
Yes. The API is fully functional without the frontend. Use `curl`, Python scripts, or any HTTP client.

### What's the frontend built with?
React + Vite + Recharts. The `frontend/dist/` directory is served as static files by the FastAPI server. No separate frontend server needed.

---

## Roadmap

- [ ] Broker plugins (Interactive Brokers, Alpaca, Robinhood direct ingest)
- [ ] Options P&L tracking
- [ ] Multi-portfolio support
- [ ] Strategy backtesting against historical data
- [ ] Docker image for one-command deployment
- [ ] Mobile-responsive layout

---

## Contributing

Pull requests welcome. Areas where we especially need help:

- **Broker integrations** — Build a connector for your broker
- **Chart types** — New visualizations for trading analytics
- **Documentation** — Tutorials, examples, deployment guides

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines (or just open an issue to discuss).

---

## License

MIT — use it, fork it, trade with it. Just don't blame us when the market humbles you. 🐺

---

<p align="center">
  <b>Built with 🐺 by traders, for traders.</b><br>
  <sub>Production-hardened through months of daily trading. Open-sourced so you don't have to learn the hard way.</sub>
</p>
