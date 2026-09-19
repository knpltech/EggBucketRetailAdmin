import React, { useMemo } from 'react';
import { 
  ResponsiveContainer, BarChart, Bar, 
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend 
} from 'recharts';
import GraphContainer from './GraphContainer';

const COLORS = ['#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];

const PrimeVsRegularGraphs = ({ graphs }) => {
  const combinedRevenueData = useMemo(() => {
    if (!graphs) return [];
    const primeMap = new Map((graphs.primeCustomerRevenue || []).map(item => [item.date, item.revenue || 0]));
    const regularMap = new Map((graphs.regularCustomerRevenue || []).map(item => [item.date, item.revenue || 0]));

    const dateSet = new Set([
      ...(graphs.primeCustomerRevenue || []).map(i => i.date),
      ...(graphs.regularCustomerRevenue || []).map(i => i.date)
    ]);

    return Array.from(dateSet).sort().map(date => ({
      date,
      primeRevenue: primeMap.get(date) ?? 0,
      regularRevenue: regularMap.get(date) ?? 0
    }));
  }, [graphs?.primeCustomerRevenue, graphs?.regularCustomerRevenue]);

  const hasRevenueData = useMemo(() => {
    return combinedRevenueData.some(d => (d.primeRevenue || 0) > 0 || (d.regularRevenue || 0) > 0);
  }, [combinedRevenueData]);

  if (!graphs) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Prime vs Regular Customer Revenue Bar Chart */}
      <GraphContainer title="Prime vs Regular Customer Revenue">
        {hasRevenueData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={combinedRevenueData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis 
                tick={{ fill: '#64748b', fontSize: 12 }} 
                axisLine={false} 
                tickLine={false} 
                tickFormatter={(val) => `₹${val.toLocaleString()}`} 
                domain={[0, (dataMax) => (dataMax > 0 ? Math.ceil(dataMax * 1.15) : 100)]}
              />
              <Tooltip 
                formatter={(value) => `₹${Number(value).toLocaleString()}`} 
                cursor={{ fill: '#f8fafc' }} 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="primeRevenue" name="Prime Customer Revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={20} />
              <Bar dataKey="regularRevenue" name="Regular Customer Revenue" fill="#64748b" radius={[4, 4, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
            <p className="text-sm font-medium text-gray-500">No revenue data recorded for this date range</p>
            <p className="text-xs text-gray-400 mt-1">Please select a completed week (e.g. 13-09-2026 to 19-09-2026)</p>
          </div>
        )}
      </GraphContainer>

      {/* Customer Type Distribution Pie Chart */}
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

      {/* Peak Frequency vs Weekly Frequency Bar Chart */}
      <GraphContainer title="Peak Frequency vs Weekly Frequency">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={graphs.peakFrequencyComparison} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="Expected" name="Peak Frequency" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
            <Bar dataKey="Actual" name="Weekly Frequency" fill="#14b8a6" radius={[4, 4, 0, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </GraphContainer>
    </div>
  );
};

export default React.memo(PrimeVsRegularGraphs);
