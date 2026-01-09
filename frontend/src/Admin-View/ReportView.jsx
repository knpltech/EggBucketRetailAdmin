import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { ADMIN_PATH } from "../constant";

const ReportView = () => {
  const [data, setData] = useState([]);
  const [filteredDeliveries, setFilteredDeliveries] = useState([]);
  const [displayedDeliveries, setDisplayedDeliveries] = useState([]);

  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );

  const [statusFilter, setStatusFilter] = useState("all");

  const [startRange, setStartRange] = useState("");
  const [endRange, setEndRange] = useState("");

  // ✅ ONLY FOR DISPLAY
  const formatStatus = (status) => {
    if (status === "reached") return "CHECKED";
    return status?.toUpperCase() || "UNKNOWN";
  };

  // LOAD DATA
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${ADMIN_PATH}/all-deliveries`);
        const json = await res.json();
        setData(json.customers || []);
      } catch (err) {
        console.error("Error fetching deliveries:", err);
      }
    };
    fetchData();
  }, []);

  // FILTER BY DATE
  useEffect(() => {
    filterByDate(selectedDate);
  }, [data, selectedDate]);

  const filterByDate = (dateStr) => {
    const result = data.map((customer) => {
      const delivery = customer.deliveries.find((d) => d.id === dateStr);

      return {
        custid: customer.custid,
        name: customer.name,
        deliveryMan: delivery?.deliveryMan || null,
        status: delivery?.type || "not delivered",
      };
    });

    setFilteredDeliveries(result.sort((a, b) => a.name.localeCompare(b.name)));
  };

  // FILTER BY STATUS (UNCHANGED)
  useEffect(() => {
    if (statusFilter === "all") {
      setDisplayedDeliveries(filteredDeliveries);
    } else {
      setDisplayedDeliveries(
        filteredDeliveries.filter((d) => d.status === statusFilter)
      );
    }
  }, [filteredDeliveries, statusFilter]);

  // COLORS (UNCHANGED)
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

  // COUNT (UNCHANGED)
  const getStatusCounts = () => ({
    all: filteredDeliveries.length,
    delivered: filteredDeliveries.filter((d) => d.status === "delivered")
      .length,
    reached: filteredDeliveries.filter((d) => d.status === "reached").length,
    "not delivered": filteredDeliveries.filter(
      (d) => d.status === "not delivered"
    ).length,
  });

  const statusCounts = getStatusCounts();

  // EXCEL EXPORT
  const downloadSummaryExcel = () => {
    if (!startRange || !endRange) {
      alert("Select Start & End Date");
      return;
    }

    const start = new Date(startRange);
    const end = new Date(endRange);

    if (start > end) {
      alert("Start date cannot be after End date");
      return;
    }

    const TOTAL_CUSTOMERS = data.length;
    const dates = [];
    let d = new Date(start);

    while (d <= end) {
      dates.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }

    // ✅ ONLY TEXT CHANGED HERE
    const sheetData = [
      ["DATE", "ALL", "DELIVERED", "CHECKED", "NOT DELIVERED"],
    ];

    dates.forEach((day) => {
      const dateId = day.toISOString().split("T")[0];

      let delivered = 0,
        reached = 0,
        notDelivered = 0;

      data.forEach((customer) => {
        const entry = customer.deliveries.find((x) => x.id === dateId);

        if (!entry) {
          notDelivered++;
          return;
        }

        if (entry.type === "delivered") delivered++;
        else if (entry.type === "reached") reached++;
        else notDelivered++;
      });

      sheetData.push([
        day.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
        }),
        TOTAL_CUSTOMERS,
        delivered,
        reached, // still internally reached
        notDelivered,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Summary");

    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    saveAs(
      new Blob([buffer], { type: "application/octet-stream" }),
      `summary_${startRange}_to_${endRange}.xlsx`
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 flex justify-center">
      <div className="w-full max-w-7xl bg-white shadow-lg rounded-2xl overflow-hidden">

        {/* HEADER */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-6 flex items-center gap-4">
          <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 3v18h18" strokeLinecap="round" />
              <path d="M7 14v3" strokeLinecap="round" />
              <path d="M12 11v6" strokeLinecap="round" />
              <path d="M17 7v10" strokeLinecap="round" />
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
              className={`px-4 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 transition-all border 
                ${
                  statusFilter === s.value
                    ? `${s.color} ring-2 ring-blue-400 shadow-sm`
                    : `${s.color}`
                }`}
            >
              {s.label} ({statusCounts[s.value]})
            </button>
          ))}
        </div>

        {/* DATE PICKER + EXPORT */}
        <div className="px-8 py-5 border-b bg-white flex flex-col md:flex-row justify-between gap-6">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-600">
              Select Delivery Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border px-4 py-2 rounded-lg shadow-sm focus:ring focus:ring-blue-200"
            />
          </div>

          <div className="flex items-end gap-4">
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-600">Start Date</label>
              <input
                type="date"
                value={startRange}
                onChange={(e) => setStartRange(e.target.value)}
                className="border px-3 py-2 rounded-lg shadow-sm"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-600">End Date</label>
              <input
                type="date"
                value={endRange}
                onChange={(e) => setEndRange(e.target.value)}
                className="border px-3 py-2 rounded-lg shadow-sm"
              />
            </div>

            <button
              onClick={downloadSummaryExcel}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg shadow hover:bg-blue-700"
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
                {[
                  "Customer ID",
                  "Name",
                  "Delivery Agent",
                  "Del-contact",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="bg-white">
              {displayedDeliveries.length ? (
                displayedDeliveries.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 border-b transition">
                    <td className="px-6 py-4">{row.custid}</td>
                    <td className="px-6 py-4">{row.name}</td>
                    <td className="px-6 py-4">
                      {row.deliveryMan?.name || "Not assigned"}
                    </td>
                    <td className="px-6 py-4">
                      {row.deliveryMan?.phone || "-"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                          row.status
                        )}`}
                      >
                        {/* ✅ ONLY TEXT CHANGE */}
                        {formatStatus(row.status)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="5"
                    className="py-14 text-center text-gray-500 text-sm"
                  >
                    No deliveries found
                    <br />
                    <span className="text-xs text-gray-400">
                      Try selecting a different date.
                    </span>
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

export default ReportView;
