import React, { useMemo } from 'react';
import { 
  ResponsiveContainer, LineChart, Line, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend 
} from 'recharts';
import GraphContainer from './GraphContainer';

const CustomerConversionGraphs = ({ graphs }) => {
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

  if (!graphs) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      
      <GraphContainer title="Revenue Per Customer">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={graphs.revenuePerCustomerTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val}`} />
            <Tooltip formatter={(value) => `₹${value}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Line type="monotone" dataKey="value" name="Revenue/Customer" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </GraphContainer>

      <GraphContainer title="Trays Per Customer">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={graphs.traysPerCustomerTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Line type="monotone" dataKey="value" name="Trays/Customer" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </GraphContainer>

      <GraphContainer title="Prime vs Regular Customer Revenue">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={combinedRevenueData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val}`} />
            <Tooltip formatter={(value) => `₹${value}`} cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="primeRevenue" name="Prime Customer Revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={20} />
            <Bar dataKey="regularRevenue" name="Regular Customer Revenue" fill="#64748b" radius={[4, 4, 0, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </GraphContainer>

      <GraphContainer title="Repeat Customers">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={graphs.repeatCustomersTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Line type="monotone" dataKey="count" name="Repeat Customers" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </GraphContainer>



    </div>
  );
};

export default React.memo(CustomerConversionGraphs);
