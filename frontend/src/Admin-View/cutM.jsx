import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FiUsers } from "react-icons/fi";
import { ADMIN_PATH } from "../constant";

// TABS
const TABS = [
  "ALL",
  "ONBOARDING",
  "D0",
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "D6",
  "D7",
];

export default function CustomerManagementV() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("ALL");
  const [sortBy, setSortBy] = useState("name");

  const isAll = activeTab === "ALL";

  // ================= LOAD =================

  const loadCustomers = async () => {
    const res = await axios.get(`${ADMIN_PATH}/user-info`);
    setCustomers(Array.isArray(res.data) ? res.data : []);
  };

  const loadRemarks = async () => {
    try {
      const res = await axios.get(`${ADMIN_PATH}/customer/latest-remarks`);
      const remarksMap = res.data || {};

      setCustomers((prev) =>
        prev.map((c) => ({
          ...c,
          latestRemark: remarksMap[c.id] || "-",
        })),
      );
    } catch (err) {
      console.error("Error loading remarks:", err);
    }
  };

  // Load customers based on active tab.
  useEffect(() => {
    const init = async () => {
      setLoading(true);

      try {
        const isDTab = /^D[0-7]$/.test(activeTab);
        if (isDTab) {
          const days = Number(activeTab.slice(1));
          const res = await axios.get(
            `${ADMIN_PATH}/customer/delivery-days?days=${days}`,
          );
          setCustomers(Array.isArray(res.data) ? res.data : []);
        } else {
          await loadCustomers();
        }
      } finally {
        setLoading(false);
      }

      loadRemarks();
    };

    init();
  }, [activeTab]);

  // ================= FILTER =================

  const filtered = useMemo(() => {
    let list = [];
    // ALL = Business Customers
    if (activeTab === "ALL") {
      list = customers;
    }
    // ONBOARDING = Zone Unassigned
    else if (activeTab === "ONBOARDING") {
      list = customers.filter(
        (c) =>
          !c.zone ||
          c.zone === "" ||
          c.zone === null ||
          c.zone === "UNASSIGNED",
      );
    } else {
      // D0..D7 tabs are served directly from the API.
      list = customers;
    }

    // Never sort state arrays in-place (Array.sort mutates)
    list = Array.isArray(list) ? [...list] : [];

    // SORT
    if (sortBy === "name") {
      list.sort((a, b) =>
        getName(a).toLowerCase().localeCompare(getName(b).toLowerCase()),
      );
    } else if (sortBy === "priority") {
      const rank = (p) => {
        const v = normalizePriority(p);
        const n = getPriorityNumber(v);
        // Higher P number = higher priority (sort first)
        return 7 - n;
      };

      list.sort((a, b) => {
        const diff = rank(a.priority) - rank(b.priority);
        if (diff !== 0) return diff;
        return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
      });
    } else if (sortBy === "remarks") {
      const withRemarks = list.filter(
        (c) => c.latestRemark && c.latestRemark !== "-",
      );

      const withoutRemarks = list.filter(
        (c) => !c.latestRemark || c.latestRemark === "-",
      );

      withRemarks.sort((a, b) =>
        a.latestRemark
          .toLowerCase()
          .localeCompare(b.latestRemark.toLowerCase()),
      );

      withoutRemarks.sort((a, b) =>
        getName(a).toLowerCase().localeCompare(getName(b).toLowerCase()),
      );

      return [...withRemarks, ...withoutRemarks];
    } else {
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    return list;
  }, [customers, activeTab, sortBy]);

  // ================= UI =================

  return (
    <div className="min-h-screen bg-gray-50 p-6 w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Customer Management</h1>

        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500 flex items-center gap-4">
          <FiUsers className="text-3xl text-blue-500" />

          <div>
            <p className="text-sm text-gray-600">Total Customers</p>
            <p className="text-2xl font-bold">
              {loading ? "…" : filtered.length}
            </p>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border rounded-lg px-4 py-2"
          >
            <option value="name">Customer Name</option>
            <option value="date">Created Date</option>
            <option value="priority">Priority</option>
            {!isAll && <option value="remarks">Remarks A-Z</option>}
          </select>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-xl border ${
              activeTab === t ? "bg-black text-white" : "bg-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm text-center border-collapse">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="p-3">Image</th>
              <th className="p-3">Customer ID</th>
              <th className="p-3">Name</th>
              <th className="p-3">Zone</th>
              <th className="p-3">Priority</th>
              {!isAll && <th className="p-3">Remarks</th>}
            </tr>
          </thead>

          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-3">
                  <img
                    src={getImage(c)}
                    className="w-10 h-10 rounded-full object-cover mx-auto"
                    alt=""
                  />
                </td>
                <td className="p-3 font-medium">{c.custid || c.id}</td>
                <td className="p-3 font-medium">{getName(c)}</td>
                <td className="p-3 font-medium text-gray-700">
                  {c.zone || "UNASSIGNED"}
                </td>

                <td className="p-3">
                  <span
                    className="px-3 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: getPriorityColor(c.priority) }}
                  >
                    {normalizePriority(c.priority)}
                  </span>
                </td>

                {!isAll && (
                  <td className="p-3 text-left">{c.latestRemark || "-"}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getName(c) {
  return c.name || c.customerName || "Unknown";
}

function normalizePriority(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!raw) return "P0";

  if (/^P[0-7]$/.test(raw)) return raw;
  if (/^[0-7]$/.test(raw)) return `P${raw}`;

  return "P0";
}

function getPriorityColor(value) {
  const priority = normalizePriority(value);

  const n = getPriorityNumber(priority);

  if (n <= 2) return "#FF3B30";
  if (n <= 4) return "#FB8C00";
  return "#0F9D58";
}

function getPriorityNumber(value) {
  const normalized = normalizePriority(value);
  const n = Number(String(normalized).slice(1));
  return Number.isFinite(n) && n >= 0 && n <= 7 ? n : 0;
}

function getImage(c) {
  return c.imageUrl || c.image || "https://via.placeholder.com/48";
}
