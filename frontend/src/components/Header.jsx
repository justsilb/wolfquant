import React, { useState, useEffect } from 'react';

function isMarketOpen() {
  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = etFormatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const day = parts.find((p) => p.type === 'weekday')?.value || '';
  const timeDecimal = hour + minute / 60;

  if (day === 'Sat' || day === 'Sun') return false;
  return timeDecimal >= 9.5 && timeDecimal < 16;
}

export default function Header({ quotesAge = 0, wsConnected = false, marketOpen }) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }) + ' ET'
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const isOpen = marketOpen !== undefined ? marketOpen : isMarketOpen();

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="logo">WolfQuant</h1>
        <span className={`market-badge ${isOpen ? 'live' : 'closed'}`}>
          {isOpen ? '● LIVE' : '○ CLOSED'}
        </span>
        <span className="clock">{clock}</span>
      </div>
      <div className="header-right">
        <span className={`ws-dot ${wsConnected ? 'connected' : 'disconnected'}`} />
        <span className="ws-label">
          Live Quotes: {quotesAge}s
        </span>
      </div>
    </header>
  );
}
