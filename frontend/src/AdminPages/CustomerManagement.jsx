import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FiUsers } from "react-icons/fi";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { ADMIN_PATH } from "../constant";

// TABS
const TABS = [
  "ALL",
  "ONBOARDING",
  "REGULAR",
  "FOLLOW-UP",
  "RETENTION",
  "CUSTOMIZE",
];

export default function CustomerManagement() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("ALL");
  const [sortBy, setSortBy] = useState("name");

  const [deliveryCountFilter, setDeliveryCountFilter] = useState(0);

  const [updatingPriorityId, setUpdatingPriorityId] = useState(null);

  const [recalculating, setRecalculating] = useState(false);

  const isAll = activeTab === "ALL";
  const canDownloadExcel = activeTab !== "ALL";

  // ================= LOAD =================

  const loadCustomers = async () => {
    const res = await axios.get(`${ADMIN_PATH}/user-info`);
    const rows = Array.isArray(res.data) ? res.data : [];
    setCustomers(
      rows.map((c) => ({
        ...c,
        priority: normalizePriority(c.priority),
      })),
    );
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

  // Load normal tabs
  useEffect(() => {
    if (activeTab === "CUSTOMIZE") return;

    const init = async () => {
      setLoading(true);
      await loadCustomers();
      setLoading(false);
      loadRemarks();
    };

    init();
  }, [activeTab]);

  // Load CUSTOMIZE tab
  useEffect(() => {
    if (activeTab !== "CUSTOMIZE") return;

    const loadCustomCustomers = async () => {
      try {
        setLoading(true);

        const res = await axios.get(
          `${ADMIN_PATH}/customer/by-delivery-count?count=${deliveryCountFilter}`,
        );

        const rows = Array.isArray(res.data) ? res.data : [];
        setCustomers(
          rows.map((c) => ({
            ...c,
            priority: normalizePriority(c.priority),
          })),
        );
      } catch (err) {
        console.error("Customize fetch error:", err);
      } finally {
        setLoading(false);
      }
      loadRemarks();
    };

    loadCustomCustomers();
  }, [activeTab, deliveryCountFilter]);


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
    } else if (activeTab === "CUSTOMIZE") {
      list = customers;
    } else {
      list = customers.filter((c) => c.category === activeTab);
    }

    // SORT
    if (sortBy === "name") {
      list.sort((a, b) =>
        getName(a).toLowerCase().localeCompare(getName(b).toLowerCase()),
      );
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

  // ================= ACTIONS =================
  const updatePriority = async (c) => {
    if (!c?.id || updatingPriorityId === c.id) return;

    const currentPriority = normalizePriority(c.priority);
    const nextPriority =
      currentPriority === "LOW"
        ? "MEDIUM"
        : currentPriority === "MEDIUM"
          ? "HIGH"
          : "LOW";

    try {
      setUpdatingPriorityId(c.id);

      await axios.post(`${ADMIN_PATH}/customer/priority`, {
        id: c.id,
        priority: nextPriority,
      });

      await loadCustomers();
      await loadRemarks();
    } catch (err) {
      console.error("Priority update error:", err);
    } finally {
      setUpdatingPriorityId(null);
    }
  };

  const recalculateAll = async () => {
    if (!window.confirm("Recalculate all customer categories?")) return;

    try {
      setRecalculating(true);

      await axios.post(`${ADMIN_PATH}/customer/recalculate`);

      await loadCustomers();
      loadRemarks();

      alert("Categories recalculated");
    } catch {
      alert("Failed to recalculate");
    } finally {
      setRecalculating(false);
    }
  };

  // ================= EXCEL =================

  const downloadExcel = () => {
    if (!canDownloadExcel) return;

    const data = filtered.map((c) => ({
      "Customer ID": c.custid || c.id,
      Name: getName(c),
      Zone: c.zone || "",
      Category: c.category || "RETENTION",
      Priority: normalizePriority(c.priority),
      Remarks: c.latestRemark || "-",
    }));

    const ws = XLSX.utils.json_to_sheet(data);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab);

    const buf = XLSX.write(wb, {
      bookType: "xlsx",
      type: "array",
    });

    saveAs(new Blob([buf]), `${activeTab}.xlsx`);
  };

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
            {!isAll && <option value="remarks">Remarks A-Z</option>}
          </select>

          {canDownloadExcel && (
            <button
              onClick={downloadExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg"
            >
              Download {activeTab}
            </button>
          )}

          <button
            disabled={recalculating}
            onClick={recalculateAll}
            className={`px-4 py-2 rounded-lg text-white ${
              recalculating ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-600"
            }`}
          >
            {recalculating ? "Recalculating..." : "Recalculate"}
          </button>
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

      {/* CUSTOMIZE DROPDOWN */}
      {activeTab === "CUSTOMIZE" && (
        <div className="mb-4">
          <select
            value={deliveryCountFilter}
            onChange={(e) => setDeliveryCountFilter(Number(e.target.value))}
            className="border rounded-lg px-4 py-2"
          >
            <option value={0}>0 Deliveries (Last 7 Days)</option>
            <option value={1}>1 Delivery (Last 7 Days)</option>
            <option value={2}>2 Deliveries (Last 7 Days)</option>
            <option value={3}>3 Deliveries (Last 7 Days)</option>
            <option value={4}>4 & 4+ (Last 7 Days)</option>
          </select>
        </div>
      )}

      {/* TABLE */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm text-center border-collapse">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="p-3">Image</th>
              <th className="p-3">Customer ID</th>
              <th className="p-3">Name</th>
              <th className="p-3">Zone</th>
              {isAll && <th className="p-3">Category</th>}
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

                {isAll && (
                  <>
                    <td className="p-3">{c.category || "RETENTION"}</td>
                  </>
                )}

                <td className="p-3">
                  <button
                    disabled={updatingPriorityId === c.id}
                    onClick={() => updatePriority(c)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${updatingPriorityId === c.id ? "opacity-70" : ""}`}
                    style={{ backgroundColor: getPriorityColor(c.priority) }}
                  >
                    {normalizePriority(c.priority)}
                  </button>
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
  const raw = String(value || "")
    .trim()
    .toUpperCase();

  if (raw === "MEDIUM" || raw === "HIGH") {
    return raw;
  }

  return "LOW";
}

function getPriorityColor(value) {
  const priority = normalizePriority(value);

  if (priority === "MEDIUM") return "#FB8C00";
  if (priority === "HIGH") return "#0F9D58";

  return "#FF3B30";
}

function getImage(c) {
  return c.imageUrl || c.image || "https://via.placeholder.com/48";
}
