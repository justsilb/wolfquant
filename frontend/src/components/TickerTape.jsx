import React, { useRef, useEffect, useMemo } from 'react';

export default function TickerTape({ quotes = {} }) {
  const containerRef = useRef(null);
  const priceRefs = useRef({});

  // Sort symbols by abs(change_pct) descending
  const symbols = useMemo(() => {
    return Object.entries(quotes)
      .sort(([, a], [, b]) => Math.abs(b.change_pct || 0) - Math.abs(a.change_pct || 0))
      .map(([sym]) => sym);
  }, [quotes]);

  // Update prices in-place via refs to preserve animation
  useEffect(() => {
    symbols.forEach((sym) => {
      const quote = quotes[sym];
      if (quote && priceRefs.current[sym]) {
        const el = priceRefs.current[sym];
        el.textContent = formatPrice(quote.price);
        const changeEl = el.parentElement?.querySelector('.ticker-change');
        if (changeEl) {
          const pct = quote.change_pct || 0;
          changeEl.textContent = `${pct >= 0 ? '▲' : '▼'}${Math.abs(pct).toFixed(2)}%`;
          changeEl.className = `ticker-change ${pct >= 0 ? 'up' : 'down'}`;
        }
      }
    });
  }, [quotes, symbols]);

  if (symbols.length === 0) {
    return (
      <div className="ticker-tape">
        <div className="ticker-placeholder">Waiting for quotes...</div>
      </div>
    );
  }

  // Render items twice for seamless loop
  const items = [];
  for (let i = 0; i < 2; i++) {
    symbols.forEach((sym) => {
      const quote = quotes[sym];
      items.push({ sym, quote, key: `${sym}-${i}` });
    });
  }

  return (
    <div className="ticker-tape" ref={containerRef}>
      <div className="ticker-track">
        {items.map(({ sym, quote, key }) => (
          <div className="ticker-item" key={key}>
            <span className="ticker-symbol">{sym}</span>
            <span
              className="ticker-price"
              ref={(el) => {
                priceRefs.current[sym] = el;
              }}
            >
              {formatPrice(quote?.price)}
            </span>
            <span className={`ticker-change ${(quote?.change_pct || 0) >= 0 ? 'up' : 'down'}`}>
              {(quote?.change_pct || 0) >= 0 ? '▲' : '▼'}
              {Math.abs(quote?.change_pct || 0).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatPrice(price) {
  if (price == null) return '--.--';
  const num = Number(price);
  if (num >= 1) return num.toFixed(2);
  return num.toFixed(4);
}
