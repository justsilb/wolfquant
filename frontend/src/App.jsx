import React from 'react';
import useApi from './hooks/useApi';
import useWebSocket from './hooks/useWebSocket';
import Header from './components/Header';
import TickerTape from './components/TickerTape';
import PortfolioCards from './components/PortfolioCards';
import PortfolioPerformance from './components/PerformanceChart';
import StockPerformance from './components/StockPerformance';
import PositionsTable from './components/PositionsTable';
import TradeHistory from './components/TradeHistory';

// ET market hours check
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

export default function App() {
  const { data: dashboard, loading, error } = useApi('/api/dashboard', { interval: 15 });
  const { quotes, connected: wsConnected, ageSec: quotesAge } = useWebSocket('/ws/quotes');

  const marketOpen = isMarketOpen();

  if (loading && !dashboard) {
    return (
      <div className="app">
        <div className="loading-screen">
          <span className="logo">WolfQuant</span>
          <div className="spinner" />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="app">
        <div className="loading-screen">
          <span className="logo">WolfQuant</span>
          <p className="error-text">Failed to load — retrying automatically...</p>
        </div>
      </div>
    );
  }

  const trader = dashboard?.trader || dashboard || {};
  const perfData = dashboard?.performance || [];
  const trades = dashboard?.trades || [];

  return (
    <div className="app">
      <Header
        quotesAge={quotesAge}
        wsConnected={wsConnected}
        marketOpen={marketOpen}
      />
      <TickerTape quotes={quotes} />
      <main className="main-content">
        <PortfolioCards trader={trader} perfData={perfData} />

        <div className="two-col">
          <PortfolioPerformance />
          <StockPerformance />
        </div>

        <PositionsTable
          positions={trader.positions || []}
          quotes={quotes}
        />

        <TradeHistory trades={trades} />
      </main>
    </div>
  );
}
