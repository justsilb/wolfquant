# 🐺 WolfQuant

**Open-source trading dashboard and data pipeline** — built from live trading experience.

WolfQuant gives you a real-time trading command center: live quotes, portfolio tracking, FIFO-matched P&L, performance charts, and a clean React dashboard. Market-agnostic. Broker-agnostic. Production-hardened through months of daily trading.

```
┌──────────────────────────────────────────────────────┐
│  🐺 WolfQuant  ● MCP: OK  ● SPY $585.32  ● VIX 14.2 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Portfolio│ │  Day P&L │ │ Win Rate │ │ P Factor│ │
│  │ $4,084   │ │  +$12.50 │ │  72.5%   │ │  1.93   │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│  ┌────────────────────┐ ┌──────────────────────────┐ │
│  │ Portfolio Chart    │ │ Stock Performance        │ │
│  │     ╱╲   ╱╲        │ │ BBAI +1.7%  SMR +28.9%  │ │
│  │    ╱  ╲_╱  ╲___    │ │ RCAT +4.9%  EOSE +4.6%  │ │
│  └────────────────────┘ └──────────────────────────┘ │
│  Positions │ Trade History │ Cron Health              │
└──────────────────────────────────────────────────────┘
```

## Features

- **📊 Real-time Dashboard** — Portfolio, P&L, win rate, profit factor, live quotes
- **📈 Performance Charts** — Portfolio growth vs SPY benchmark, individual stock journeys
- **🧮 FIFO-Matched P&L** — Accurate realized P&L with buy/sell lot matching
- **🔌 WebSocket Quotes** — Live price streaming to all connected clients
- **📋 Trade History** — Full trade ledger with FIFO-computed realized P&L
- **🏗️ SQLite Warehouse** — Zero-config, single-file data store
- **⚙️ Market Agnostic** — Configure any tickers, any watchlist
- **🔒 No Secrets** — All credentials via environment variables or `.env` file

## Quick Start

```bash
# Clone
git clone https://github.com/justinhschneider/wolfquant.git
cd wolfquant

# Install
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env — set your tickers, database path, etc.

# Initialize database
python -m wolfquant.database --init

# Start server
python -m wolfquant.server

# Open http://localhost:8080
```

## Configuration

Everything is configurable via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `WOLFQUANT_PORT` | `8080` | Server port |
| `WOLFQUANT_DB_PATH` | `./data/wolfquant.db` | SQLite database path |
| `WOLFQUANT_TICKERS` | `SPY,VXX,AAPL,MSFT` | Comma-separated ticker list |
| `WOLFQUANT_QUOTE_INTERVAL` | `15` | Quote fetch interval (seconds) |
| `WOLFQUANT_DEPOSITS` | `0` | Total deposits for P&L calculation |
| `WOLFQUANT_LOG_LEVEL` | `INFO` | Logging level |

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Quote Feed  │────▶│  SQLite DB   │────▶│  FastAPI      │
│  (Yahoo/API) │     │  (Warehouse) │     │  Server       │
└──────────────┘     └──────┬───────┘     └──────┬───────┘
                            │                    │
                    ┌───────▼───────┐    ┌───────▼───────┐
                    │  Trade Ingest │    │  WebSocket    │
                    │  (Cron/API)   │    │  Broadcast    │
                    └───────────────┘    └───────┬───────┘
                                                 │
                                         ┌───────▼───────┐
                                         │  React        │
                                         │  Dashboard    │
                                         └───────────────┘
```

- **Quote Feed** — Pulls live prices from Yahoo Finance (configurable interval)
- **Trade Ingest** — Imports executed trades from your broker or cron pipeline
- **SQLite Warehouse** — Single-file database with trades, snapshots, performance
- **FastAPI Server** — REST API + WebSocket push to dashboard
- **React Dashboard** — Real-time UI with charts, cards, trade history

## Data Integrity — Hard-Won Lessons

This project was born from real money trading. Here's what we learned:

### 1. Use `portfolio_value`, not `cash + equity`
Snapshots show settled portfolio value. Cash is buying power (may be lower due to unsettled funds). Use `portfolio_value` for P&L calculations.

### 2. Deposits baseline for performance charts
The first point of any performance chart must be `total_deposits` (0% = break-even). Without this, charts show 100%+ growth on a $4K portfolio.

### 3. Portfolio value filter: absolute floor, not deposit ratio
`WHERE portfolio_value >= total_deposits * 0.8` silently eliminates trading history below deposits. Use `>= 100` instead.

### 4. Account scoping matters
Mixing drip/recurring trades with active trading dilutes win rate and profit factor. Scope your analytics to the strategy you're measuring.

### 5. SQLite `rowid` aliasing
`SELECT rowid, *` duplicates `rowid` in the result. Always use `SELECT rowid AS _rowid, *`.

Full lessons: [docs/LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md)

## Contributing

WolfQuant is open source and community-driven. We welcome:

- New broker integrations (Interactive Brokers, Alpaca, etc.)
- Additional chart types and metrics
- Strategy backtesting modules
- Documentation improvements

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT — use it, fork it, trade with it. Just don't blame us when the market humbles you. 🐺

---

*Built with 🐺 by traders, for traders.*
