import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { ADMIN_PATH } from "../constant";

const ReportV = () => {
  const [data, setData] = useState([]);
  const [zones, setZones] = useState([]);
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

  const parseTimestamp = (value) => {
    if (!value) return null;

    if (value instanceof Date) return value;

    if (typeof value?.toDate === "function") {
      return value.toDate();
    }

    if (typeof value === "number") {
      // Treat 10-digit numbers as seconds, otherwise milliseconds.
      const ms = value < 1e12 ? value * 1000 : value;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === "string") {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === "object") {
      const seconds = value.seconds ?? value._seconds;
      const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;

      if (typeof seconds === "number") {
        const ms = seconds * 1000 + Math.floor(nanoseconds / 1e6);
        const date = new Date(ms);
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }

    return null;
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

  const fetchZones = async () => {
    try {
      const res = await fetch(`${ADMIN_PATH}/zones`);
      const json = await res.json();
      setZones(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("Zones fetch error:", err);
      setZones([]);
    }
  };

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    fetchZones();
  }, []);

  // PROCESS DATA
  useEffect(() => {
    const result = data.map((customer) => {
      const delivery = customer.deliveries?.[0];
      const resolvedZone = zones.includes(customer.zone)
        ? customer.zone
        : "UNASSIGNED";

      return {
        custid: customer.custid,
        name: customer.name,
        zone: resolvedZone,
        deliveryMan: delivery?.deliveryMan || null,
        status: delivery?.type || "not delivered",
        createdAt: delivery?.timestamp || null,
        checkReason: delivery?.checkReason || "",
        traysDelivered:
          typeof delivery?.traysDelivered === "number"
            ? delivery.traysDelivered
            : null,
      };
    });

    setFilteredDeliveries(result);
  }, [data, zones]);

  // DELIVERY AGENT OPTIONS
  const deliveryAgentOptions = [
    ...new Set(
      filteredDeliveries
        .map((d) => (d.deliveryMan?.name || "").trim())
        .filter(Boolean),
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
        (d) => (d.deliveryMan?.name || "").trim() === selectedAgent,
      );
    }

    // SORT BY CUSTOMER NAME
    if (sortBy === "customer") {
      temp.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    // SORT BY DELIVERY TIME (Oldest First)
    if (sortBy === "time") {
      temp.sort((a, b) => {
        const aTime = parseTimestamp(a.createdAt)?.getTime();
        const bTime = parseTimestamp(b.createdAt)?.getTime();

        // Keep rows with missing/invalid time at the bottom.
        if (aTime == null && bTime == null) return 0;
        if (aTime == null) return 1;
        if (bTime == null) return -1;

        return aTime - bTime;
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
    delivered: filteredDeliveries.filter((d) => d.status === "delivered")
      .length,
    reached: filteredDeliveries.filter((d) => d.status === "reached").length,
    "not delivered": filteredDeliveries.filter(
      (d) => d.status === "not delivered",
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
        `${ADMIN_PATH}/all-deliveries-range?start=${startRange}&end=${endRange}`,
      );

      const json = await res.json();
      const customers = json.customers || [];

      const sheetData = [
        [
          "Date",
          "Customer ID",
          "Customer Name",
          "Creation Time",
          "Zone",
          "Delivery Agent Name",
          "Status",
        ],
      ];

      customers.forEach((customer) => {
        customer.deliveries.forEach((delivery) => {
          const resolvedZone = zones.includes(customer.zone)
            ? customer.zone
            : "UNASSIGNED";

          sheetData.push([
            delivery.id,
            customer.custid,
            customer.name,
            // customer.formatTime(createdAt),
            formatTime(delivery.timestamp),
            resolvedZone,
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
        `delivery_report_${startRange}_to_${endRange}.xlsx`,
      );
    } catch {
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
  // to display creation time
  const formatTime = (timestamp) => {
    const date = parseTimestamp(timestamp);
    if (!date) return "-";

    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };
  return (
    <div className="min-h-screen bg-gray-100 px-2 py-3 sm:px-4 sm:py-6 lg:px-6 lg:py-8 flex justify-center">
      <div className="w-full max-w-7xl bg-white shadow-lg rounded-2xl overflow-hidden">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 flex items-center gap-3 sm:gap-4">
          <div className="bg-white/20 p-2.5 sm:p-3 rounded-xl">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 sm:h-7 sm:w-7 text-white"
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
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-white tracking-wide">
            Delivery Report Dashboard
          </h1>
        </div>

        {/* FILTER BAR */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 lg:px-8 border-b bg-white flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-sm font-medium text-gray-600 mr-1 sm:mr-3">
            Filter by Status:
          </span>

          {[
            { value: "all", label: "All", color: "bg-gray-100 text-gray-800" },
            {
              value: "delivered",
              label: "Delivered",
              color: "bg-green-100 text-green-800",
            },
            {
              value: "reached",
              label: "Checked",
              color: "bg-yellow-100 text-yellow-800",
            },
            {
              value: "not delivered",
              label: "Not Delivered",
              color: "bg-red-100 text-red-800",
            },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-medium border ${
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
        <div className="px-4 py-4 sm:px-6 sm:py-5 lg:px-8 border-b bg-white flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 sm:gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 flex-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-600">
                Select Delivery Date
              </label>
              <input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full border px-4 py-2.5 rounded-lg shadow-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-600">
                Sort By
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full border px-4 py-2.5 rounded-lg shadow-sm"
              >
                <option value="customer">Customer Name (A-Z)</option>
                <option value="time">Delivery Creation Time</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-600">
                Delivery Agent
              </label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full border px-4 py-2.5 rounded-lg shadow-sm"
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 xl:w-auto w-full">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-600">
                Start Date
              </label>
              <input
                type="date"
                max={today}
                value={startRange}
                onChange={(e) => setStartRange(e.target.value)}
                className="w-full border px-3 py-2.5 rounded-lg shadow-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-600">
                End Date
              </label>
              <input
                type="date"
                max={today}
                value={endRange}
                onChange={(e) => setEndRange(e.target.value)}
                className="w-full border px-3 py-2.5 rounded-lg shadow-sm"
              />
            </div>

            <button
              disabled={!startRange || !endRange || !data.length}
              onClick={downloadSummaryExcel}
              className={`w-full sm:self-end px-5 py-2.5 rounded-lg shadow text-white ${
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
        <div className="overflow-x-auto p-2.5 sm:p-4 lg:p-6">
          <table className="w-full border rounded-xl overflow-hidden">
            <thead className="bg-gray-50 border-b">
              <tr>
                {[
                  "Customer ID",
                  "Customer Name",
                  "Delivery  Time",
                  "Zone",
                  "Delivery Agent",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 sm:px-5 lg:px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {displayedDeliveries.length ? (
                displayedDeliveries.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 border-b">
                    <td className="px-3 sm:px-5 lg:px-6 py-3 sm:py-3.5 lg:py-4">
                      {row.custid}
                    </td>
                    <td className="px-3 sm:px-5 lg:px-6 py-3 sm:py-3.5 lg:py-4">
                      {row.name}
                    </td>
                    <td className="px-3 sm:px-5 lg:px-6 py-3 sm:py-3.5 lg:py-4">
                      {formatTime(row.createdAt)}
                    </td>
                    <td className="px-3 sm:px-5 lg:px-6 py-3 sm:py-3.5 lg:py-4">
                      {row.zone || "UNASSIGNED"}
                    </td>
                    <td className="px-3 sm:px-5 lg:px-6 py-3 sm:py-3.5 lg:py-4">
                      {row.deliveryMan?.name || "Not assigned"}
                    </td>
                    <td className="px-3 sm:px-5 lg:px-6 py-3 sm:py-3.5 lg:py-4">
                      <div className="flex flex-col items-start gap-1.5">
                        <span
                          className={`inline-flex items-center whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                            row.status,
                          )}`}
                        >
                          {formatStatus(row.status)}
                        </span>

                        {row.status === "reached" && (
                          <span className="text-sm text-gray-700 items-center">
                            {row.checkReason || "-"}
                          </span>
                        )}

                        {row.status === "delivered" && (
                          <span className="text-sm text-gray-700">
                            {row.traysDelivered === null
                              ? "-"
                              : row.traysDelivered >= 10
                                ? "10+ trays"
                                : `${row.traysDelivered} trays`}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="py-14 text-center text-gray-500">
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

export default ReportV;
