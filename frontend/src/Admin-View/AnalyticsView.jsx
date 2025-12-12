// ./src/components/Analytics.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { ADMIN_PATH } from "../constant";
import { FiUsers, FiTruck, FiPackage } from "react-icons/fi";

const AnalyticsView = () => {
  const [allCustomers, setAllCustomers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortOption, setSortOption] = useState("name");

  // Date range state for export
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    loadAnalyticsOnce();
  }, []);

  useEffect(() => {
    applySorting(sortOption);
  }, [sortOption, allCustomers]);

  // Load all customers + deliveries only once
  const loadAnalyticsOnce = async () => {
    try {
      const res = await axios.get(`${ADMIN_PATH}/user-info`);
      let all = res.data || [];

      const full = await Promise.all(
        all.map(async (c) => {
          try {
            const dres = await axios.get(`${ADMIN_PATH}/customer/deliveries/${c.id}`);
            return {
              ...c,
              deliveries: dres.data.deliveries || [],
              last7: computeLast7Days(dres.data.deliveries || []),
            };
          } catch {
            return {
              ...c,
              deliveries: [],
              last7: computeLast7Days([]),
            };
          }
        })
      );

      setAllCustomers(full);
      setCustomers(full);
    } catch (err) {
      console.log("Analytics load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const applySorting = (option) => {
    let sorted = [...allCustomers];
    if (option === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (option === "createdAt") sorted.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    setCustomers(sorted);
  };

  // UI: compute last 7 days statuses for each customer (used by table)
  const computeLast7Days = (deliveries) => {
    const result = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 7; i >= 1; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);

      const found = deliveries.find((entry) => {
        const t = new Date(entry.timestamp._seconds * 1000);
        t.setHours(0, 0, 0, 0);
        return t.getTime() === d.getTime();
      });

      result.push({
        type: found ? found.type : null,
        date: d,
      });
    }
    return result;
  };

  // UI PILL
  const getStatusPill = (type) => {
    let bg = "";
    let text = "";

    if (type === "delivered") {
      bg = "#0F9D58"; // green
      text = "DELIVERED";
    } else if (type === "reached") {
      bg = "#FB8C00"; // orange-yellow
      text = "REACHED";
    } else {
      bg = "#FF3B30"; // bright red 
      text = "NOT REACHED";
    }

    return (
      <div
        className="rounded-full text-[10px] font-semibold flex items-center justify-center"
        style={{
          backgroundColor: bg,
          color: "white",
          width: "80px",
          height: "26px",
        }}
      >
        {text}
      </div>
    );
  };

  // Helper: short status strings (what will go into XLSX cells)
  // Helper: FULL status strings (what will go into XLSX cells)
const statusShort = (type) => {
  const s = (type || "").toString().trim().toLowerCase();

  if (s === "delivered") return "DELIVERED ";
  if (s === "reached") return "REACHED ";

  return "NOT REACHED ";
};


  // Build date list between startDate and endDate (inclusive) — used for calendar columns
  const buildDateList = () => {
    if (!startDate || !endDate) return [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const list = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const copy = new Date(d);
      copy.setHours(0, 0, 0, 0);
      list.push(new Date(copy));
    }
    return list;
  };


  const exportCalendarXLSX = () => {
    if (!startDate || !endDate) {
      alert("Select start and end dates for export.");
      return;
    }

    const dateList = buildDateList();
    if (!dateList.length) {
      alert("Invalid date range.");
      return;
    }

    // header row: Customer ID, Name, then dates as "DD MMM"
    const header = ["Customer ID", "Name", ...dateList.map((d) => `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`)];

    // build rows array
    const aoa = [header];

    customers.forEach((c) => {
      const row = [c.custid || "", c.name || ""];

      dateList.forEach((day) => {
        // find delivery on that exact day
        const found = (c.deliveries || []).find((entry) => {
          const t = new Date(entry.timestamp._seconds * 1000);
          t.setHours(0, 0, 0, 0);
          return t.getTime() === day.getTime();
        });

        row.push(found ? statusShort(found.type) : "NOT REACHED"); // fill missing as N R ❌
      });

      aoa.push(row);
    });

    // create worksheet from array-of-arrays
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Column widths: cust id small, name wide, other date columns medium
    const cols = [
      { wch: 14 }, // Customer ID
      { wch: 36 }, // Name - made wider for long names
      ...dateList.map(() => ({ wch: 12 })), 
    ];
    ws["!cols"] = cols;

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell_address = { c: C, r: R };
        const cell_ref = XLSX.utils.encode_cell(cell_address);
        const cell = ws[cell_ref];
        if (!cell) continue;

        
        if (cell.v !== undefined && typeof cell.v !== "string") {
          cell.v = String(cell.v);
        }

        
        cell.s = cell.s || {};
        cell.s.alignment = { horizontal: "center", vertical: "center" };
        // border on all cells
        cell.s.border = {
          top: { style: "thin", color: { rgb: "FFCCCCCC" } },
          bottom: { style: "thin", color: { rgb: "FFCCCCCC" } },
          left: { style: "thin", color: { rgb: "FFCCCCCC" } },
          right: { style: "thin", color: { rgb: "FFCCCCCC" } },
        };

        // header row styling (bold)
        if (R === 0) {
          cell.s.font = { bold: true, sz: 12 };
          cell.s.fill = { patternType: "solid", fgColor: { rgb: "FFF3F4F6" } };
        } else {
          
          if (C >= 2) {
            const text = (cell.v || "").toString().toLowerCase();
            if (text.includes("delivered") || text.includes("✅")) {
              cell.s.fill = { patternType: "solid", fgColor: { rgb: "FFDFF7E0" } }; // very light green
            } else if (text.includes("reached") || text.includes("➡")) {
              cell.s.fill = { patternType: "solid", fgColor: { rgb: "FFFFF4E5" } }; // very light orange
            } else if (text.includes("not reached") || text.includes("❌")) {
              cell.s.fill = { patternType: "solid", fgColor: { rgb: "FFFEECEC" } }; // very light red
            }
          }
        }
      }
    }

    // create workbook and append sheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analytics");

    // write to binary array and save using file-saver
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    saveAs(blob, `analytics_${startDate}_to_${endDate}.xlsx`);
  };

  // Small helpers for the UI
  const skeletonRows = Array.from({ length: 8 });
  const last7DaysHeader = Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (7 - idx));
    return {
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });

  const totalCustomers = customers.length;
  const totalDeliveries = customers.reduce((sum, c) => sum + c.last7.filter((d) => d.type).length, 0);
  const avgDeliveries = totalCustomers === 0 ? 0 : (totalDeliveries / totalCustomers).toFixed(1);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Analytics (Last 7 Days)</h1>

        <div className="flex items-center gap-3">
          <label className="font-medium text-gray-700">Sort by:</label>
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="border px-3 py-2 rounded-lg bg-white shadow"
          >
            <option value="name">Customer Name</option>
            <option value="createdAt">Created Date</option>
          </select>

          <input
            type="date"
            className="border px-3 py-2 rounded-lg shadow"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />

          <input
            type="date"
            className="border px-3 py-2 rounded-lg shadow"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />

          <button
            onClick={exportCalendarXLSX}
            className="bg-green-600 text-white px-4 py-2 rounded-lg shadow hover:bg-green-700"
          >
            Download XLSX
          </button>
        </div>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500">
          <div className="flex items-center gap-4">
            <FiUsers className="text-3xl text-blue-500" />
            <div>
              <p className="text-sm text-gray-600">Total Customers</p>
              <p className="text-2xl font-bold">{loading ? "…" : totalCustomers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-green-500">
          <div className="flex items-center gap-4">
            <FiTruck className="text-3xl text-green-500" />
            <div>
              <p className="text-sm text-gray-600">Total Deliveries (7 Days)</p>
              <p className="text-2xl font-bold">{loading ? "…" : totalDeliveries}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-purple-500">
          <div className="flex items-center gap-4">
            <FiPackage className="text-3xl text-purple-500" />
            <div>
              <p className="text-sm text-gray-600">Avg Deliveries/Customer</p>
              <p className="text-2xl font-bold">{loading ? "…" : avgDeliveries}</p>
            </div>
          </div>
        </div>
      </div>

      {/* LEGEND */}
      <div className="flex gap-6 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 bg-[#0F9D58] rounded-full"></span> Delivered
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 bg-[#FB8C00] rounded-full"></span> Reached
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 bg-[#FF3B30] rounded-full"></span> Not Reached
        </div>
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left font-semibold">Image</th>
              <th className="p-3 text-left font-semibold">Cust Id</th>
              <th className="p-3 text-left font-semibold">Name</th>

              {last7DaysHeader.map((d, i) => (
                <th key={i} className="p-3 text-center font-semibold">
                  {d.label}
                  <br />
                  <span className="text-gray-500 text-xs">{d.date}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading
              ? skeletonRows.map((_, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-3">
                      <div className="w-10 h-10 bg-gray-300 rounded-full animate-pulse"></div>
                    </td>
                    <td className="p-3">
                      <div className="w-20 h-4 bg-gray-300 rounded animate-pulse"></div>
                    </td>
                    <td className="p-3">
                      <div className="w-32 h-4 bg-gray-300 rounded animate-pulse"></div>
                    </td>

                    {[...Array(7)].map((_, i) => (
                      <td key={i} className="p-3 text-center">
                        <div className="w-20 h-6 bg-gray-300 rounded-full mx-auto animate-pulse"></div>
                      </td>
                    ))}
                  </tr>
                ))
              : customers.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-gray-50">
                    <td className="p-3">
                      <img src={c.imageUrl} alt={c.name} className="w-10 h-10 rounded-full object-cover" />
                    </td>

                    <td className="p-3 font-medium">{c.custid}</td>
                    <td className="p-3 font-medium">{c.name}</td>

                    {c.last7.map((d, index) => (
                      <td key={index} className="p-3 text-center">
                        {getStatusPill(d.type)}
                      </td>
                    ))}
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AnalyticsView;
