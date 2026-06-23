"""WolfQuant Database — SQLite warehouse connection and schema.

Zero-config: database is created on first use. All tables use IF NOT EXISTS
so the module is safe to import at any time.
"""

import sqlite3
from pathlib import Path

from .config import settings

# Schema bundled as a string so there's no file dependency at runtime
SCHEMA = """
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id TEXT UNIQUE NOT NULL,
    timestamp TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('buy','sell')),
    type TEXT NOT NULL DEFAULT 'market',
    quantity REAL NOT NULL,
    price REAL,
    notional REAL,
    fees REAL DEFAULT 0,
    pnl_pct REAL,
    pnl_dollar REAL,
    reason TEXT,
    strategy TEXT,
    placed_agent TEXT DEFAULT 'manual',
    source_file TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    portfolio_value REAL NOT NULL,
    cash REAL,
    buying_power REAL,
    equity_value REAL,
    spy_price REAL CHECK(spy_price IS NULL OR (spy_price >= 10 AND spy_price <= 15000)),
    spy_change_pct REAL,
    vxx_price REAL CHECK(vxx_price IS NULL OR (vxx_price >= 5 AND vxx_price <= 2000)),
    vxx_change_pct REAL,
    positions_json TEXT,
    mcp_status TEXT,
    phase TEXT,
    source_file TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS position_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    symbol TEXT NOT NULL,
    shares REAL NOT NULL,
    avg_cost REAL NOT NULL,
    current_price REAL,
    market_value REAL,
    pnl_pct REAL,
    pnl_dollar REAL,
    portfolio_pct REAL,
    stop_loss REAL,
    take_profit_1 REAL,
    take_profit_2 REAL,
    source_file TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    timestamp TEXT DEFAULT (datetime('now')),
    note TEXT
);

CREATE TABLE IF NOT EXISTS daily_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
    start_portfolio REAL,
    end_portfolio REAL,
    pnl_dollar REAL,
    pnl_pct REAL,
    spy_start REAL,
    spy_end REAL,
    spy_pnl_pct REAL,
    alpha_pct REAL,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    win_rate REAL,
    max_positions INTEGER,
    avg_positions REAL,
    total_fees REAL DEFAULT 0,
    regime TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backtest_bars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume REAL,
    UNIQUE(symbol, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_backtest_symbol_ts ON backtest_bars(symbol, timestamp);

CREATE TABLE IF NOT EXISTS market_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    symbol TEXT NOT NULL,
    price REAL NOT NULL,
    change_pct REAL,
    volume REAL,
    day_high REAL,
    day_low REAL,
    source TEXT DEFAULT 'yahoo',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_portfolio_timestamp ON portfolio_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_market_timestamp ON market_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_market_symbol ON market_snapshots(symbol);
CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_summaries(date);
"""


def get_connection(path: Path | None = None) -> sqlite3.Connection:
    """Get a SQLite connection to the WolfQuant database.

    Creates the database and tables if they don't exist.
    Uses WAL mode for concurrent reads.
    """
    db_path = str(path or settings.DB_PATH)
    db_path_obj = Path(db_path)
    db_path_obj.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def init_db(path: Path | None = None) -> None:
    """Initialize the database — creates tables if they don't exist."""
    conn = get_connection(path)
    conn.close()
