import React, { useState } from 'react';
import { Filter, Calendar, RotateCcw, Search, Sparkles } from 'lucide-react';

const formatDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return date.toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
};

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
];

const getPresetDates = (presetKey) => {
  const now = new Date();
  
  switch (presetKey) {
    case 'today': {
      const todayStr = formatDate(now);
      return { startDate: todayStr, endDate: todayStr };
    }
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = formatDate(y);
      return { startDate: yStr, endDate: yStr };
    }
    case 'this_week': {
      // Monday of current week to today
      const d = new Date(now);
      const day = d.getDay();
      const diff = (day + 6) % 7; // days since Monday
      const monday = new Date(d);
      monday.setDate(d.getDate() - diff);
      return { startDate: formatDate(monday), endDate: formatDate(now) };
    }
    case 'last_week': {
      // Previous week Monday to Sunday
      const d = new Date(now);
      const day = d.getDay();
      const diff = (day + 6) % 7;
      const lastMonday = new Date(d);
      lastMonday.setDate(d.getDate() - diff - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { startDate: formatDate(lastMonday), endDate: formatDate(lastSunday) };
    }
    case 'this_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: formatDate(firstDay), endDate: formatDate(now) };
    }
    case 'last_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: formatDate(firstDay), endDate: formatDate(lastDay) };
    }
    default:
      return null;
  }
};

const AnalyticsFilters = ({ filters, setFilters, onApply, onReset }) => {
  const [activePreset, setActivePreset] = useState(null);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    if (name === 'startDate' || name === 'endDate') {
      setActivePreset(null);
    }
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handlePresetClick = (presetKey) => {
    const dates = getPresetDates(presetKey);
    if (!dates) return;
    setActivePreset(presetKey);
    const updated = { ...filters, ...dates };
    setFilters(updated);
    if (onApply) onApply(updated);
  };

  const handleCustomReset = () => {
    setActivePreset(null);
    if (onReset) onReset();
  };

  return (
    <div className="bg-white p-5 md:p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center">
          <Filter className="w-5 h-5 text-gray-500 mr-2" />
          <h3 className="text-lg font-semibold text-gray-800">Dashboard Filters</h3>
        </div>

        {/* Quick presets pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((preset) => {
            const isActive = activePreset === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => handlePresetClick(preset.key)}
                className={`px-3 py-1.5 text-xs md:text-sm rounded-lg transition-all border font-medium cursor-pointer ${
                  isActive
                    ? 'bg-orange-500 border-orange-500 text-white shadow-sm ring-2 ring-orange-200'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        
        {/* Module Type Dropdown */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 font-medium mb-1 uppercase tracking-wider">Analytics Module</label>
          <select 
            name="moduleType" 
            value={filters.moduleType} 
            onChange={handleFilterChange}
            className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 outline-none transition-colors"
          >
            <option value="customer">Customer Analytics</option>
            <option value="sales">Sales Analytics</option>
            <option value="delivery">Delivery Operations</option>
            <option value="payment">Payment Analytics</option>
            <option value="inventory">Inventory & Supply Chain</option>
            <option value="customer-conversion">Customer Conversion</option>
          </select>
        </div>

        {/* Start Date */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 font-medium mb-1 uppercase tracking-wider">Start Date</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Calendar className="w-4 h-4 text-gray-500" />
            </div>
            <input 
              type="date" 
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
              className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5 outline-none transition-colors" 
            />
          </div>
        </div>

        {/* End Date */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 font-medium mb-1 uppercase tracking-wider">End Date</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Calendar className="w-4 h-4 text-gray-500" />
            </div>
            <input 
              type="date" 
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
              className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5 outline-none transition-colors" 
            />
          </div>
        </div>

      </div>

      <div className="flex items-center justify-end space-x-3 border-t border-gray-100 pt-4">
        <button 
          onClick={handleCustomReset}
          className="flex items-center px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset Filters
        </button>
        <button 
          onClick={() => onApply && onApply()}
          className="flex items-center px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
        >
          <Search className="w-4 h-4 mr-2" />
          Apply Filters
        </button>
      </div>
    </div>
  );
};

export default AnalyticsFilters;
