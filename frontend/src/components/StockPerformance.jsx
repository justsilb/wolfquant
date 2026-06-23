import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import useApi from '../hooks/useApi';

const RANGES = { '1D': 1, '7D': 7, '30D': 30 };

export default function StockPerformance() {
  const [range, setRange] = useState('7D');
  const days = RANGES[range] || 7;
  const { data, loading } = useApi(`/api/stock-performance?days=${days}`, { interval: 60 });

  const allData = useMemo(() => {
    if (!data?.series) return [];
    // Merge all series into a single timeline keyed by timestamp
    const merged = {};
    for (const s of data.series) {
      for (const pt of s.data) {
        if (!merged[pt.timestamp]) merged[pt.timestamp] = { timestamp: pt.timestamp };
        merged[pt.timestamp][s.label] = pt.pct;
      }
    }
    return Object.values(merged).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [data]);

  const series = data?.series || [];

  const xTickFormatter = useMemo(() => {
    if (range === '1D') {
      return (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    return (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, [range]);

  if (loading && !data) {
    return (
      <div className="card chart-card">
        <h3 className="card-title">Stock Performance</h3>
        <div className="card-empty">Loading...</div>
      </div>
    );
  }

  return (
    <div className="card chart-card">
      <div className="chart-header">
        <h3 className="card-title">Stock Performance</h3>
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
      {series.length === 0 ? (
        <div className="card-empty">No closed trades in this period</div>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={allData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
            <XAxis
              dataKey="timestamp"
              tick={{ fill: '#6b6e85', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#1e1e3a' }}
              tickFormatter={xTickFormatter}
            />
            <YAxis
              tick={{ fill: '#6b6e85', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#1e1e3a' }}
              tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f0f1a',
                border: '1px solid #222240',
                borderRadius: '8px',
                color: '#e4e4ec',
              }}
              formatter={(value) => [`${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`]}
              labelFormatter={(d) => new Date(d).toLocaleString('en-US', {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            />
            <Legend wrapperStyle={{ color: '#6b6e85', fontSize: 11, paddingTop: 8 }} />
            {series.map((s) => (
              <Line
                key={s.label}
                type="linear"
                dataKey={s.label}
                name={s.label}
                stroke={s.color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: s.color, stroke: '#0f0f1a' }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
