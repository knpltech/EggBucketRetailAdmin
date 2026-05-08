import React from "react";
import AISuggestionRow from "./AISuggestionRow";

const AISuggestionTable = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="overflow-x-auto bg-white shadow rounded mt-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-3 text-left font-semibold text-gray-800">Customer ID</th>
              <th className="p-3 text-left font-semibold text-gray-800">Customer Name</th>
              <th className="p-3 text-left font-semibold text-gray-800">Priority</th>
              <th className="p-3 text-left font-semibold text-gray-800">Peak_Frequency</th>
              <th className="p-3 text-left font-semibold text-gray-800">Current Toggle</th>
              <th className="p-3 text-left font-semibold text-gray-800">AI Suggestion</th>
              <th className="p-3 text-left font-semibold text-gray-800">Apply AI Suggestion</th>
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, index) => (
              <tr key={index} className="border-b border-gray-100 animate-pulse">
                <td className="p-4 py-6">
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                </td>
                <td className="p-4 py-6">
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                </td>
                <td className="p-4 py-6">
                  <div className="h-4 bg-gray-200 rounded w-12"></div>
                </td>
                <td className="p-4 py-6">
                  <div className="h-4 bg-gray-200 rounded w-12"></div>
                </td>
                <td className="p-4 py-6">
                  <div className="h-4 bg-gray-200 rounded w-48"></div>
                </td>
                <td className="p-4 py-6">
                  <div className="h-4 bg-gray-200 rounded w-16"></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full bg-white shadow-sm rounded-lg border border-gray-200 mt-6 p-8 text-center text-gray-500">
        No AI suggestions available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white shadow rounded mt-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-3 text-left font-semibold text-gray-800 whitespace-nowrap">Customer ID</th>
              <th className="p-3 text-left font-semibold text-gray-800 whitespace-nowrap">Customer Name</th>
              <th className="p-3 text-left font-semibold text-gray-800 whitespace-nowrap">Priority</th>
              <th className="p-3 text-left font-semibold text-gray-800 whitespace-nowrap">Peak_Frequency</th>
              <th className="p-3 text-left font-semibold text-gray-800 whitespace-nowrap">Current Toggle</th>
              <th className="p-3 text-left font-semibold text-gray-800 whitespace-nowrap">AI Suggestion</th>
              <th className="p-3 text-left font-semibold text-gray-800 whitespace-nowrap">Apply AI Suggestion</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <AISuggestionRow
                key={item.customer.id}
                customer={item.customer}
                suggestionData={item.suggestion}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AISuggestionTable;
