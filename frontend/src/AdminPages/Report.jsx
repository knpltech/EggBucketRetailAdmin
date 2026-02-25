import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { ADMIN_PATH } from "../constant";

const Report = () => {
  const [data, setData] = useState([]);
  const [filteredDeliveries, setFilteredDeliveries] = useState([]);
  const [displayedDeliveries, setDisplayedDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [sortBy, setSortBy] = useState("customer");
  const [selectedAgent, setSelectedAgent] = useState("all");

  const getToday = () => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  };

  const today = getToday();

  const [selectedDate, setSelectedDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState("all");
  const [startRange, setStartRange] = useState("");
  const [endRange, setEndRange] = useState("");

  const formatStatus = (status) => {
    if (status === "reached") return "CHECKED";
    return status?.toUpperCase() || "NOT DELIVERED";
  };

  const fetchData = async (date) => {
    setLoading(true);
    try {
      const res = await fetch(`${ADMIN_PATH}/all-deliveries?date=${date}`);
      const json = await res.json();
      setData(json.customers || []);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate]);

  // PROCESS DATA
  useEffect(() => {
    const result = data.map((customer) => {
      const delivery = customer.deliveries?.[0];

      return {
        custid: customer.custid,
        name: customer.name,
        deliveryMan: delivery?.deliveryMan || null,
        status: delivery?.type || "not delivered",
        createdAt: delivery?.createdAt || null,
      };
    });

    setFilteredDeliveries(result);
  }, [data]);

  // DELIVERY AGENT OPTIONS
  const deliveryAgentOptions = [
    ...new Set(
      filteredDeliveries
        .map((d) => (d.deliveryMan?.name || "").trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));

  // FILTER + SORT
  useEffect(() => {
    let temp = [...filteredDeliveries];

    // STATUS FILTER
    if (statusFilter !== "all") {
      temp = temp.filter((d) => d.status === statusFilter);
    }

    // AGENT FILTER
    if (selectedAgent !== "all") {
      temp = temp.filter(
        (d) =>
          (d.deliveryMan?.name || "").trim() === selectedAgent
      );
    }

    // SORT BY CUSTOMER NAME
    if (sortBy === "customer") {
      temp.sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      );
    }

    // SORT BY DELIVERY TIME (Newest First)
    if (sortBy === "time") {
      temp.sort((a, b) => {
        const aTime = a.createdAt
          ? new Date(a.createdAt).getTime()
          : 0;
        const bTime = b.createdAt
          ? new Date(b.createdAt).getTime()
          : 0;
        return bTime - aTime;
      });
    }

    setDisplayedDeliveries(temp);
  }, [filteredDeliveries, statusFilter, sortBy, selectedAgent]);

  const getStatusColor = (status) => {
    switch (status) {
      case "delivered":
        return "bg-green-100 text-green-800 border border-green-300";
      case "reached":
        return "bg-yellow-100 text-yellow-800 border border-yellow-300";
      default:
        return "bg-red-100 text-red-800 border border-red-300";
    }
  };

  const getStatusCounts = () => ({
    all: filteredDeliveries.length,
    delivered: filteredDeliveries.filter((d) => d.status === "delivered").length,
    reached: filteredDeliveries.filter((d) => d.status === "reached").length,
    "not delivered": filteredDeliveries.filter(
      (d) => d.status === "not delivered"
    ).length,
  });

  const statusCounts = getStatusCounts();

  const downloadSummaryExcel = async () => {
    if (!startRange || !endRange) {
      alert("Select Start & End Date");
      return;
    }

    if (new Date(startRange) > new Date(endRange)) {
      alert("Invalid date range");
      return;
    }

    try {
      const res = await fetch(
        `${ADMIN_PATH}/all-deliveries-range?start=${startRange}&end=${endRange}`
      );

      const json = await res.json();
      const customers = json.customers || [];

      const sheetData = [
        [
          "Date",
          "Customer ID",
          "Customer Name",
          "Delivery Agent Name",
          "Status",
        ],
      ];

      customers.forEach((customer) => {
        customer.deliveries.forEach((delivery) => {
          sheetData.push([
            delivery.id,
            customer.custid,
            customer.name,
            delivery.deliveryMan?.name || "Not Assigned",
            delivery.type || "not delivered",
          ]);
        });
      });

      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Detailed Report");

      const buffer = XLSX.write(wb, {
        type: "array",
        bookType: "xlsx",
      });

      saveAs(
        new Blob([buffer], {
          type: "application/octet-stream",
        }),
        `delivery_report_${startRange}_to_${endRange}.xlsx`
      );
    } catch  {
      alert("Excel generation failed");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-lg">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex justify-center">
      <div className="w-full max-w-7xl bg-white shadow-lg rounded-2xl overflow-hidden">

        {/* HEADER */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-6 flex items-center gap-4">
          <div className="bg-white/20 p-3 rounded-xl">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 3v18h18" />
              <path d="M7 14v3" />
              <path d="M12 11v6" />
              <path d="M17 7v10" />
            </svg>
          </div>
          <h1 className="text-3xl font-semibold text-white tracking-wide">
            Delivery Report Dashboard
          </h1>
        </div>

        {/* FILTER BAR */}
        <div className="px-8 py-5 border-b bg-white flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-600 mr-3">
            Filter by Status:
          </span>

          {[
            { value: "all", label: "All", color: "bg-gray-100 text-gray-800" },
            { value: "delivered", label: "Delivered", color: "bg-green-100 text-green-800" },
            { value: "reached", label: "Checked", color: "bg-yellow-100 text-yellow-800" },
            { value: "not delivered", label: "Not Delivered", color: "bg-red-100 text-red-800" },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium border ${
                statusFilter === s.value
                  ? `${s.color} ring-2 ring-blue-400 shadow-sm`
                  : `${s.color}`
              }`}
            >
              {s.label} ({statusCounts[s.value]})
            </button>
          ))}
        </div>

        {/* DATE + SORT + AGENT FILTER */}
        <div className="px-8 py-5 border-b bg-white flex flex-col md:flex-row justify-between gap-6">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-600">
                Select Delivery Date
              </label>
              <input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border px-4 py-2 rounded-lg shadow-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-600">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="border px-4 py-2 rounded-lg shadow-sm"
              >
                <option value="customer">Customer Name (A-Z)</option>
                <option value="time">Delivery Creation Time</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-600">
                Delivery Agent
              </label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="border px-4 py-2 rounded-lg shadow-sm"
              >
                <option value="all">All Delivery Agents</option>
                {deliveryAgentOptions.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-end gap-4">
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-600">
                Start Date
              </label>
              <input
                type="date"
                max={today}
                value={startRange}
                onChange={(e) => setStartRange(e.target.value)}
                className="border px-3 py-2 rounded-lg shadow-sm"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-600">
                End Date
              </label>
              <input
                type="date"
                max={today}
                value={endRange}
                onChange={(e) => setEndRange(e.target.value)}
                className="border px-3 py-2 rounded-lg shadow-sm"
              />
            </div>

            <button
              disabled={!startRange || !endRange || !data.length}
              onClick={downloadSummaryExcel}
              className={`px-5 py-2 rounded-lg shadow text-white ${
                !startRange || !endRange || !data.length
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              Download Excel
            </button>
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto p-6">
          <table className="w-full border rounded-xl overflow-hidden">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Customer ID", "Customer Name", "Delivery Agent", "Status"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="bg-white">
              {displayedDeliveries.length ? (
                displayedDeliveries.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 border-b">
                    <td className="px-6 py-4">{row.custid}</td>
                    <td className="px-6 py-4">{row.name}</td>
                    <td className="px-6 py-4">
                      {row.deliveryMan?.name || "Not assigned"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                          row.status
                        )}`}
                      >
                        {formatStatus(row.status)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="py-14 text-center text-gray-500">
                    No deliveries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Report;