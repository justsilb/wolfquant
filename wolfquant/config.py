"""WolfQuant Configuration — market-agnostic, broker-agnostic.

All values configurable via environment variables. No hardcoded tickers,
paths, or credentials. Designed to work with any broker, any market.

Usage:
    from wolfquant.config import settings
    port = settings.PORT
"""

from __future__ import annotations

import logging
import os
from pathlib import Path


class Settings:
    """Central configuration singleton.

    Environment variables take precedence over defaults.
    Create once at import time — values are read when the module loads.
    """

    def __init__(self) -> None:
        # ── Server ──────────────────────────────────────────────────
        self.PORT: int = int(os.getenv("WOLFQUANT_PORT", "8080"))
        """HTTP server port."""

        log_name: str = os.getenv("WOLFQUANT_LOG_LEVEL", "INFO").upper()
        self.LOG_LEVEL: int = getattr(logging, log_name, logging.INFO)
        """Python logging level."""

        self.ENABLE_API_DOCS: bool = bool(
            os.getenv("WOLFQUANT_API_DOCS", "")
        )
        """Enable FastAPI auto-docs (/docs, /redoc). Off by default."""

        # ── Database ────────────────────────────────────────────────
        self.DB_PATH: Path = Path(
            os.getenv("WOLFQUANT_DB_PATH", "./data/wolfquant.db")
        )
        """SQLite database path. Directory is created if needed."""

        self.DB_DIR: Path = self.DB_PATH.parent
        """Database directory (derived from DB_PATH)."""

        # ── Trading ─────────────────────────────────────────────────
        self.DEPOSITS: float = float(os.getenv("WOLFQUANT_DEPOSITS", "0"))
        """Total deposits for P&L calculation (portfolio - deposits)."""

        self.TICKERS: list[str] = [
            t.strip().upper()
            for t in os.getenv("WOLFQUANT_TICKERS", "SPY,VXX").split(",")
            if t.strip()
        ]
        """Ticker symbols to track. Comma-separated in env var."""

        # ── Quotes ──────────────────────────────────────────────────
        self.QUOTE_INTERVAL: float = float(
            os.getenv("WOLFQUANT_QUOTE_INTERVAL", "15")
        )
        """Seconds between quote refresh cycles."""

        self.WS_PUSH_INTERVAL: float = 5.0
        """Seconds between WebSocket pushes to clients."""

        self.QUOTE_FETCH_DELAY: float = 0.2
        """Delay between Yahoo Finance API calls (rate limiting)."""

        self.YAHOO_CHART_URL: str = os.getenv(
            "WOLFQUANT_YAHOO_URL",
            "https://query1.finance.yahoo.com/v8/finance/chart/"
            "{sym}?interval=1m&range=1d&includePrePost=false",
        )
        """Yahoo Finance v8 chart API URL. {sym} replaced at runtime."""

        self.QUOTES_CACHE_PATH: Path = self.DB_DIR / "quotes_cache.json"
        """Path to quotes cache JSON file."""

    # ── Derived ─────────────────────────────────────────────────────

    @property
    def FASTAPI_DOCS_KWARGS(self) -> dict:
        """FastAPI constructor kwargs for doc control."""
        if self.ENABLE_API_DOCS:
            return {}
        return {"docs_url": None, "redoc_url": None}


# Singleton
settings = Settings()
