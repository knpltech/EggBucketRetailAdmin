import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { AlertCircle } from "lucide-react";
import { ADMIN_PATH } from "../../constant";

// Analytics Components
import AnalyticsFilters from "./AnalyticsFilters";
import AnalyticsKPICards from "./AnalyticsKPICards";
import CustomerGraphs from "./CustomerGraphs";
import SalesGraphs from "./SalesGraphs";
import DeliveryGraphs from "./DeliveryGraphs";
import PaymentGraphs from "./PaymentGraphs";
import InventoryGraphs from "./InventoryGraphs";
import CustomerConversionGraphs from "./CustomerConversionGraphs";

const getDateStringInTimeZone = (d = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return new Date().toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
};

const getSevenDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 6); // 7 days inclusive
  return getDateStringInTimeZone(d);
};

const BusinessStatistics = () => {
  const defaultFilters = {
    moduleType: "customer",
    startDate: getSevenDaysAgo(),
    endDate: getDateStringInTimeZone(),
    customerType: "ALL",
    agent: "ALL",
    outlet: "ALL",
    area: "ALL"
  };

  const [filters, setFilters] = useState(defaultFilters);
  const [data, setData] = useState({ kpis: null, graphs: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("authToken");
      const { moduleType, startDate, endDate, customerType, agent, outlet, area } = filters;
      
      const queryParams = new URLSearchParams({
        startDate,
        endDate,
        customerType,
        agent,
        outlet,
        area
      }).toString();

      const response = await axios.get(
        `${ADMIN_PATH}/analytics/${moduleType}?${queryParams}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setData({
          kpis: response.data.kpis,
          graphs: response.data.graphs
        });
      } else {
        setError("Failed to fetch analytics data");
      }
    } catch (err) {
      console.error("Error fetching analytics:", err);
      setError("An error occurred while fetching data.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [filters.moduleType]); // Fetch when moduleType changes automatically. Apply button used for other filters

  const handleApply = () => {
    fetchData();
  };

  const handleReset = () => {
    setFilters(defaultFilters);
    // fetchData will be called because moduleType might change back to "customer", 
    // but if it was already "customer", we need to call fetchData explicitly.
    if (filters.moduleType === "customer") {
       setTimeout(fetchData, 0); // let state update first
    }
  };

  const renderGraphs = () => {
    if (!data.graphs) return null;
    switch (filters.moduleType) {
      case "customer": return <CustomerGraphs graphs={data.graphs} />;
      case "sales": return <SalesGraphs graphs={data.graphs} />;
      case "delivery": return <DeliveryGraphs graphs={data.graphs} />;
      case "payment": return <PaymentGraphs graphs={data.graphs} />;
      case "inventory": return <InventoryGraphs graphs={data.graphs} />;
      case "customer-conversion": return <CustomerConversionGraphs graphs={data.graphs} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Business Analytics</h1>
          <p className="text-gray-500 mt-2">Comprehensive operational and financial insights</p>
        </div>

        {/* Filters */}
        <AnalyticsFilters 
          filters={filters} 
          setFilters={setFilters} 
          onApply={handleApply} 
          onReset={handleReset} 
        />

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
              <p className="mt-4 text-gray-600 font-medium">Crunching the numbers...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-white border border-red-200 shadow-sm rounded-xl text-center p-12">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Oops! Something went wrong</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button 
              onClick={fetchData}
              className="bg-red-600 hover:bg-red-700 text-white font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            <AnalyticsKPICards moduleType={filters.moduleType} kpis={data.kpis} />
            {renderGraphs()}
          </div>
        )}

      </div>
    </div>
  );
};

export default BusinessStatistics;
