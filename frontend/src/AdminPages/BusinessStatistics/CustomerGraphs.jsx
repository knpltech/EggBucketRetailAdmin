import React, { useState, useCallback, useMemo } from 'react';
import { 
  ResponsiveContainer, LineChart, Line, BarChart, Bar, 
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, Sector
} from 'recharts';
import GraphContainer from './GraphContainer';

const COLORS = ['#6366f1', '#3b82f6', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

// Extended 16-color palette for charts with many categories (e.g. Business Type)
const EXTENDED_COLORS = [
  '#6366f1', '#3b82f6', '#14b8a6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#0ea5e9', '#10b981', '#f97316',
  '#e11d48', '#7c3aed', '#06b6d4', '#84cc16', '#d946ef',
  '#64748b',
];

// Custom active shape renderer for the doughnut hover effect
const renderActiveShape = (props) => {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, percent, value,
  } = props;

  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#1e293b" fontSize={20} fontWeight="700">
        {value}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#64748b" fontSize={11}>
        {(percent * 100).toFixed(1)}%
      </text>
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius - 3}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))' }}
      />
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius - 3}
        outerRadius={innerRadius - 1}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.3}
      />
    </g>
  );
};

// Custom doughnut label — shows percentage on slices large enough to fit text
const renderDoughnutLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.05) return null; // hide labels for slices < 5%
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      fontSize={10} fontWeight="600" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

// Custom tooltip for doughnut charts
const DoughnutTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const total = payload[0]?.payload?.total || 1;
  const pct = ((value / total) * 100).toFixed(1);
  return (
    <div style={{
      background: '#1e293b', color: '#fff', padding: '10px 14px',
      borderRadius: 10, fontSize: 13, boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      lineHeight: 1.5,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{name}</div>
      <div style={{ display: 'flex', gap: 12, opacity: 0.9 }}>
        <span>{value} customers</span>
        <span style={{ color: '#94a3b8' }}>|</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
};

// Side legend component for charts with many items
const SideLegend = ({ data, colors, total }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', gap: 3,
    maxHeight: 240, overflowY: 'auto', paddingRight: 4,
    minWidth: 0, flex: '0 0 auto', width: '48%',
    scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent',
  }}>
    {data.map((entry, i) => {
      const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0.0';
      return (
        <div key={entry.name} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 8px', borderRadius: 8,
          transition: 'background 0.15s',
          cursor: 'default',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{
            width: 10, height: 10, borderRadius: 3, flexShrink: 0,
            background: colors[i % colors.length],
          }} />
          <span style={{
            fontSize: 12, color: '#334155', fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            flex: 1, minWidth: 0,
          }} title={entry.name}>
            {entry.name}
          </span>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>
            {entry.value}
          </span>
          <span style={{
            fontSize: 10, color: '#fff', fontWeight: 600, flexShrink: 0,
            background: colors[i % colors.length],
            borderRadius: 4, padding: '1px 6px',
            opacity: 0.85,
          }}>
            {pct}%
          </span>
        </div>
      );
    })}
  </div>
);

const CustomerGraphs = ({ graphs }) => {
  const [activeBizIndex, setActiveBizIndex] = useState(null);

  const onBizPieEnter = useCallback((_, index) => setActiveBizIndex(index), []);
  const onBizPieLeave = useCallback(() => setActiveBizIndex(null), []);

  // Pre-compute the total and attach it to each entry (needed by tooltip)
  const bizData = useMemo(() => {
    const raw = graphs?.businessTypeDistribution || [];
    const total = raw.reduce((s, e) => s + (e.value || 0), 0);
    return raw
      .map(e => ({ ...e, total }))
      .sort((a, b) => b.value - a.value); // largest first for visual clarity
  }, [graphs?.businessTypeDistribution]);

  const bizTotal = useMemo(() => bizData.reduce((s, e) => s + (e.value || 0), 0), [bizData]);

  if (!graphs) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      
      <GraphContainer title="Customer Category Trend (D0-D7)">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={graphs.categoryTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="D0" stroke={COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="D1" stroke={COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="D2" stroke={COLORS[2]} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="D3" stroke={COLORS[3]} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="D4" stroke={COLORS[4]} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="D5" stroke={COLORS[5]} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="D6" stroke={COLORS[6]} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="D7" stroke={COLORS[7]} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </GraphContainer>

      <GraphContainer title="Peak Frequency (Expected vs Actual)">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={graphs.peakFrequencyComparison} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="Expected" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
            <Bar dataKey="Actual" fill="#14b8a6" radius={[4, 4, 0, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </GraphContainer>

      <GraphContainer title="Sales Distribution">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={graphs.salesDistribution} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Bar dataKey="value" fill="#14b8a6" radius={[4, 4, 0, 0]} barSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </GraphContainer>

      <GraphContainer title="Customer Type Distribution">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={graphs.customerTypeDistribution} cx="50%" cy="50%" innerRadius={0} outerRadius={80} paddingAngle={2} dataKey="value">
              {graphs.customerTypeDistribution?.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
          </PieChart>
        </ResponsiveContainer>
      </GraphContainer>

      {/* ── Business Type Distribution — redesigned with side legend ── */}
      <GraphContainer title="Business Type Distribution">
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', gap: 4 }}>
          {/* Doughnut chart */}
          <div style={{ flex: '0 0 52%', height: '100%', position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={bizData}
                  cx="50%" cy="50%"
                  innerRadius="50%"
                  outerRadius="78%"
                  paddingAngle={2}
                  dataKey="value"
                  activeIndex={activeBizIndex}
                  activeShape={renderActiveShape}
                  onMouseEnter={onBizPieEnter}
                  onMouseLeave={onBizPieLeave}
                  label={activeBizIndex === null ? renderDoughnutLabel : undefined}
                  labelLine={false}
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  {bizData.map((entry, index) => (
                    <Cell
                      key={`biz-cell-${index}`}
                      fill={EXTENDED_COLORS[index % EXTENDED_COLORS.length]}
                      stroke="#fff"
                      strokeWidth={2}
                      style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                      opacity={activeBizIndex !== null && activeBizIndex !== index ? 0.4 : 1}
                    />
                  ))}
                </Pie>
                <Tooltip content={<DoughnutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label (only when no slice is hovered) */}
            {activeBizIndex === null && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center', pointerEvents: 'none',
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', lineHeight: 1.1 }}>
                  {bizTotal}
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, letterSpacing: 0.5 }}>
                  TOTAL
                </div>
              </div>
            )}
          </div>

          {/* Scrollable side legend */}
          <SideLegend data={bizData} colors={EXTENDED_COLORS} total={bizTotal} />
        </div>
      </GraphContainer>

      <GraphContainer title="Customer Growth Trend">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={graphs.customerGrowthTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="totalCustomers" name="Total Customers" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="newCustomers" name="New Customers" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </GraphContainer>

    </div>
  );
};

export default React.memo(CustomerGraphs);
