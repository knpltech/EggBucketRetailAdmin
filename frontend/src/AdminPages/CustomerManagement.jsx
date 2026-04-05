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

const CHECKED_TYPES = [
  "reached",
  "price_mismatch",
  "stock_available",
  "other_vendor",
];

export default function CustomerManagement() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("ALL");
  const [sortBy, setSortBy] = useState("name");

  const [deliveryCountFilter, setDeliveryCountFilter] = useState(0);

  const [updatingPriorityId, setUpdatingPriorityId] = useState(null);
  const [updatingTodayId, setUpdatingTodayId] = useState(null);

  const [recalculating, setRecalculating] = useState(false);

  const isAll = activeTab === "ALL";
  const canDownloadExcel = true;

  const todayDate = new Date().toISOString().slice(0, 10);

  // ================= LOAD =================

  const loadCustomers = async () => {
    const res = await axios.get(`${ADMIN_PATH}/user-info`);
    const rows = Array.isArray(res.data) ? res.data : [];
    setCustomers(
      rows.map((c) => ({
        ...c,
        priority: normalizePriority(c.priority),
        latestStatus: "Pending",
        latestRemark: "-",
      })),
    );
  };

  const loadLatestMeta = async () => {
    try {
      const today = new Date();
      const todayDate = today.toISOString().split("T")[0];

      const [remarksRes, deliveriesRes] = await Promise.all([
        axios.get(`${ADMIN_PATH}/customer/latest-remarks`),
        axios.get(`${ADMIN_PATH}/all-deliveries?date=${todayDate}`),
      ]);

      const remarksMap = remarksRes.data || {};
      const statusMap = buildLatestStatusMap(
        deliveriesRes.data?.customers || [],
      );

      setCustomers((prev) =>
        prev.map((c) => ({
          ...c,
          latestRemark: remarksMap[c.id] || "-",
          latestStatus: statusMap[c.id] || "Pending",
        })),
      );
    } catch (err) {
      console.error("Error loading latest customer meta:", err);
    }
  };

  // Load normal tabs
  useEffect(() => {
    if (activeTab === "CUSTOMIZE") return;

    const init = async () => {
      setLoading(true);
      await loadCustomers();
      setLoading(false);
      loadLatestMeta();
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
            latestStatus: "Pending",
            latestRemark: "-",
          })),
        );
      } catch (err) {
        console.error("Customize fetch error:", err);
      } finally {
        setLoading(false);
      }
      loadLatestMeta();
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

  // ================= ACTIONS =================
  const updatePriority = async (c) => {
    if (!c?.id || updatingPriorityId === c.id) return;

    const currentPriority = normalizePriority(c.priority);
    const nextPriority = getNextPriority(currentPriority);

    const previousPriority = currentPriority;

    // Optimistic UI: update only this row, no full refetch.
    setCustomers((prev) =>
      prev.map((row) =>
        row.id === c.id ? { ...row, priority: nextPriority } : row,
      ),
    );

    try {
      setUpdatingPriorityId(c.id);

      const res = await axios.post(`${ADMIN_PATH}/customer/priority`, {
        id: c.id,
        priority: nextPriority,
      });

      const savedPriority = res?.data?.priority;
      if (savedPriority) {
        setCustomers((prev) =>
          prev.map((row) =>
            row.id === c.id
              ? { ...row, priority: normalizePriority(savedPriority) }
              : row,
          ),
        );
      }
    } catch (err) {
      console.error("Priority update error:", err);

      // Revert optimistic update if server write failed.
      setCustomers((prev) =>
        prev.map((row) =>
          row.id === c.id ? { ...row, priority: previousPriority } : row,
        ),
      );
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
      loadLatestMeta();

      alert("Categories recalculated");
    } catch {
      alert("Failed to recalculate");
    } finally {
      setRecalculating(false);
    }
  };

  const getTodayEffectiveStatus = (customer) => {
    const override = customer?.todayOverride;

    const overrideDate = override?.date
      ? String(override.date).slice(0, 10)
      : null;

    if (!override || overrideDate !== todayDate) {
      return "ON";
    }

    const status = String(override.status || "")
      .trim()
      .toUpperCase();

    return status === "OFF" ? "OFF" : "ON";
  };

  const toggleTodayDelivery = async (customer) => {
    if (!customer?.id || updatingTodayId === customer.id) return;

    const current = getTodayEffectiveStatus(customer);
    const nextStatus = current === "ON" ? "OFF" : "ON";

    const previousOverride = customer.todayOverride;
    const optimisticOverride = {
      date: todayDate,
      status: nextStatus,
    };

    // Optimistic UI: update only this customer's button immediately.
    setCustomers((prev) =>
      prev.map((row) =>
        row.id === customer.id
          ? { ...row, todayOverride: optimisticOverride }
          : row,
      ),
    );

    try {
      setUpdatingTodayId(customer.id);

      const res = await axios.post(`${ADMIN_PATH}/customer/toggle-delivery`, {
        id: customer.id,
        status: nextStatus,
      });

      const saved = res?.data?.todayOverride;
      if (saved?.date && saved?.status) {
        setCustomers((prev) =>
          prev.map((row) =>
            row.id === customer.id ? { ...row, todayOverride: saved } : row,
          ),
        );
      }
    } catch (err) {
      console.error("Today delivery toggle error:", err);

      // Revert if server write failed.
      setCustomers((prev) =>
        prev.map((row) =>
          row.id === customer.id
            ? { ...row, todayOverride: previousOverride }
            : row,
        ),
      );
    } finally {
      setUpdatingTodayId(null);
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
      Status: normalizeStatus(c.latestStatus),
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
            <option value="priority">Priority</option>
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
              <th className="p-3">Delivery Plan</th>
              <th className="p-3">Priority</th>
              <th className="p-3">Status</th>
              <th className="p-3">Remarks</th>
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
                  {(() => {
                    const effective = getTodayEffectiveStatus(c);
                    const isOn = effective === "ON";
                    const isUpdating = updatingTodayId === c.id;

                    return (
                      <label
                        className={`relative inline-flex items-center ${
                          isUpdating
                            ? "opacity-70 cursor-not-allowed"
                            : "cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={isOn}
                          disabled={isUpdating}
                          onChange={() => toggleTodayDelivery(c)}
                          aria-label={isOn ? "Today: ON" : "Today: OFF"}
                        />
                        <div className="w-12 h-6 bg-gray-300 rounded-full peer peer-checked:bg-green-600 transition-colors" />
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-6" />
                      </label>
                    );
                  })()}
                </td>

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

                <td className="p-3">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(c.latestStatus)}`}
                  >
                    {normalizeStatus(c.latestStatus)}
                  </span>
                </td>

                <td className="p-3 text-left">{c.latestRemark || "-"}</td>
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

  // New format
  if (/^P[0-7]$/.test(raw)) return raw;

  // Allow sending numbers 0-7
  if (/^[0-7]$/.test(raw)) return `P${raw}`;

  return "P0";
}

function normalizeStatus(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();

  if (key === "delivered") return "Delivered";
  if (key === "checked") return "Checked";

  return "Pending";
}

function getPriorityColor(value) {
  const priority = normalizePriority(value);

  const n = getPriorityNumber(priority);

  // P0/P1/P2 = red, P3/P4 = orange, P5/P6/P7 = green
  if (n <= 2) return "#FF3B30";
  if (n <= 4) return "#FB8C00";
  return "#0F9D58";
}

function getPriorityNumber(value) {
  const normalized = normalizePriority(value);
  const n = Number(String(normalized).slice(1));
  return Number.isFinite(n) && n >= 0 && n <= 7 ? n : 0;
}

function getNextPriority(currentPriority) {
  const n = getPriorityNumber(currentPriority);
  const next = (n + 1) % 8;
  return `P${next}`;
}

function getStatusColor(value) {
  const status = String(value || "")
    .trim()
    .toLowerCase();

  switch (status) {
    case "delivered":
      return "bg-green-100 text-green-800 border border-green-300";
    case "checked":
      return "bg-yellow-100 text-yellow-800 border border-yellow-300";
    default:
      return "bg-red-100 text-red-800 border border-red-300";
  }
}

function getStatusKey(delivery) {
  const apiStatus = String(delivery?.status || "")
    .trim()
    .toLowerCase();

  if (["delivered", "checked", "pending"].includes(apiStatus)) {
    return apiStatus;
  }

  const type = String(delivery?.type || "")
    .trim()
    .toLowerCase();

  if (type === "delivered") return "delivered";
  if (CHECKED_TYPES.includes(type)) return "checked";

  return "pending";
}

function parseTimestampMs(value) {
  if (!value) return 0;

  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  if (typeof value === "number") {
    return value < 1e12 ? value * 1000 : value;
  }

  if (typeof value === "string") {
    const date = Date.parse(value);
    return Number.isNaN(date) ? 0 : date;
  }

  if (typeof value === "object") {
    const seconds = value.seconds ?? value._seconds;
    const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;

    if (typeof seconds === "number") {
      return seconds * 1000 + Math.floor(nanoseconds / 1e6);
    }
  }

  return 0;
}

function getDeliveryTimeMs(delivery) {
  const timeFromTimestamp = parseTimestampMs(delivery?.timestamp);
  if (timeFromTimestamp > 0) return timeFromTimestamp;

  const fromDocId = parseTimestampMs(delivery?.id);
  return fromDocId > 0 ? fromDocId : 0;
}

function buildLatestStatusMap(customersWithDeliveries) {
  const statusMap = {};

  customersWithDeliveries.forEach((customer) => {
    const deliveries = Array.isArray(customer?.deliveries)
      ? customer.deliveries
      : [];

    if (!deliveries.length) {
      statusMap[customer.id] = "Pending";
      return;
    }

    const latestDelivery = deliveries.reduce((latest, current) => {
      return getDeliveryTimeMs(current) > getDeliveryTimeMs(latest)
        ? current
        : latest;
    }, deliveries[0]);

    statusMap[customer.id] = normalizeStatus(getStatusKey(latestDelivery));
  });

  return statusMap;
}

function getImage(c) {
  return c.imageUrl || c.image || "https://via.placeholder.com/48";
}
