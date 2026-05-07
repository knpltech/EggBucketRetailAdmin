import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { ADMIN_PATH } from "../constant";
import { generateAISuggestion } from "../utils/aiSuggestionEngine";
import AISuggestionTable from "../components/AISuggestionTable";

const AISuggestions = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterOption, setFilterOption] = useState("ALL");
  const [sortOption, setSortOption] = useState("DEFAULT");

  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterOption, sortOption]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetching all customers (omitting pagination parameters)
      const response = await axios.get(`${ADMIN_PATH}/user-info`);
      let allCustomers = [];

      // Backend returns an array if no pagination is requested, or { customers: [...] } 
      if (Array.isArray(response.data)) {
        allCustomers = response.data;
      } else if (response.data && Array.isArray(response.data.customers)) {
        allCustomers = response.data.customers;
      }

      // 1. Filter out customers with missing todayOverride
      const validCustomers = allCustomers.filter((c) => c && c.todayOverride);

      // 2. Generate suggestions
      const processedData = validCustomers.map((customer) => {
        return {
          customer,
          suggestion: generateAISuggestion(customer),
        };
      });

      // 3. Sort by: 1. Highest AI confidence, 2. Priority customers first
      processedData.sort((a, b) => {
        if (b.suggestion.confidence !== a.suggestion.confidence) {
          return b.suggestion.confidence - a.suggestion.confidence;
        }
        const priorityA = a.customer.priority || "P0";
        const priorityB = b.customer.priority || "P0";
        // P1 should come before P0, so string descending works if formats are P0, P1...
        return priorityB.localeCompare(priorityA);
      });

      setCustomers(processedData);
    } catch (err) {
      console.error("Error fetching customers for AI suggestions:", err);
      setError("Failed to load AI suggestions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    return customers.filter((item) => {
      // Search
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        (item.customer.name && item.customer.name.toLowerCase().includes(searchLower)) ||
        (item.customer.custid && item.customer.custid.toLowerCase().includes(searchLower)) ||
        (item.customer.business && item.customer.business.toLowerCase().includes(searchLower));

      // Filter
      const matchesFilter =
        filterOption === "ALL" || item.suggestion.suggestion === filterOption;

      return matchesSearch && matchesFilter;
    });
  }, [customers, searchQuery, filterOption]);

  const sortedData = useMemo(() => {
    const dataToSort = [...filteredData];
    
    switch (sortOption) {
      case "NAME_ASC":
        return dataToSort.sort((a, b) => (a.customer.name || "").localeCompare(b.customer.name || ""));
      case "NAME_DESC":
        return dataToSort.sort((a, b) => (b.customer.name || "").localeCompare(a.customer.name || ""));
      case "TOGGLE_ON_FIRST":
        return dataToSort.sort((a, b) => {
          const aOn = a.customer.todayOverride?.status === "ON" ? 1 : 0;
          const bOn = b.customer.todayOverride?.status === "ON" ? 1 : 0;
          return bOn - aOn;
        });
      case "TOGGLE_OFF_FIRST":
        return dataToSort.sort((a, b) => {
          const aOn = a.customer.todayOverride?.status === "ON" ? 1 : 0;
          const bOn = b.customer.todayOverride?.status === "ON" ? 1 : 0;
          return aOn - bOn;
        });
      case "DEFAULT":
      default:
        return dataToSort;
    }
  }, [filteredData, sortOption]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / PAGE_SIZE));
  const currentData = sortedData.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage((prev) => prev + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((prev) => prev - 1);
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-center items-center justify-center">AI Suggestions</h1>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search by ID, Name or Business..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border border-gray-300 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="border border-gray-300 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="DEFAULT">Sort: Default (AI Confidence)</option>
            <option value="NAME_ASC">Name (A-Z)</option>
            <option value="NAME_DESC">Name (Z-A)</option>
            <option value="TOGGLE_ON_FIRST">Toggle (ON First)</option>
            <option value="TOGGLE_OFF_FIRST">Toggle (OFF First)</option>
          </select>
          <select
            value={filterOption}
            onChange={(e) => setFilterOption(e.target.value)}
            className="border border-gray-300 px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="ALL">All Suggestions</option>
            <option value="TURN_ON_TOMORROW">Turn ON Tomorrow</option>
            <option value="TURN_OFF_TOMORROW">Turn OFF Tomorrow</option>
            <option value="KEEP_ON_TOMORROW">Keep ON Tomorrow</option>
            <option value="KEEP_OFF_TOMORROW">Keep OFF Tomorrow</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6 border border-red-200">
          {error}
        </div>
      )}

      <AISuggestionTable data={currentData} loading={loading} />

      {!loading && !error && (
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded disabled:opacity-50"
          >
            Previous
          </button>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
          </div>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default AISuggestions;
