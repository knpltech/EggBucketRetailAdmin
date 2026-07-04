import React from 'react';
import { 
  Users, UserPlus, UserCheck, Star, 
  DollarSign, Package, CreditCard, Activity,
  Truck, CheckCircle, Clock, AlertTriangle,
  Wallet, Percent, ArrowDownToLine, ArrowUpRight,
  TrendingUp, RefreshCcw
} from 'lucide-react';

const KPICard = ({ title, value, icon: Icon, colorClass, subtitle }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center hover:shadow-md transition-shadow">
    <div className={`p-3 rounded-xl ${colorClass} mr-4`}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <p className="text-gray-500 text-sm font-medium mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  </div>
);

const AnalyticsKPICards = ({ moduleType, kpis }) => {
  if (!kpis) return null;

  switch (moduleType) {
    case 'customer':
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard title="Total Customers" value={kpis.totalCustomers || 0} icon={Users} colorClass="bg-gradient-to-r from-blue-500 to-blue-600" />
          <KPICard title="New Customers" value={kpis.newCustomers || 0} icon={UserPlus} colorClass="bg-gradient-to-r from-green-400 to-green-500" />
          <KPICard title="Active Customers" value={kpis.activeCustomers || 0} icon={UserCheck} colorClass="bg-gradient-to-r from-emerald-500 to-teal-500" />
          <KPICard title="Prime Customers" value={kpis.primeCustomers || 0} icon={Star} colorClass="bg-gradient-to-r from-yellow-400 to-orange-400" />
        </div>
      );
    case 'sales':
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard title="Total Collection" value={`₹${kpis.totalCollection || 0}`} icon={DollarSign} colorClass="bg-gradient-to-r from-emerald-400 to-green-500" />
          <KPICard title="Total Trays Sold" value={kpis.totalTraysSold || 0} icon={Package} colorClass="bg-gradient-to-r from-purple-500 to-indigo-500" />
          <KPICard title="Avg Revenue / Customer" value={`₹${kpis.averageRevenuePerCustomer || 0}`} icon={CreditCard} colorClass="bg-gradient-to-r from-blue-400 to-blue-500" />
          <KPICard title="Avg Trays / Customer" value={kpis.averageTraysPerCustomer || 0} icon={Activity} colorClass="bg-gradient-to-r from-orange-400 to-red-500" />
        </div>
      );
    case 'delivery':
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard title="Delivered" value={kpis.delivered || 0} icon={CheckCircle} colorClass="bg-gradient-to-r from-green-500 to-emerald-600" />
          <KPICard title="Reached" value={kpis.reached || 0} icon={Truck} colorClass="bg-gradient-to-r from-yellow-400 to-yellow-500" />
          <KPICard title="Pending" value={kpis.pending || 0} icon={Clock} colorClass="bg-gradient-to-r from-red-400 to-red-500" />
          <KPICard title="Delivery Success %" value={`${kpis.deliverySuccessPercent || 0}%`} icon={Percent} colorClass="bg-gradient-to-r from-blue-500 to-indigo-500" />
        </div>
      );
    case 'payment':
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard title="Cash Collection" value={`₹${kpis.cashCollection || 0}`} icon={Wallet} colorClass="bg-gradient-to-r from-green-400 to-green-500" />
          <KPICard title="UPI Collection" value={`₹${kpis.upiCollection || 0}`} icon={CreditCard} colorClass="bg-gradient-to-r from-blue-400 to-blue-500" />
          <KPICard title="Cash %" value={`${kpis.cashPercent || 0}%`} icon={Percent} colorClass="bg-gradient-to-r from-teal-400 to-teal-500" />
          <KPICard title="UPI %" value={`${kpis.upiPercent || 0}%`} icon={Percent} colorClass="bg-gradient-to-r from-indigo-400 to-indigo-500" />
        </div>
      );
    case 'inventory':
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard title="Total Damage" value={kpis.totalDamage || 0} icon={AlertTriangle} colorClass="bg-gradient-to-r from-red-500 to-rose-500" />
          <KPICard title="Damage %" value={`${kpis.damagePercent || 0}%`} icon={Percent} colorClass="bg-gradient-to-r from-orange-400 to-orange-500" />
          <KPICard title="Total Load" value={kpis.totalLoad || 0} icon={ArrowUpRight} colorClass="bg-gradient-to-r from-blue-500 to-indigo-500" />
          <KPICard title="Total Return" value={kpis.totalReturn || 0} icon={ArrowDownToLine} colorClass="bg-gradient-to-r from-gray-500 to-gray-600" />
        </div>
      );
    case 'customer-conversion':
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <KPICard title="Revenue Per Customer" value={`₹${kpis.revenuePerCustomer || 0}`} icon={TrendingUp} colorClass="bg-gradient-to-r from-emerald-500 to-green-600" />
          <KPICard title="Trays Per Customer" value={kpis.traysPerCustomer || 0} icon={Package} colorClass="bg-gradient-to-r from-purple-500 to-fuchsia-500" />
          <KPICard title="Repeat Customers" value={kpis.repeatCustomers || 0} icon={RefreshCcw} colorClass="bg-gradient-to-r from-blue-400 to-blue-500" />
        </div>
      );
    default:
      return null;
  }
};

export default React.memo(AnalyticsKPICards);
