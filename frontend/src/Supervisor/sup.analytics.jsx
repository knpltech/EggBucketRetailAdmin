
import React, { useEffect, useState } from "react";
import axios from "axios";
import { ADMIN_PATH } from "../constant";
import { FiUsers, FiTruck, FiPackage } from "react-icons/fi";

const SupAnalytics = () => {
  const [allCustomers, setAllCustomers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortOption, setSortOption] = useState("name");

  useEffect(() => {
    loadAnalyticsOnce();
  }, []);

  useEffect(() => {
    applySorting(sortOption);
  }, [sortOption, allCustomers]);

  // Load all customers + deliveries only once
  const loadAnalyticsOnce = async () => {
    try {
      const res = await axios.get(`${ADMIN_PATH}/analytics/last8`);

      const customers = res.data.customers || [];

      const full = customers.map((c) => ({
        ...c,
        last7: computeLast7Days(c.deliveries || []),
      }));

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
    if (option === "createdAt")
      sorted.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    if (option === "priority") {
      const rank = (p) => {
        const v = normalizePriority(p);
        const n = getPriorityNumber(v);
        // Higher P number = higher priority (sort first)
        return 7 - n;
      };

      sorted.sort((a, b) => {
        const diff = rank(a.priority) - rank(b.priority);
        if (diff !== 0) return diff;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
    }
    setCustomers(sorted);
  };

  // Helper: Format date to YYYY-MM-DD in LOCAL timezone (not UTC)
  const formatDateLocal = (d) => {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  };

  // UI: compute last 8 days statuses (including today) for each customer
  const computeLast7Days = (deliveries) => {
    const result = [];
    const today = new Date();

    for (let i = 7; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);

      const dateStr = formatDateLocal(d);

      const found = deliveries.find((entry) => entry.id === dateStr);

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

    const normalizedType = String(type || "")
      .trim()
      .toLowerCase();

    if (normalizedType === "delivered") {
      bg = "#0F9D58"; // green
      text = "DELIVERED";
    } else if (
      normalizedType === "reached" ||
      normalizedType === "price_mismatch" ||
      normalizedType === "stock_available" ||
      normalizedType === "other_vendor"
    ) {
      // All checked types (reached + reason codes)
      bg = "#FB8C00"; // orange-yellow
      text = "CHECKED";
    } else {
      bg = "#FF3B30"; // bright red
      text = "PENDING";
    }

    return (
      <div
        className="mx-auto my-0.5 rounded-full text-[9px] leading-3 font-semibold flex items-center justify-center text-center px-1.5"
        style={{
          backgroundColor: bg,
          color: "white",
          width: "70px",
          minHeight: "24px",
        }}
      >
        {text}
      </div>
    );
  };

  const getPriorityPill = (priority) => {
    const value = normalizePriority(priority);

    const n = getPriorityNumber(value);
    let bg = "#EF4444";
    if (n >= 3 && n <= 4) bg = "#F59E0B";
    if (n >= 5) bg = "#16A34A";

    return (
      <div
        className="mx-auto my-0.5 rounded-full text-[10px] leading-3 font-semibold flex items-center justify-center text-center px-2"
        style={{
          backgroundColor: bg,
          color: "white",
          width: "64px",
          minHeight: "24px",
        }}
      >
        {value}
      </div>
    );
  };

  
  const normalizePriority = (priority) => {
    const p = String(priority ?? "")
      .trim()
      .toUpperCase();

    if (!p) return "P0";
    if (/^P[0-7]$/.test(p)) return p;
    if (/^[0-7]$/.test(p)) return `P${p}`;
    return "P0";
  };

  const getPriorityNumber = (value) => {
    const normalized = normalizePriority(value);
    const n = Number(String(normalized).slice(1));
    return Number.isFinite(n) && n >= 0 && n <= 7 ? n : 0;
  };

  // Small helpers for the UI
  const skeletonRows = Array.from({ length: 8 });
  const last7DaysHeader = Array.from({ length: 8 }).map((_, idx) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (7 - idx));
    return {
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });

  const totalCustomers = customers.length;
  const totalDeliveries = customers.reduce(
    (sum, c) => sum + c.last7.filter((d) => d.type).length,
    0,
  );
  const avgDeliveries =
    totalCustomers === 0 ? 0 : (totalDeliveries / totalCustomers).toFixed(1);

  return (
    <div className="min-h-screen bg-gray-50 px-2 py-5 md:px-3 md:py-6">
      {/* HEADER */}
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <h1 className="text-3xl font-bold tracking-tight">
          Analytics (Last 8 Days)
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          <label className="font-medium text-gray-700">Sort by:</label>
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="border px-3 py-2 rounded-lg bg-white shadow"
          >
            <option value="name">Customer Name</option>
            <option value="createdAt">Created Date</option>
            <option value="priority">Priority</option>
          </select>
        </div>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500">
          <div className="flex items-center gap-4">
            <FiUsers className="text-3xl text-blue-500" />
            <div>
              <p className="text-sm text-gray-600">Total Customers</p>
              <p className="text-2xl font-bold">
                {loading ? "…" : totalCustomers}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-green-500">
          <div className="flex items-center gap-4">
            <FiTruck className="text-3xl text-green-500" />
            <div>
              <p className="text-sm text-gray-600">Total Deliveries (8 Days)</p>
              <p className="text-2xl font-bold">
                {loading ? "…" : totalDeliveries}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-purple-500">
          <div className="flex items-center gap-4">
            <FiPackage className="text-3xl text-purple-500" />
            <div>
              <p className="text-sm text-gray-600">Avg Deliveries/Customer</p>
              <p className="text-2xl font-bold">
                {loading ? "…" : avgDeliveries}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* LEGEND */}
      <div className="mb-4 flex flex-wrap gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 bg-[#0F9D58] rounded-full"></span> Delivered
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 bg-[#FB8C00] rounded-full"></span> Checked
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 bg-[#FF3B30] rounded-full"></span> Pending
        </div>
      </div>

      {/* TABLE */}
      <div className="-mx-1 md:-mx-2 w-[calc(100%+0.5rem)] md:w-[calc(100%+1rem)] overflow-x-auto rounded-xl bg-white shadow ring-1 ring-gray-100">
        <table className="w-full table-fixed text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-2 py-2 text-left font-semibold w-[52px]">
                Image
              </th>
              <th className="px-1.5 py-2 text-left font-semibold w-[76px]">
                Cust Id
              </th>
              <th className="px-1.5 py-2 text-left font-semibold w-[148px]">
                Name
              </th>
              <th className="px-1.5 py-2 text-left font-semibold w-[118px]">
                Zone
              </th>
              <th className="px-1.5 py-2 text-center font-semibold w-[84px]">
                Priority
              </th>

              {last7DaysHeader.map((d, i) => (
                <th
                  key={i}
                  className="px-0.5 py-2 text-center font-semibold min-w-[66px]"
                >
                  {d.label}
                  <br />
                  <span className="text-gray-500 text-[10px]">{d.date}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading
              ? skeletonRows.map((_, idx) => (
                  <tr key={idx} className="border-t border-gray-200">
                    <td className="px-2 py-2">
                      <div className="w-10 h-10 bg-gray-300 rounded-full animate-pulse"></div>
                    </td>
                    <td className="px-1.5 py-2">
                      <div className="w-14 h-3 bg-gray-300 rounded animate-pulse"></div>
                    </td>
                    <td className="px-1.5 py-2 text-center align-middle">
                      <div className="mx-auto w-16 h-3 bg-gray-300 rounded animate-pulse"></div>
                    </td>
                    {/* Zone */}
                    <td className="px-1.5 py-2">
                      <div className="w-16 h-3 bg-gray-300 rounded animate-pulse"></div>
                    </td>
                    {/* Priority */}
                    <td className="px-1.5 py-2">
                      <div className="w-16 h-3 bg-gray-300 rounded animate-pulse"></div>
                    </td>

                    {[...Array(8)].map((_, i) => (
                      <td key={i} className="px-1 py-2 text-center">
                        <div className="w-14 h-5 bg-gray-300 rounded-full mx-auto animate-pulse"></div>
                      </td>
                    ))}
                  </tr>
                ))
              : customers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-gray-200 hover:bg-gray-50"
                  >
                    <td className="px-2 py-2">
                      <img
                        src={c.imageUrl}
                        alt={c.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    </td>

                    <td className="px-1.5 py-2 font-medium truncate">
                      {c.custid}
                    </td>
                    <td className="px-1.5 py-2 font-bold text-[13px] leading-4 whitespace-normal break-words">
                      {c.name}
                    </td>
                    <td className="px-1.5 py-2 font-bold text-gray-700 text-[13px] leading-4 whitespace-normal break-words">
                      {c.zone || "UNASSIGNED"}
                    </td>
                    <td className="px-1.5 py-2 text-center align-middle">
                      {getPriorityPill(c.priority)}
                    </td>

                    {c.last7.map((d, index) => (
                      <td key={index} className="px-1 py-2 text-center">
                        {getStatusPill(d.type)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};



export default SupAnalytics;
