import React, { useMemo } from 'react';
import { 
  ResponsiveContainer, LineChart, Line, BarChart, Bar, 
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend 
} from 'recharts';
import GraphContainer from './GraphContainer';

const PIE_COLORS = ['#22c55e', '#3b82f6'];
const CASH_COLOR = '#22c55e';
const UPI_COLOR = '#3b82f6';
const TOTAL_COLOR = '#6366f1';
const REVENUE_ZONE_COLOR = '#10b981';

const PaymentGraphs = ({ graphs }) => {
  const revenueByZoneData = useMemo(() => {
    if (graphs?.revenueByZone?.length) return graphs.revenueByZone;
    const zoneMap = new Map();
    (graphs?.cashCollectionByZone || []).forEach((item) => {
      zoneMap.set(item.name, (zoneMap.get(item.name) || 0) + (item.value || 0));
    });
    (graphs?.upiCollectionByZone || []).forEach((item) => {
      zoneMap.set(item.name, (zoneMap.get(item.name) || 0) + (item.value || 0));
    });
    return Array.from(zoneMap.entries()).map(([name, value]) => ({ name, value }));
  }, [graphs?.revenueByZone, graphs?.cashCollectionByZone, graphs?.upiCollectionByZone]);

  if (!graphs) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      
      <GraphContainer title="Cash vs UPI Trend">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={graphs.cashVsUpiTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val}`} />
            <Tooltip formatter={(value) => `₹${value}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="cash" name="Cash" stroke={CASH_COLOR} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="upi" name="UPI" stroke={UPI_COLOR} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </GraphContainer>

      <GraphContainer title="Payment Distribution">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={graphs.paymentDistribution} cx="50%" cy="50%" innerRadius={0} outerRadius={80} paddingAngle={2} dataKey="value">
              {graphs.paymentDistribution?.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => `₹${value}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
          </PieChart>
        </ResponsiveContainer>
      </GraphContainer>

      <GraphContainer title="Total Collection Trend">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={graphs.collectionTrend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val}`} />
            <Tooltip formatter={(value) => `₹${value}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Line type="monotone" dataKey="total" name="Total Collection" stroke={TOTAL_COLOR} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </GraphContainer>

      <GraphContainer title="Revenue by Zone">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={revenueByZoneData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val}`} />
            <Tooltip formatter={(value) => `₹${value}`} cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Bar dataKey="value" name="Revenue" fill={REVENUE_ZONE_COLOR} radius={[4, 4, 0, 0]} barSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </GraphContainer>

      <GraphContainer title="Collection by Agent">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={graphs.collectionByAgent} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
            <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val}`} />
            <YAxis dataKey="name" type="category" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
            <Tooltip formatter={(value) => `₹${value}`} cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
            <Bar dataKey="value" name="Total Collection" fill={TOTAL_COLOR} radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </GraphContainer>

    </div>
  );
};

export default React.memo(PaymentGraphs);
