import React from 'react';

export default function PositionsTable({ positions = [], quotes = {} }) {
  if (positions.length === 0) {
    return (
      <div className="card positions-card">
        <h3 className="card-title">Open Positions</h3>
        <div className="card-empty">No open positions</div>
      </div>
    );
  }

  return (
    <div className="card positions-card">
      <h3 className="card-title">Open Positions</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Shares</th>
              <th>Cost</th>
              <th>Price</th>
              <th>Mkt Value</th>
              <th>P&L %</th>
              <th>Stop</th>
              <th>Beta</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const quote = quotes[pos.symbol] || {};
              const currentPrice = quote.price || pos.current_price || pos.cost || 0;
              const mktValue = currentPrice * (pos.shares || 0);
              const plPct = pos.cost ? ((currentPrice - pos.cost) / pos.cost) * 100 : 0;

              return (
                <tr key={pos.symbol}>
                  <td className="sym-cell">{pos.symbol}</td>
                  <td>{pos.shares}</td>
                  <td className="mono">${(pos.cost || 0).toFixed(2)}</td>
                  <td className={`mono ${quote.price ? 'live-price' : ''}`}>
                    ${currentPrice.toFixed(2)}
                  </td>
                  <td className="mono">${mktValue.toFixed(2)}</td>
                  <td className={`mono ${plPct >= 0 ? 'up' : 'down'}`}>
                    {plPct >= 0 ? '+' : ''}{plPct.toFixed(2)}%
                  </td>
                  <td className="mono">
                    {pos.stop_loss ? `$${pos.stop_loss.toFixed(2)}` : '—'}
                  </td>
                  <td>
                    <span className={`beta-badge ${(pos.beta_class || 'STD').toLowerCase()}`}>
                      {pos.beta_class || 'STD'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
