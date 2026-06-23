import React from 'react';

function MetricCard({ label, value, sub, color, compact, tooltip }) {
  return (
    <div className={`metric-card ${compact ? 'compact' : ''}`} title={tooltip || ''}>
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${color || ''}`}>{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

const fmt = (v, decimals = 2) =>
  v != null ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—';

export default function PortfolioCards({ trader }) {
  const s = trader?.summary;
  if (!s) {
    return <div className="portfolio-cards"><div className="card">Loading metrics...</div></div>;
  }

  const pnlColor = (v) => v >= 0 ? 'up' : 'down';
  const thresholdColor = (v, good) => v == null ? '' : good ? 'up' : 'down';

  const dayUp = (s.day_pnl ?? 0) >= 0;
  const totalUp = (s.total_pnl ?? 0) >= 0;
  const alphaUp = (s.alpha_pct ?? 0) >= 0;

  return (
    <>
      {/* ROW 1 — Performance + SPY benchmark */}
      <div className="portfolio-cards">
        <MetricCard label="Portfolio" value={`$${fmt(s.portfolio)}`}
          sub={s.positions_count > 0 ? `${s.positions_count} position${s.positions_count !== 1 ? 's' : ''}` : 'All cash'}
          tooltip={`Total account value: $${fmt(s.portfolio)} = $${fmt(s.cash)} cash + $${fmt(s.equity)} equity across ${s.positions_count} positions. Sourced from latest portfolio snapshot + live quotes.`} />
        <MetricCard label="Day P&L" value={s.day_pnl != null ? `${dayUp ? '+' : ''}$${fmt(Math.abs(s.day_pnl))}` : '—'}
          sub={s.trades_today > 0 ? `${s.trades_today} trade${s.trades_today !== 1 ? 's' : ''} today` : 'No closes today'}
          color={s.day_pnl != null ? pnlColor(s.day_pnl) : ''}
          tooltip={s.day_pnl != null
            ? `Today's realized P&L: $${s.day_pnl != null ? fmt(s.day_pnl) : '0'} from ${s.trades_today} closed trade${s.trades_today !== 1 ? 's' : ''}. Computed via FIFO matching of buys→sells. Does NOT include deposits, withdrawals, or unsettled cash.`
            : 'No trades closed today. Day P&L is computed from today\'s sell trades only — never from portfolio snapshot deltas (which include deposits).'} />
        <MetricCard label="SPY" value={s.spy_change_pct != null ? `${fmt(s.spy_change_pct)}%` : `$${fmt(s.spy_price)}`}
          sub={s.spy_change_pct != null ? `$${fmt(s.spy_price)}` : 'Benchmark'}
          tooltip={`S&P 500 ETF benchmark. ${s.spy_change_pct != null ? `Change: ${fmt(s.spy_change_pct)}% from previous close ($${fmt(s.spy_price)}). ` : ''}Compare your portfolio return against this to measure alpha. Sourced from live quote cache, fallback to yesterday's snapshot close.`} />
        <MetricCard label="Total P&L" value={`${totalUp ? '+' : ''}$${fmt(Math.abs(s.total_pnl))}`}
          sub="Portfolio − deposits" color={pnlColor(s.total_pnl)}
          tooltip={`Cumulative trading P&L: $${fmt(s.portfolio)} (portfolio) − $4,000.00 (total deposits) = $${fmt(s.total_pnl)}. Does NOT count deposits as performance. Verifiable: check your Robinhood account value minus what you put in.`} />
        <MetricCard label="Win Rate" value={s.win_rate != null ? `${fmt(s.win_rate, 1)}%` : '—'}
          sub={`${s.total_closed_trades} closed`}
          color={s.win_rate != null ? thresholdColor(s.win_rate, s.win_rate >= 50) : ''}
          tooltip={`${s.win_rate != null ? `${fmt(s.win_rate, 1)}% of ${s.total_closed_trades} closed trades were profitable. ` : ''}Warning: win rate alone is vanity — a 63% win rate with \$18 avg loss and \$6 avg win still loses money. Always check Profit Factor and Avg Win/Loss.`} />
        <MetricCard label="Profit Factor" value={s.profit_factor != null ? fmt(s.profit_factor) : '—'}
          sub="Gross wins ÷ losses"
          color={s.profit_factor != null ? thresholdColor(s.profit_factor, s.profit_factor >= 1.0) : ''}
          tooltip={s.profit_factor != null
            ? `Gross profits ÷ gross losses = ${fmt(s.profit_factor)}. ${s.profit_factor >= 1.5 ? 'Strong — you earn 1.5× more than you lose.' : s.profit_factor >= 1.0 ? 'Break-even territory. Below 1.5 needs improvement.' : 'BELOW 1.0 — you are losing more money than you make. Your average loss ($${fmt(s.avg_loss || 0)}) is larger than your average win ($${fmt(s.avg_win || 0)}).'}`
            : 'Not enough closed trades to compute. Profit Factor = total dollars won ÷ total dollars lost.'} />
      </div>

      {/* ROW 2 — Context & Risk */}
      <div className="portfolio-cards">
        <MetricCard label="Buying Power" value={`$${fmt(s.cash)}`}
          sub={s.equity > 0 ? `$${fmt(s.equity)} invested` : 'Available'} compact
          tooltip={`Available buying power: $${fmt(s.cash)}. ${s.equity > 0 ? `$${fmt(s.equity)} currently invested in ${s.positions_count} position${s.positions_count !== 1 ? 's' : ''}.` : 'All cash — no positions open.'} From latest portfolio snapshot.`} />
        <MetricCard label="Max Drawdown" value={s.max_drawdown != null ? `${fmt(s.max_drawdown)}%` : '—'}
          sub="Peak-to-trough"
          color={s.max_drawdown != null ? thresholdColor(s.max_drawdown, s.max_drawdown <= 5) : ''} compact
          tooltip={`Largest peak-to-trough decline: ${fmt(s.max_drawdown)}%. This is the worst your portfolio has ever been down from a previous high. ${s.max_drawdown <= 5 ? 'Well-managed risk.' : s.max_drawdown <= 15 ? 'Elevated — consider reducing position sizes.' : 'DANGER — severe drawdown. Cut position sizes immediately.'} Computed from all portfolio snapshots.`} />
        <MetricCard label="Fees Paid" value={s.total_fees != null ? `$${fmt(Math.abs(s.total_fees))}` : '—'}
          sub="Lifetime SEC/FINRA/TAF" compact
          color={s.total_fees > 0 ? 'down' : ''}
          tooltip={`Total fees paid: $${fmt(s.total_fees || 0)}. Includes SEC, FINRA, and TAF regulatory fees on sell orders. These are real costs that reduce net P&L — factor them into position sizing. Sourced from the trades.fees column in the warehouse.`} />
        <MetricCard label="VXX" value={`$${fmt(s.vxx_price)}`}
          sub={s.vxx_price >= 20 ? '⚠️ Risk-off' : s.vxx_price >= 15 ? 'Caution' : 'Risk-on'} compact
          tooltip={`Volatility futures ETF — fear gauge. $${fmt(s.vxx_price)} = ${s.vxx_price >= 20 ? 'risk-off (high fear — tighten stops, reduce size).' : s.vxx_price >= 15 ? 'elevated caution (normal to slightly fearful).' : 'risk-on (low fear — normal sizing).'} Not a trading signal, but context for position sizing. From live quote cache.`} />
        <MetricCard label="Avg Win / Loss" value={s.avg_wl_ratio != null ? `${fmt(s.avg_wl_ratio)}x` : '—'}
          sub={s.avg_win != null ? `$${fmt(s.avg_win)} / $${fmt(s.avg_loss)}` : '—'}
          color={s.avg_wl_ratio != null ? thresholdColor(s.avg_wl_ratio, s.avg_wl_ratio >= 1.0) : ''} compact
          tooltip={s.avg_wl_ratio != null
            ? `Average winning trade: $${fmt(s.avg_win || 0)}. Average losing trade: $${fmt(s.avg_loss || 0)}. Ratio: ${fmt(s.avg_wl_ratio)}×. ${s.avg_wl_ratio >= 2.0 ? 'Excellent — wins are 2×+ bigger than losses.' : s.avg_wl_ratio >= 1.0 ? 'Marginal — wins barely exceed losses.' : 'LOSING — your average loss is bigger than your average win. Fix: cut losers faster or let winners run longer.'}`
            : 'Not enough closed trades to compute. Shows the ratio of your average winning trade size to average losing trade size. Above 2.0× is professional-grade.'} />
        <MetricCard label="Alpha vs SPY" value={s.alpha_pct != null ? `${alphaUp ? '+' : ''}${fmt(s.alpha_pct)}%` : '—'}
          sub="Portfolio − SPY return" color={alphaUp ? 'up' : 'down'} compact
          tooltip={s.alpha_pct != null
            ? `Your portfolio return minus SPY return = ${fmt(s.alpha_pct)}% alpha. ${alphaUp ? 'You are beating the market.' : 'The market is beating you.'} If this is negative, you'd be better off just buying SPY. Computed from first→latest portfolio snapshot vs SPY over the same period.`
            : 'Not enough data to compute. Alpha = your portfolio % return minus SPY % return. Positive means you\'re adding value beyond just holding the index.'} />
      </div>
    </>
  );
}
