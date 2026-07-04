import React from 'react';
import { Filter, Calendar, Users, MapPin, Search, RotateCcw, Building2 } from 'lucide-react';

const AnalyticsFilters = ({ filters, setFilters, onApply, onReset }) => {
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
      <div className="flex items-center mb-4">
        <Filter className="w-5 h-5 text-gray-500 mr-2" />
        <h3 className="text-lg font-semibold text-gray-800">Dashboard Filters</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        
        {/* Module Type Dropdown */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 font-medium mb-1 uppercase tracking-wider">Analytics Module</label>
          <select 
            name="moduleType" 
            value={filters.moduleType} 
            onChange={handleFilterChange}
            className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 outline-none"
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
              className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5 outline-none" 
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
              className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5 outline-none" 
            />
          </div>
        </div>





      </div>

      <div className="flex items-center justify-end space-x-4 border-t border-gray-100 pt-4">
        <button 
          onClick={onReset}
          className="flex items-center px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset Filters
        </button>
        <button 
          onClick={onApply}
          className="flex items-center px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Search className="w-4 h-4 mr-2" />
          Apply Filters
        </button>
      </div>
    </div>
  );
};

export default AnalyticsFilters;
