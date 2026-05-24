import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FiUsers } from "react-icons/fi";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { ADMIN_PATH } from "../constant";
import {
  getCachedUserInfo,
  patchCachedUserInfoCustomer,
} from "../utils/customerInfoClientCache";
import {
  getTodayEffectiveStatus as resolveTodayEffectiveStatus,
} from "../utils/aiSuggestionEngine";

// TABS
const TABS = ["ALL", "ONBOARDING", "D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"];

export default function CustomerManagement() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  const [activeTab, setActiveTab] = useState("ALL");
  const [sortBy, setSortBy] = useState("deliveryGap");
  const [updatingTodayId, setUpdatingTodayId] = useState(null);
  const [updatingSkipId, setUpdatingSkipId] = useState(null);

  const canDownloadExcel = true;
  const todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata");

  // ─── Helper: normalise a page response into rows ──────────────────────────
  const normaliseRows = (rows) =>
    rows.map((c) => ({
      ...c,
      peakFrequency: computePeakFrequency(c.last8Days),
      potential: computePotential(c.last8Days),
      deliveryGap: computeDeliveryGap(c.last8Days, todayDate),
    }));

  // ─── Initial load: all customers ──────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const userInfoData = await getCachedUserInfo();

        // Fetch all customers
        const paginationData = userInfoData;
        const rows = Array.isArray(paginationData.customers)
          ? paginationData.customers
          : Array.isArray(paginationData)
            ? paginationData
            : [];

        setCustomers(normaliseRows(rows));
      } catch (err) {
        console.error("CustomerManagement init error:", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, sortBy]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const getDeliveredCount = (customer) => {
    const last8Days = customer.last8Days || {};
    let count = 0;
    const today = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = getDateStringInTimeZone(d, "Asia/Kolkata");
      const entry = last8Days[dateStr];
      const status = typeof entry === "string" ? entry : entry?.status;
      if (status === "delivered") count++;
    }
    return count;
  };

  const getLatestStatus = (customer) => {
    const last8Days = customer.last8Days || {};
    const entry = last8Days[todayDate];
    const todayStatus = (typeof entry === "string" ? entry : entry?.status || "")
      .trim().toLowerCase();
    if (todayStatus === "delivered") return "Delivered";
    if (["checked", "reached", "price_mismatch", "stock_available", "other_vendor"].includes(todayStatus))
      return "Checked";
    return "Pending";
  };

  const getRemarkDisplay = (customer) => {
    const last8Days = customer.last8Days || {};
    const entry = last8Days[todayDate];
    const entryObj = typeof entry === "object" ? entry : {};
    const status = getLatestStatus(customer);
    if (status === "Delivered") {
      const trays = entryObj.trays || entryObj.quantity;
      if (trays && Number(trays) > 0) {
        const count = Number(trays);
        return count === 1 ? "1 tray" : `${count} trays`;
      }
      return "";
    }
    if (status === "Checked") return formatReasonLabel(entryObj.reason || "");
    return "";
  };

  const formatReasonLabel = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return raw.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getTodayEffectiveStatus = (customer) => {
    return resolveTodayEffectiveStatus(customer, todayDate);
  };

  // ─── Filter + Sort (on loaded data) ───────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...customers];
    if (activeTab === "ONBOARDING") {
      list = list.filter((c) => !c.zone || c.zone === "" || c.zone === null || c.zone === "UNASSIGNED");
    } else if (/^D[0-7]$/.test(activeTab)) {
      const targetDays = Number(activeTab.slice(1));
      list = list.filter((c) => getDeliveredCount(c) === targetDays);
    }
    if (sortBy === "name") {
      list.sort((a, b) => getName(a).toLowerCase().localeCompare(getName(b).toLowerCase()));
    } else if (sortBy === "zone") {
      list.sort((a, b) => String(a.zone || "").toLowerCase().localeCompare(String(b.zone || "").toLowerCase()));
    } else if (sortBy === "delivery") {
      const onFirst = (c) => (getTodayEffectiveStatus(c) === "ON" ? 0 : 1);
      list.sort((a, b) => {
        const diff = onFirst(a) - onFirst(b);
        if (diff !== 0) return diff;
        return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
      });
    } else if (sortBy === "status") {
      const statusRank = (c) => {
        const s = getLatestStatus(c).toLowerCase();
        if (s === "delivered") return 0;
        if (s === "checked") return 1;
        return 2;
      };
      list.sort((a, b) => {
        const diff = statusRank(a) - statusRank(b);
        if (diff !== 0) return diff;
        return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
      });
    } else if (sortBy === "peakFrequency") {
      list.sort((a, b) => {
        const diff = getPeakFrequencyNumber(b) - getPeakFrequencyNumber(a);
        if (diff !== 0) return diff;
        return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
      });
    } else if (sortBy === "peakPotential") {
      list.sort((a, b) => {
        const diff = getPotentialNumber(b.potential) - getPotentialNumber(a.potential);
        if (diff !== 0) return diff;
        return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
      });
    } else if (sortBy === "deliveryGap") {
      list.sort((a, b) => {
        const diff = getDeliveryGapNumber(a.deliveryGap) - getDeliveryGapNumber(b.deliveryGap);
        if (diff !== 0) return diff;
        return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
      });
    } else if (sortBy === "remarks") {
      const withR = list.filter((c) => getRemarkDisplay(c) !== "");
      const noR = list.filter((c) => getRemarkDisplay(c) === "");
      withR.sort((a, b) => getRemarkDisplay(a).toLowerCase().localeCompare(getRemarkDisplay(b).toLowerCase()));
      noR.sort((a, b) => getName(a).toLowerCase().localeCompare(getName(b).toLowerCase()));
      return [...withR, ...noR];
    } else if (sortBy === "skipFrequency") {
      list.sort((a, b) => {
        const getRank = (c) => {
          const val = getSkipSelectValue(c);
          if (val === "MANUAL") return 999;
          if (val.startsWith("AUTO:")) {
            const num = Number(val.split(":")[1]);
            return Number.isFinite(num) ? num : 999;
          }
          return 999;
        };
        const diff = getRank(a) - getRank(b);
        if (diff !== 0) return diff;
        return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
      });
    } else {
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return list;
  }, [customers, activeTab, sortBy, todayDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredActiveCount = useMemo(() => {
    return filtered.filter((c) => getTodayEffectiveStatus(c) === "ON").length;
  }, [filtered, todayDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Total Peak Potential: sum of all T-numbers in current tab ────────────
  const totalPeakPotential = useMemo(() => {
    return filtered.reduce((sum, c) => sum + getPotentialNumber(c.potential), 0);
  }, [filtered]);

  // ─── Potential Achieved: sum of trays delivered TODAY in current tab ───────
  const potentialAchieved = useMemo(() => {
    return filtered.reduce((sum, c) => {
      const last8Days = c.last8Days || {};
      const entry = last8Days[todayDate];
      if (!entry) return sum;
      const status = (typeof entry === "string" ? entry : entry?.status || "").trim().toLowerCase();
      if (status !== "delivered") return sum;
      const trays = entry.traysDelivered ?? entry.trays ?? entry.quantity ?? entry?.deliveredTrays ?? 0;
      const numTrays = Number(trays);
      return sum + (Number.isFinite(numTrays) && numTrays > 0 ? numTrays : 0);
    }, 0);
  }, [filtered, todayDate]);

  // ─── Toggle delivery (optimistically adjusts totalActive) ─────────────────
  const toggleTodayDelivery = async (customer) => {
    if (!customer?.id || updatingTodayId === customer.id) return;

    const current = getTodayEffectiveStatus(customer);
    const nextStatus = current === "ON" ? "OFF" : "ON";
    const previousOverride = customer.todayOverride;
    const optimisticOverride = { date: todayDate, status: nextStatus };

    // Optimistic UI: row update
    setCustomers((prev) =>
      prev.map((row) => row.id === customer.id ? { ...row, todayOverride: optimisticOverride } : row)
    );

    try {
      setUpdatingTodayId(customer.id);
      const res = await axios.post(`${ADMIN_PATH}/customer/toggle-delivery`, {
        id: customer.id,
        status: nextStatus,
      });
      const saved = res?.data?.todayOverride;
      if (saved?.date && saved?.status) {
        patchCachedUserInfoCustomer(customer.id, (row) => ({
          ...row,
          todayOverride: saved,
        }));
        setCustomers((prev) =>
          prev.map((row) => row.id === customer.id ? { ...row, todayOverride: saved } : row)
        );
      }
    } catch (err) {
      console.error("Today delivery toggle error:", err);
      // Revert row
      setCustomers((prev) =>
        prev.map((row) => row.id === customer.id ? { ...row, todayOverride: previousOverride } : row)
      );
    } finally {
      setUpdatingTodayId(null);
    }
  };

  const updateSkipConfig = async (customer, selectedValue) => {
    if (!customer?.id || updatingSkipId === customer.id) return;
    const previousConfig = customer.skipConfig;
    const today = getDateStringInTimeZone(new Date(), "Asia/Kolkata");
    let nextConfig = { type: "MANUAL", days: 0, startDate: null };
    if (String(selectedValue || "").toUpperCase() !== "MANUAL") {
      const parts = String(selectedValue).split(":");
      nextConfig = { type: "AUTO", days: clampDays0to6(parts[1]), startDate: today };
    }
    setCustomers((prev) =>
      prev.map((row) => row.id === customer.id ? { ...row, skipConfig: nextConfig } : row)
    );
    try {
      setUpdatingSkipId(customer.id);
      const res = await axios.post(`${ADMIN_PATH}/customer/skip-config`, {
        id: customer.id, type: nextConfig.type, days: nextConfig.days, startDate: nextConfig.startDate,
      });
      const saved = res?.data?.skipConfig;
      if (saved && typeof saved === "object") {
        patchCachedUserInfoCustomer(customer.id, (row) => ({
          ...row,
          skipConfig: saved,
        }));
        setCustomers((prev) =>
          prev.map((row) => row.id === customer.id ? { ...row, skipConfig: saved } : row)
        );
      }
    } catch (err) {
      console.error("Skip config update error:", err);
      setCustomers((prev) =>
        prev.map((row) => row.id === customer.id ? { ...row, skipConfig: previousConfig } : row)
      );
    } finally {
      setUpdatingSkipId(null);
    }
  };

  // ─── Excel ────────────────────────────────────────────────────────────────
  const downloadExcel = () => {
    if (!canDownloadExcel) return;
    const data = filtered.map((c) => ({
      "Customer ID": c.custid || c.id,
      Name: getName(c),
      Zone: c.zone || "",
      Peak_Potential: normalizePotential(c.potential),
      Peak_Frequency: getPeakFrequencyLabel(c),
      Delivery_Gap: normalizeDeliveryGap(c.deliveryGap),
      Status: getLatestStatus(c),
      Remarks: getRemarkDisplay(c),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab);
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf]), `${activeTab}.xlsx`);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedCustomers = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6 w-full">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Customer Management</h1>

        <div className="flex items-center gap-4">
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
              <option value="peakPotential">Peak_Potential</option>
              <option value="peakFrequency">Peak_Frequency</option>
              <option value="deliveryGap">Delivery_Gap</option>
              <option value="zone">Zone</option>
              <option value="delivery">Delivery Plan </option>
              <option value="status">Status </option>
              <option value="remarks">Remarks </option>
              <option value="skipFrequency">Skip Frequency</option>
            </select>

            {canDownloadExcel && (
              <button
                onClick={downloadExcel}
                className="bg-green-600 text-white px-4 py-2 rounded-lg"
              >
                Download {activeTab}
              </button>
            )}
          </div>

          {/* ⭐ Total Active: dynamic based on selected tab and manual overrides */}
          <div className="bg-white p-4 rounded-xl shadow border-l-4 border-green-500">
            <p className="text-sm text-gray-600">Total Active</p>
            <p className="text-2xl font-bold text-green-600">
              {loading ? "…" : filteredActiveCount}
            </p>
          </div>
        </div>
      </div>

      {/* ⭐ Total Peak Potential & Potential Achieved row */}
      <div className="flex gap-4 mb-4">
        <div className="bg-white px-5 py-3 rounded-xl shadow border-l-4 border-orange-500">
          <p className="text-xs text-gray-500 whitespace-nowrap">Total Peak Potential</p>
          <p className="text-xl font-bold text-orange-600">
            {loading ? "…" : `T(${totalPeakPotential})`}
          </p>
        </div>

        <div className="bg-white px-5 py-3 rounded-xl shadow border-l-4 border-purple-500">
          <p className="text-xs text-gray-500 whitespace-nowrap">Potential Achieved</p>
          <p className="text-xl font-bold text-purple-600">
            {loading ? "…" : potentialAchieved}
          </p>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-xl border ${activeTab === t ? "bg-black text-white" : "bg-white"}`}
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
              <th className="p-3">Customer ID</th>
              <th className="p-3">Name</th>
              <th className="p-3">Zone</th>
              <th className="p-3">Delivery Plan</th>
              <th className="p-3">Skip</th>
              <th className="p-3">Peak_Potential</th>
              <th className="p-3">Peak_Frequency</th>
              <th className="p-3">Delivery_Gap</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>

          <tbody>
            {paginatedCustomers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-3 font-medium">{c.custid || c.id}</td>
                <td className="p-3 font-medium">{getName(c)}</td>
                <td className="p-3 font-medium text-gray-700">{c.zone || "UNASSIGNED"}</td>

                <td className="p-3">
                  {(() => {
                    const effective = getTodayEffectiveStatus(c);
                    const isOn = effective === "ON";
                    const isUpdating = updatingTodayId === c.id;
                    return (
                      <label className={`relative inline-flex items-center ${isUpdating ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}>
                        <input type="checkbox" className="sr-only peer" checked={isOn}
                          disabled={isUpdating} onChange={() => toggleTodayDelivery(c)}
                          aria-label={isOn ? "Today: ON" : "Today: OFF"} />
                        <div className="w-12 h-6 bg-gray-300 rounded-full peer peer-checked:bg-green-600 transition-colors" />
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-6" />
                      </label>
                    );
                  })()}
                </td>

                <td className="p-3">
                  {(() => {
                    const isUpdating = updatingSkipId === c.id;
                    return (
                      <div className="flex items-center justify-center">
                        <select value={getSkipSelectValue(c)} disabled={isUpdating}
                          onChange={(e) => updateSkipConfig(c, e.target.value)}
                          className={`border rounded-lg px-3 py-2 ${isUpdating ? "opacity-70 cursor-not-allowed" : ""}`}>
                          <option value="MANUAL">Manual Override</option>
                          <option value="AUTO:0">0 Days</option>
                          <option value="AUTO:1">1 Days</option>
                          <option value="AUTO:2">2 Days</option>
                          <option value="AUTO:3">3 Days</option>
                          <option value="AUTO:4">4 Days</option>
                          <option value="AUTO:5">5 Days</option>
                          <option value="AUTO:6">6 Days</option>
                        </select>
                      </div>
                    );
                  })()}
                </td>

                <td className="p-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: getPotentialColor(c.potential) }}>
                    {normalizePotential(c.potential)}
                  </span>
                </td>

                <td className="p-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: getPeakFrequencyColor(c) }}>
                    {getPeakFrequencyLabel(c)}
                  </span>
                </td>

                <td className="p-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: getDeliveryGapColor(c.deliveryGap) }}>
                    {normalizeDeliveryGap(c.deliveryGap)}
                  </span>
                </td>

                <td className="p-3">
                  <div className="flex flex-col items-center gap-1">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(getLatestStatus(c))}`}>
                      {getLatestStatus(c)}
                    </span>
                    <span className="text-[10px] text-gray-500 font-medium">{getRemarkDisplay(c)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination UI */}
        {!loading && (
          <div className="p-4 flex items-center justify-between border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function getName(c) {
  return c.name || c.customerName || "Unknown";
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

function getDateStringInTimeZone(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;

    if (year && month && day) return `${year}-${month}-${day}`;
    // eslint-disable-next-line no-unused-vars
  } catch (error) {
    // fall through
  }

  return new Date().toISOString().slice(0, 10);
}

function normalizePotential(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!raw) return "T1";

  const normalized = raw.replace(/T\s*(\d+)/, "T$1");
  const match = normalized.match(/^T(\d+)$/);
  if (match) {
    const num = Number(match[1]);
    return Number.isFinite(num) && num > 0 ? `T${num}` : "T1";
  }

  return "T1";
}

function resolvePeakFrequency(customer) {
  const currentPeak = `D${getDeliveredCountForCustomer(customer)}`;
  const savedPeak = normalizePeakFrequency(
    customer?.Peak_Frequency ||
    customer?.peakFrequency ||
    customer?.peak_frequency,
  );

  if (!savedPeak) return currentPeak;

  return getFrequencyNumber(savedPeak) >= getFrequencyNumber(currentPeak)
    ? savedPeak
    : currentPeak;
}

function getPeakFrequencyLabel(customer) {
  return resolvePeakFrequency(customer);
}

function getPeakFrequencyNumber(customer) {
  return getFrequencyNumber(getPeakFrequencyLabel(customer));
}

function normalizePeakFrequency(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (/^D[0-7]$/.test(raw)) return raw;
  if (/^[0-7]$/.test(raw)) return `D${raw}`;

  return "";
}

function getFrequencyNumber(value) {
  const normalized = normalizePeakFrequency(value);
  const n = Number(String(normalized).slice(1));
  return Number.isFinite(n) && n >= 0 && n <= 7 ? n : 0;
}

function getDeliveredCountForCustomer(customer) {
  const last8Days = customer?.last8Days || {};
  let count = 0;
  const today = new Date();

  // Check last 7 days (excluding today: yesterday through 7 days ago)
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = getDateStringInTimeZone(d, "Asia/Kolkata");

    const entry = last8Days[dateStr];
    const status = typeof entry === "string" ? entry : entry?.status;
    if (status === "delivered") {
      count++;
    }
  }

  return count;
}

function getPeakFrequencyColor(customer) {
  const n = getPeakFrequencyNumber(customer);

  if (n <= 2) return "#FF3B30";
  if (n <= 4) return "#FB8C00";
  return "#0F9D58";
}

function getPotentialColor(value) {
  const potential = normalizePotential(value);
  const num = parseInt(potential.slice(1), 10);

  // T1-T7 = red, T8-T15 = orange, T20+ = green
  if (num <= 7) return "#FF3B30"; // red
  if (num <= 15) return "#FB8C00"; // orange
  return "#0F9D58"; // green
}

function getPotentialNumber(value) {
  const potential = normalizePotential(value);
  const n = Number(potential.slice(1));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function normalizeDeliveryGap(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  const match = raw.match(/^G?(\d+)$/);
  if (!match) return "G10";

  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 0) return "G10";

  return `G${Math.min(Math.floor(n), 10)}`;
}

function getDeliveryGapNumber(value) {
  const gap = normalizeDeliveryGap(value);
  const n = Number(gap.slice(1));
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 10;
}

function getDeliveryGapColor(value) {
  const n = getDeliveryGapNumber(value);

  if (n === 0) return "#0F9D58";
  if (n <= 2) return "#FB8C00";
  return "#FF3B30";
}

function computeDeliveryGap(last8Days, todayDate) {
  if (!last8Days || typeof last8Days !== "object") return "G10";

  const todayDayNumber = getDateDayNumber(todayDate);
  if (todayDayNumber === null) return "G10";

  let latestDeliveredDayNumber = null;

  Object.entries(last8Days).forEach(([dateStr, entry]) => {
    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || "",
    )
      .trim()
      .toLowerCase();

    if (status !== "delivered") return;

    const dayNumber = getDateDayNumber(dateStr);
    if (dayNumber === null || dayNumber > todayDayNumber) return;

    if (latestDeliveredDayNumber === null || dayNumber > latestDeliveredDayNumber) {
      latestDeliveredDayNumber = dayNumber;
    }
  });

  if (latestDeliveredDayNumber === null) return "G10";

  return `G${Math.min(todayDayNumber - latestDeliveredDayNumber, 10)}`;
}

function getDateDayNumber(dateStr) {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);

  if (!Number.isFinite(time)) return null;

  return Math.floor(time / 86400000);
}

function computePeakFrequency(last8Days) {
  if (!last8Days || typeof last8Days !== "object") return "D0";

  let count = 0;
  const today = new Date();

  for (let i = 0; i <= 6; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = getDateStringInTimeZone(d, "Asia/Kolkata");
    const entry = last8Days[dateStr];
    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || "",
    )
      .trim()
      .toLowerCase();

    if (status === "delivered") count++;
  }

  return `D${Math.min(count, 7)}`;
}

function computePotential(last8Days) {
  if (!last8Days || typeof last8Days !== "object") return "T1";

  let maxTrays = 0;

  Object.values(last8Days).forEach((entry) => {
    if (!entry) return;

    const status = String(
      typeof entry === "string"
        ? entry
        : entry?.status || entry?.type || "",
    )
      .trim()
      .toLowerCase();

    if (status !== "delivered") return;

    const trays =
      entry.traysDelivered ?? entry.trays ?? entry.quantity ?? entry?.deliveredTrays ?? 0;
    const numTrays = Number(trays);

    if (Number.isFinite(numTrays) && numTrays > maxTrays) {
      maxTrays = numTrays;
    }
  });

  return maxTrays > 0 ? `T${maxTrays}` : "T1";
}

function clampDays0to6(value) {
  let n = Number(value);
  if (!Number.isFinite(n)) return 0;
  n = Math.floor(n);
  if (n < 0) return 0;
  if (n > 6) return 6;
  return n;
}

function getSkipSelectValue(customer) {
  const cfg = customer?.skipConfig;
  if (!cfg || String(cfg.type || "").toUpperCase() !== "AUTO") return "MANUAL";
  return `AUTO:${clampDays0to6(cfg.days)}`;
}

