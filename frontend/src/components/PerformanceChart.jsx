import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import useApi from '../hooks/useApi';

const RANGES = { '1D': 1, '7D': 7, '30D': 30, 'ALL': 365 };

// Portfolio = green bold line. Benchmarks = dotted lines, muted colors.
const SERIES = [
  { key: 'portfolio', stroke: '#22c55e', label: 'Portfolio', width: 3, dash: undefined },
  { key: 'spy',       stroke: '#60a5fa', label: 'SPY',       width: 1.5, dash: '4 4' },
  { key: 'vxx',       stroke: '#f87171', label: 'VXX',       width: 1.5, dash: '2 4' },
];

const fmtPercent = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const fmtDollar = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PerformanceChart() {
  const [range, setRange] = useState('1D');
  const days = RANGES[range] || 7;
  const { data, loading } = useApi(`/api/performance?days=${days}`, { interval: 60 });

  const normalized = useMemo(() => {
    const points = data?.points || [];
    if (points.length === 0) return [];

    const base = {
      portfolio: points[0].portfolio,
      spy: points[0].spy,
      vxx: points[0].vxx,
    };
    return points.map((d) => ({
      timestamp: d.timestamp,
      portfolio: base.portfolio ? ((d.portfolio - base.portfolio) / base.portfolio) * 100 : 0,
      spy:       base.spy       ? ((d.spy - base.spy) / base.spy) * 100             : null,
      vxx:       base.vxx       ? ((d.vxx - base.vxx) / base.vxx) * 100             : null,
      _portfolio: d.portfolio,
      _spy:       d.spy,
      _vxx:       d.vxx,
    }));
  }, [data, range]);

  const xTickFormatter = useMemo(() => {
    if (range === '1D') {
      return (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    if (range === 'ALL') {
      return (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
    return (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, [range]);

  // Generate tick marks: hourly for 1D, daily for 7D, auto for 30D
  const xTicks = useMemo(() => {
    if (normalized.length === 0) return undefined;
    if (range === '1D') {
      // One tick per hour — pick the first data point of each hour
      const ticks = [];
      let lastHour = null;
      for (const d of normalized) {
        const h = new Date(d.timestamp).getHours();
        if (h !== lastHour) {
          ticks.push(d.timestamp);
          lastHour = h;
        }
      }
      return ticks;
    }
    if (range === '7D') {
      const seen = new Set();
      return normalized
        .map((d) => {
          const day = new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          if (seen.has(day)) return null;
          seen.add(day);
          return d.timestamp;
        })
        .filter(Boolean);
    }
    if (range === 'ALL') {
      const seen = new Set();
      return normalized
        .map((d) => {
          const month = new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
          if (seen.has(month)) return null;
          seen.add(month);
          return d.timestamp;
        })
        .filter(Boolean);
    }
    return undefined; // 30D: let Recharts auto-spread
  }, [range, normalized]);

  if (loading) {
    return (
      <div className="card chart-card">
        <h3 className="card-title">Portfolio Performance</h3>
        <div className="card-empty">Loading...</div>
      </div>
    );
  }

  if (normalized.length === 0) {
    return (
      <div className="card chart-card">
        <h3 className="card-title">Portfolio Performance</h3>
        <div className="card-empty">No performance data yet</div>
      </div>
    );
  }

  return (
    <div className="card chart-card">
      <div className="chart-header">
        <h3 className="card-title">Portfolio Performance</h3>
        <div className="chart-toggles">
          {Object.keys(RANGES).map((r) => (
            <button
              key={r}
              className={`toggle-btn ${range === r ? 'active' : ''}`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={normalized} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
          <XAxis
            dataKey="timestamp"
            tick={{ fill: '#6b6e85', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#1e1e3a' }}
            tickFormatter={xTickFormatter}
            ticks={xTicks}
          />
          <YAxis
            tick={{ fill: '#6b6e85', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#1e1e3a' }}
            tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f0f1a',
              border: '1px solid #222240',
              borderRadius: '8px',
              color: '#e4e4ec',
            }}
            formatter={(value, name, props) => {
              const rawKey = `_${name}`;
              const raw = props.payload[rawKey];
              const pct = fmtPercent(value);
              return [
                raw != null ? `${fmtDollar(raw)} (${pct})` : pct,
                name,
              ];
            }}
            labelFormatter={(d) => new Date(d).toLocaleString('en-US', {
              month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          />
          <Legend
            wrapperStyle={{ color: '#6b6e85', fontSize: 12, paddingTop: 8 }}
          />
          {SERIES.map((s) => (
            <Line
              key={s.key}
              type="linear"
              dataKey={s.key}
              name={s.label}
              stroke={s.stroke}
              strokeWidth={s.width}
              strokeDasharray={s.dash}
              dot={false}
              activeDot={{ r: 3, fill: s.stroke, stroke: '#0f0f1a' }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
