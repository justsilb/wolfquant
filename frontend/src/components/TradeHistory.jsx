import React, { useState } from 'react';

const PER_PAGE = 10;

export default function TradeHistory({ trades = [] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(trades.length / PER_PAGE));
  const start = page * PER_PAGE;
  const pageTrades = trades.slice(start, start + PER_PAGE);

  if (trades.length === 0) {
    return (
      <div className="card trades-card">
        <h3 className="card-title">Recent Trades</h3>
        <div className="card-empty">No trades yet</div>
      </div>
    );
  }

  return (
    <div className="card trades-card">
      <h3 className="card-title">Recent Trades</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Symbol</th>
              <th>Side</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Realized P&L</th>
            </tr>
          </thead>
          <tbody>
            {pageTrades.map((trade, i) => {
              const side = (trade.side || 'BUY').toUpperCase();
              const timeStr = trade.time
                ? new Date(trade.time).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : trade.timestamp
                  ? new Date(trade.timestamp).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—';

              const qty = trade.qty != null ? trade.qty : trade.quantity;
              const qtyDisplay = typeof qty === 'number'
                ? (qty % 1 === 0 ? qty : qty.toFixed(2))
                : '—';

              return (
                <tr key={trade.id || trade.trade_id || i}>
                  <td className="mono time-cell">{timeStr}</td>
                  <td className="sym-cell">{trade.symbol}</td>
                  <td>
                    <span className={`side-badge ${side === 'BUY' ? 'buy' : 'sell'}`}>
                      {side}
                    </span>
                  </td>
                  <td>{qtyDisplay}</td>
                  <td className="mono">${(trade.price || 0).toFixed(2)}</td>
                  <td className={`mono ${(trade.pl || trade.pnl || 0) >= 0 ? 'up' : 'down'}`}>
                    {trade.pl != null || trade.pnl != null
                      ? `$${(trade.pl || trade.pnl || 0).toFixed(2)}`
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="page-btn"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Prev
          </button>
          <span className="page-info">
            Page {page + 1} of {totalPages} ({trades.length} trades)
          </span>
          <button
            className="page-btn"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
