import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { ADMIN_PATH } from "../constant";
import {
  Zap,
  Calendar,
  CalendarDays,
  User,
  Search,
  Filter,
  Copy,
  Plus,
  Trash2,
  Eye,
  X,
  LayoutGrid,
  Table as TableIcon,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Building2,
  ChevronDown,
  Clock,
  DollarSign,
} from "lucide-react";

function getTodayDateKey(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch (e) {
    // fallback
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getFirstDayOfWeekKey(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  // Monday as first day of week (Sunday is 0)
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return getTodayDateKey(date);
}

function getFirstDayOfMonthKey(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function getFirstDayOfPrevMonthKey(d = new Date()) {
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const year = prev.getFullYear();
  const month = String(prev.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function getLastDayOfPrevMonthKey(d = new Date()) {
  const last = new Date(d.getFullYear(), d.getMonth(), 0);
  const year = last.getFullYear();
  const month = String(last.getMonth() + 1).padStart(2, "0");
  const day = String(last.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateDaysAgoKey(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getTodayDateKey(d);
}

function formatDateTimeDisplay(dateVal, createdAtVal) {
  let timeStr = "";
  let dateStr = dateVal || "";

  if (createdAtVal) {
    if (typeof createdAtVal === "object" && (createdAtVal._seconds || createdAtVal.seconds)) {
      const s = createdAtVal._seconds || createdAtVal.seconds;
      const d = new Date(s * 1000);
      timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      if (!dateStr) {
        dateStr = d.toISOString().slice(0, 10);
      }
    } else if (typeof createdAtVal === "string" || typeof createdAtVal === "number") {
      const d = new Date(createdAtVal);
      if (!isNaN(d.getTime())) {
        timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
        if (!dateStr) {
          dateStr = d.toISOString().slice(0, 10);
        }
      }
    }
  }

  return { date: dateStr, time: timeStr };
}

export default function AdvanceManagement() {
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const [deliveryPartners, setDeliveryPartners] = useState([]);
  const [salesPartners, setSalesPartners] = useState([]);
  const [outletsList, setOutletsList] = useState([]);

  // Date Filters (Default: Today)
  const [preset, setPreset] = useState("today"); // 'today' | 'this_week' | 'this_month' | 'last_month' | 'last_30_days' | 'all_time' | 'custom'
  const [fromDate, setFromDate] = useState(() => getTodayDateKey());
  const [toDate, setToDate] = useState(() => getTodayDateKey());
  const [selectedAgent, setSelectedAgent] = useState("__all__");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("summary"); // 'summary' | 'detailed'

  // Log Advance Modal State
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logAgent, setLogAgent] = useState("");
  const [logOutlet, setLogOutlet] = useState("");
  const [logDate, setLogDate] = useState(() => getTodayDateKey());
  const [logAmount, setLogAmount] = useState("");
  const [logRemarks, setLogRemarks] = useState("");
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError, setLogError] = useState("");

  // Toast Helper
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  };

  // Fetch Delivery Partners, Sales Partners, and Outlets
  const fetchAllPersonnel = async () => {
    try {
      const [delRes, salesRes] = await Promise.all([
        axios.get(`${ADMIN_PATH}/get-del-partner`).catch(() => ({ data: [] })),
        axios.get(`${ADMIN_PATH}/get-sales-partner`).catch(() => ({ data: [] })),
      ]);

      const delData = Array.isArray(delRes.data)
        ? delRes.data
        : (delRes.data?.data || delRes.data?.deliveryPartners || []);
      const salesData = Array.isArray(salesRes.data)
        ? salesRes.data
        : (salesRes.data?.data || salesRes.data?.salesPartners || []);

      setDeliveryPartners(delData);
      setSalesPartners(salesData);

      const outletsSet = new Set();
      delData.forEach((p) => {
        const out = (p.outlet || "").trim();
        if (out && out !== "-") outletsSet.add(out);
      });
      salesData.forEach((p) => {
        const out = (p.outlet || "").trim();
        if (out && out !== "-") outletsSet.add(out);
      });
      setOutletsList(Array.from(outletsSet).sort());
    } catch (err) {
      console.error("Error fetching personnel:", err);
    }
  };

  // Fetch Advances
  const fetchAdvances = useCallback(
    async (customFrom, customTo, customAgent) => {
      try {
        setRefreshing(true);
        const from = customFrom !== undefined ? customFrom : fromDate;
        const to = customTo !== undefined ? customTo : toDate;
        const ag = customAgent !== undefined ? customAgent : selectedAgent;

        const params = {};
        if (from && from !== "all") params.fromDate = from;
        if (to && to !== "all") params.toDate = to;
        if (ag && ag !== "__all__" && ag !== "all") params.agentName = ag;

        const res = await axios.get(`${ADMIN_PATH}/advances`, { params });
        if (res.data && res.data.success) {
          setAdvances(res.data.advances || []);
        }
      } catch (err) {
        console.error("Error fetching advances:", err);
        showToast("Failed to load advances");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fromDate, toDate, selectedAgent]
  );

  useEffect(() => {
    fetchAllPersonnel();
  }, []);

  useEffect(() => {
    fetchAdvances();
  }, [fetchAdvances]);

  // Unified list of delivery agents
  const sortedAgentsList = useMemo(() => {
    const list = new Map();

    const addPerson = (p) => {
      if (!p) return;
      const name = (p.name || p.displayName || p.deliveryAgent || p.fullName || "").trim();
      if (name && name !== "all" && name !== "__all__" && name !== "-") {
        const outlet = (p.outlet || p.outletName || "").trim();
        if (!list.has(name) || (outlet && !list.get(name).outlet)) {
          list.set(name, {
            id: p.id || p.uid || name,
            name,
            outlet: outlet || "",
            phone: p.phone || "",
            active: p.active !== undefined ? Boolean(p.active) : true,
          });
        }
      }
    };

    if (Array.isArray(deliveryPartners)) {
      deliveryPartners.forEach(addPerson);
    }
    if (Array.isArray(salesPartners)) {
      salesPartners.forEach(addPerson);
    }

    // Also include any agent names appearing in existing advances
    advances.forEach((adv) => {
      const name = (adv.agentName || "").trim();
      if (name && !list.has(name)) {
        list.set(name, {
          id: name,
          name,
          outlet: adv.outletName || "",
          active: true,
        });
      }
    });

    return Array.from(list.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [deliveryPartners, salesPartners, advances]);

  // Lookup map: agent name -> outlet
  const agentOutletMap = useMemo(() => {
    const map = {};
    sortedAgentsList.forEach((a) => {
      map[a.name.toLowerCase().trim()] = a.outlet;
    });
    return map;
  }, [sortedAgentsList]);

  // Delete Advance Entry
  const handleDeleteAdvance = async (entry) => {
    const amt = Number(entry.amount) || Number(entry.cash) || 0;
    const confirmMsg = `Are you sure you want to delete the advance entry of ₹${amt.toLocaleString("en-IN")} for ${entry.agentName} on ${entry.dateKey}?`;
    if (!window.confirm(confirmMsg)) return;

    setAdvances((prev) => prev.filter((a) => a.id !== entry.id));
    showToast("Advance entry deleted.");

    try {
      await axios.delete(`${ADMIN_PATH}/advances/${entry.id}`);
      fetchAdvances();
    } catch (err) {
      console.error("Error deleting advance:", err);
      const msg = err.response?.data?.message || "Failed to delete advance entry.";
      showToast(msg);
      fetchAdvances();
    }
  };

  // Filtered advances
  const filteredAdvances = useMemo(() => {
    return advances.filter((adv) => {
      if (selectedAgent !== "__all__" && selectedAgent !== "all") {
        if ((adv.agentName || "").toLowerCase().trim() !== selectedAgent.toLowerCase().trim()) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesAgent = (adv.agentName || "").toLowerCase().includes(q);
        const matchesOutlet = (adv.outletName || "").toLowerCase().includes(q);
        const matchesRemarks = (adv.remarks || "").toLowerCase().includes(q);
        const matchesSupervisor = (adv.supervisorName || "").toLowerCase().includes(q);
        if (!matchesAgent && !matchesOutlet && !matchesRemarks && !matchesSupervisor) return false;
      }
      return true;
    });
  }, [advances, selectedAgent, searchQuery]);

  // Total Advance Amount
  const totalAdvanceAmount = useMemo(() => {
    return filteredAdvances.reduce((sum, item) => sum + (Number(item.amount) || Number(item.cash) || 0), 0);
  }, [filteredAdvances]);

  // Group advances by Agent for Breakdown View
  const advanceAgentSummaries = useMemo(() => {
    const map = new Map();
    filteredAdvances.forEach((adv) => {
      const name = (adv.agentName || "Unknown").trim();
      const amt = Number(adv.amount) || Number(adv.cash) || 0;
      if (!map.has(name)) {
        map.set(name, {
          agentName: name,
          outletName: adv.outletName || agentOutletMap[name.toLowerCase()] || "",
          totalAmount: 0,
          count: 0,
          entries: [],
        });
      }
      const item = map.get(name);
      item.totalAmount += amt;
      item.count += 1;
      item.entries.push(adv);
    });
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredAdvances, agentOutletMap]);

  // Copy Advance Summary
  const handleCopyAdvanceSummary = () => {
    const dateLabel =
      fromDate && toDate
        ? fromDate === toDate
          ? fromDate
          : `${fromDate} to ${toDate}`
        : fromDate
        ? `From ${fromDate}`
        : toDate
        ? `Up to ${toDate}`
        : "All Recorded Dates";

    const targetLabel =
      selectedAgent !== "__all__" && selectedAgent !== "all"
        ? `Agent: ${selectedAgent}`
        : "All Delivery Agents Combined";

    const summaryText = [
      `ADVANCE PAYMENT REPORT — SALARY DEDUCTION MATH`,
      `Date Range: ${dateLabel}`,
      `Scope: ${targetLabel}`,
      `Total Advance Disbursed: ₹${totalAdvanceAmount.toLocaleString("en-IN")}`,
      `Total Transactions: ${filteredAdvances.length}`,
      `Agent Breakdown:`,
      ...advanceAgentSummaries.map(
        (s) =>
          `  - ${s.agentName} (${s.outletName || "No Outlet"}): ₹${s.totalAmount.toLocaleString("en-IN")} [${s.count}x]`
      ),
    ].join("\n");

    navigator.clipboard.writeText(summaryText);
    showToast("Advance summary copied to clipboard!");
  };

  // Submit Log Advance
  const handleLogAdvanceSubmit = async (e) => {
    e.preventDefault();
    if (!logAgent || !logAgent.trim()) {
      setLogError("Please select a delivery agent.");
      return;
    }
    const amtNum = parseFloat(logAmount);
    if (isNaN(amtNum) || amtNum <= 0) {
      setLogError("Please enter a valid advance amount in ₹.");
      return;
    }

    setLogError("");
    setLogSubmitting(true);

    const userRole =
      localStorage.getItem("userType") === "supervisor"
        ? "Supervisor (Web)"
        : "Admin (Web)";
    const outletVal = logOutlet || agentOutletMap[logAgent.toLowerCase().trim()] || "";

    const payload = {
      type: "advance",
      dateKey: logDate || getTodayDateKey(),
      agentName: logAgent.trim(),
      outletName: outletVal,
      amount: amtNum,
      cash: amtNum,
      value: amtNum,
      remarks: logRemarks.trim(),
      supervisorName: userRole,
    };

    try {
      const res = await axios.post(`${ADMIN_PATH}/add-inventory-entry`, payload);
      if (res.data && res.data.success) {
        showToast(`Advance payout of ₹${amtNum.toLocaleString("en-IN")} logged for ${logAgent}!`);
        setIsLogModalOpen(false);
        setLogAmount("");
        setLogRemarks("");
        await fetchAdvances();
      } else {
        showToast(res.data?.message || "Advance entry saved.");
        setIsLogModalOpen(false);
        setLogAmount("");
        setLogRemarks("");
        await fetchAdvances();
      }
    } catch (err) {
      console.error("Error submitting advance:", err);
      const msg =
        err.response?.data?.message ||
        "Failed to log advance payment. Please check if agent's day is locked.";
      setLogError(msg);
      showToast(msg);
    } finally {
      setLogSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 font-sans text-gray-800">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200 border border-gray-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Controls Card */}
      <div className="flex flex-col gap-4 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Zap className="h-6 w-6 text-amber-600" />
              Advance Management
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Review agent advance disbursements, date-wise totals, and salary deductions
            </p>
          </div>

          {/* Right column: Date Presets, Custom Range, Refresh & Log Advance Button */}
          <div className="flex flex-col items-start lg:items-end justify-end gap-2.5">
            {/* Row 1: Date Range & Presets */}
            <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2">
              <div className="inline-flex items-center gap-0.5 bg-gray-100 p-1 rounded-lg border border-gray-200 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setPreset("today");
                    setFromDate(getTodayDateKey());
                    setToDate(getTodayDateKey());
                    fetchAdvances(getTodayDateKey(), getTodayDateKey());
                  }}
                  className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                    preset === "today"
                      ? "bg-amber-600 text-white font-bold shadow-xs"
                      : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreset("this_week");
                    setFromDate(getFirstDayOfWeekKey());
                    setToDate(getTodayDateKey());
                    fetchAdvances(getFirstDayOfWeekKey(), getTodayDateKey());
                  }}
                  className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                    preset === "this_week"
                      ? "bg-amber-600 text-white font-bold shadow-xs"
                      : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                  }`}
                >
                  This Week
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreset("this_month");
                    setFromDate(getFirstDayOfMonthKey());
                    setToDate(getTodayDateKey());
                    fetchAdvances(getFirstDayOfMonthKey(), getTodayDateKey());
                  }}
                  className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                    preset === "this_month"
                      ? "bg-amber-600 text-white font-bold shadow-xs"
                      : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                  }`}
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreset("last_month");
                    setFromDate(getFirstDayOfPrevMonthKey());
                    setToDate(getLastDayOfPrevMonthKey());
                    fetchAdvances(getFirstDayOfPrevMonthKey(), getLastDayOfPrevMonthKey());
                  }}
                  className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                    preset === "last_month"
                      ? "bg-amber-600 text-white font-bold shadow-xs"
                      : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                  }`}
                >
                  Last Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreset("all_time");
                    setFromDate("");
                    setToDate("");
                    fetchAdvances("", "");
                  }}
                  className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                    preset === "all_time"
                      ? "bg-amber-600 text-white font-bold shadow-xs"
                      : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                  }`}
                >
                  All Time
                </button>
              </div>

              {/* Custom Date Inputs */}
              <div className="inline-flex items-center gap-1.5 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 shadow-2xs text-xs">
                <CalendarDays className="h-4 w-4 text-gray-500 shrink-0" />
                <span className="text-gray-500 font-medium">From:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setPreset("custom");
                    setFromDate(e.target.value);
                  }}
                  className="bg-transparent border-none outline-none font-semibold text-gray-900 cursor-pointer text-xs"
                />
                <span className="text-gray-400">•</span>
                <span className="text-gray-500 font-medium">To:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setPreset("custom");
                    setToDate(e.target.value);
                  }}
                  className="bg-transparent border-none outline-none font-semibold text-gray-900 cursor-pointer text-xs"
                />
                <button
                  type="button"
                  onClick={() => fetchAdvances()}
                  disabled={refreshing}
                  className="text-xs bg-amber-600 text-white hover:bg-amber-700 px-2 py-0.5 rounded font-bold transition cursor-pointer shadow-xs active:scale-95"
                >
                  Apply
                </button>
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => fetchAdvances()}
                disabled={refreshing}
                title="Refresh data"
                className="p-2 border border-gray-300 hover:bg-gray-50 rounded-lg text-gray-600 transition shadow-2xs cursor-pointer"
              >
                <RefreshCw size={15} className={refreshing ? "animate-spin text-amber-600" : ""} />
              </button>
            </div>

            {/* Row 2: Action Buttons */}
            <div className="flex items-center justify-end gap-2 self-start lg:self-end">
              <button
                type="button"
                onClick={() => {
                  setLogError("");
                  setIsLogModalOpen(true);
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
              >
                <Plus size={15} />
                <span>Log Advance</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-gray-200">
          {/* Agent Filter */}
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <span className="text-xs font-bold text-gray-600 uppercase shrink-0 flex items-center gap-1">
              <User className="h-4 w-4 text-amber-600" /> Filter Delivery Agent:
            </span>
            <select
              value={selectedAgent}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedAgent(val);
                fetchAdvances(fromDate, toDate, val);
              }}
              className="h-9 rounded-lg text-xs font-semibold bg-gray-50 border border-gray-300 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 px-3 py-1 outline-none flex-1 shadow-xs cursor-pointer"
            >
              <option value="__all__">All Delivery Agents ({sortedAgentsList.length})</option>
              {sortedAgentsList.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name} {a.outlet ? `(${a.outlet})` : ""}
                </option>
              ))}
            </select>

            {selectedAgent !== "__all__" && (
              <button
                type="button"
                onClick={() => {
                  setSelectedAgent("__all__");
                  fetchAdvances(fromDate, toDate, "__all__");
                }}
                className="h-8 w-8 shrink-0 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition grid place-items-center cursor-pointer"
                title="Clear agent filter"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search agent, outlet, remarks, or supervisor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9 text-xs font-medium rounded-lg bg-gray-50 border border-gray-300 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none w-full transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI & Summary Banner */}
      <div className="rounded-2xl border border-gray-200 border-l-4 border-l-amber-500 bg-white p-5 md:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-amber-50 text-amber-700 grid place-items-center font-bold shrink-0 border border-amber-200 shadow-xs">
            <Zap className="h-7 w-7" />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <span>Advance Payout Total</span>
              <span className="text-amber-600 font-bold">•</span>
              <span className="text-gray-900 font-bold">
                {fromDate && toDate
                  ? fromDate === toDate
                    ? fromDate
                    : `${fromDate} to ${toDate}`
                  : fromDate
                  ? `From ${fromDate}`
                  : toDate
                  ? `Up to ${toDate}`
                  : "All Time"}
              </span>
            </div>
            <div className="text-3xl font-black text-gray-900 flex items-center gap-3 mt-1">
              <span>₹{totalAdvanceAmount.toLocaleString("en-IN")}</span>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                {filteredAdvances.length} {filteredAdvances.length === 1 ? "Transaction" : "Transactions"}
              </span>
            </div>
            {selectedAgent !== "__all__" && (
              <p className="text-xs text-gray-600 font-semibold mt-1">
                Selected Agent: <span className="text-amber-700 font-bold">{selectedAgent}</span>
                {agentOutletMap[selectedAgent.toLowerCase().trim()] && (
                  <span className="text-gray-500 ml-1">
                    ({agentOutletMap[selectedAgent.toLowerCase().trim()]})
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end md:self-auto">
          <button
            type="button"
            onClick={handleCopyAdvanceSummary}
            className="h-10 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl px-4 border border-gray-300 shadow-xs flex items-center gap-2 transition cursor-pointer active:scale-95"
          >
            <Copy className="h-4 w-4 text-amber-600" />
            <span>Copy Summary</span>
          </button>
          {selectedAgent !== "__all__" && (
            <button
              type="button"
              onClick={() => {
                setSelectedAgent("__all__");
                fetchAdvances(fromDate, toDate, "__all__");
              }}
              className="h-10 text-xs font-semibold rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3.5 transition cursor-pointer"
            >
              View All Agents
            </button>
          )}
        </div>
      </div>

      {/* View Mode Switcher */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="inline-flex items-center p-1 rounded-xl bg-gray-100 border border-gray-200 gap-1">
          <button
            type="button"
            onClick={() => setViewMode("summary")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all cursor-pointer ${
              viewMode === "summary"
                ? "bg-white text-gray-900 shadow-xs border border-gray-200"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <LayoutGrid className="h-4 w-4 text-amber-600" />
            <span>Agent Breakdown ({advanceAgentSummaries.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("detailed")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all cursor-pointer ${
              viewMode === "detailed"
                ? "bg-white text-gray-900 shadow-xs border border-gray-200"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <TableIcon className="h-4 w-4 text-amber-600" />
            <span>Detailed Transactions Log ({filteredAdvances.length})</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: AGENT-WISE SUMMARY */}
      {viewMode === "summary" && (
        <div className="space-y-4">
          {advanceAgentSummaries.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {advanceAgentSummaries.map((item) => {
                const isSelected =
                  selectedAgent.toLowerCase().trim() === item.agentName.toLowerCase().trim();
                return (
                  <div
                    key={item.agentName}
                    className={`rounded-2xl border p-4 bg-white shadow-2xs transition flex flex-col justify-between space-y-3 ${
                      isSelected
                        ? "ring-2 ring-amber-500 border-amber-500 bg-amber-50/20"
                        : "border-gray-200 hover:border-amber-300 hover:shadow-md"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                            <User className="h-4 w-4 text-amber-600" />
                            {item.agentName}
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 font-medium">
                            <Building2 className="h-3 w-3 text-gray-400" />
                            Outlet:{" "}
                            <span className="text-gray-700 font-semibold">
                              {item.outletName || "Not Assigned"}
                            </span>
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          {item.count} {item.count === 1 ? "entry" : "entries"}
                        </span>
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-baseline justify-between">
                        <span className="text-xs text-gray-500 font-semibold">Total Advance:</span>
                        <span className="text-lg font-black text-amber-700">
                          ₹{item.totalAmount.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAgent(item.agentName);
                          fetchAdvances(fromDate, toDate, item.agentName);
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-800 transition flex items-center gap-1 cursor-pointer"
                      >
                        <Filter className="h-3 w-3 text-amber-600" />
                        <span>Filter</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAgent(item.agentName);
                          setViewMode("detailed");
                          fetchAdvances(fromDate, toDate, item.agentName);
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="h-3 w-3" />
                        <span>View Log</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center space-y-2 shadow-2xs">
              <Zap className="h-10 w-10 text-gray-300 mx-auto" />
              <div className="font-bold text-base text-gray-800">No advance records found</div>
              <div className="text-xs text-gray-500 max-w-sm mx-auto">
                No advance payouts logged matching the current date range or agent filter.
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: DETAILED TRANSACTIONS LIST */}
      {viewMode === "detailed" && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider text-[11px]">
                  <th className="px-5 py-3.5">Date & Time</th>
                  <th className="px-5 py-3.5">Agent Name</th>
                  <th className="px-5 py-3.5">Outlet</th>
                  <th className="px-5 py-3.5 text-right">Advance Amount</th>
                  <th className="px-5 py-3.5">Supervisor</th>
                  <th className="px-5 py-3.5">Remarks</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAdvances.map((adv) => {
                  const { date: dateDisplay, time: timeDisplay } = formatDateTimeDisplay(
                    adv.dateKey,
                    adv.createdAt
                  );
                  const amt = Number(adv.amount) || Number(adv.cash) || 0;

                  return (
                    <tr key={adv.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-gray-900 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-amber-600 shrink-0" />
                          <span>{dateDisplay || "—"}</span>
                          {timeDisplay && (
                            <span className="text-gray-400 font-normal text-xs">
                              ({timeDisplay})
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-3.5 font-bold text-gray-900 whitespace-nowrap">
                        {adv.agentName || "Unknown"}
                      </td>

                      <td className="px-5 py-3.5 font-medium text-gray-700 whitespace-nowrap">
                        {adv.outletName || agentOutletMap[(adv.agentName || "").toLowerCase().trim()] || "—"}
                      </td>

                      <td className="px-5 py-3.5 text-right font-black text-amber-700 whitespace-nowrap text-sm">
                        ₹{amt.toLocaleString("en-IN")}
                      </td>

                      <td className="px-5 py-3.5 text-gray-600 font-medium whitespace-nowrap">
                        {adv.supervisorName || "Admin (Web)"}
                      </td>

                      <td className="px-5 py-3.5 text-gray-600 max-w-sm truncate" title={adv.remarks}>
                        {adv.remarks || <span className="text-gray-300 italic">None</span>}
                      </td>

                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleDeleteAdvance(adv)}
                          title="Delete advance entry"
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredAdvances.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-gray-500 space-y-2">
                      <Zap className="h-10 w-10 text-gray-300 mx-auto" />
                      <div className="font-bold text-sm text-gray-700">No advance entries recorded</div>
                      <div className="text-xs text-gray-400">
                        No advance entries found matching the current date range or agent filter.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Log Advance Modal */}
      {isLogModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-700 grid place-items-center font-bold shrink-0 border border-amber-200">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Log Advance Payment</h3>
                  <p className="text-xs text-gray-500">Record cash / bank advance disbursed to agent</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLogModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Error Message */}
            {logError && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-3.5 py-2.5 rounded-r-lg text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <span>{logError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogAdvanceSubmit} className="space-y-4 text-xs font-medium">
              {/* Agent Select */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Delivery Agent <span className="text-red-500">*</span>
                </label>
                <select
                  value={logAgent}
                  onChange={(e) => {
                    const ag = e.target.value;
                    setLogAgent(ag);
                    if (ag && agentOutletMap[ag.toLowerCase().trim()]) {
                      setLogOutlet(agentOutletMap[ag.toLowerCase().trim()]);
                    }
                  }}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  required
                >
                  <option value="">Select Agent...</option>
                  {sortedAgentsList.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name} {a.outlet ? `(${a.outlet})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Outlet (Auto / Manual) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Outlet / Branch
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kengeri, Koramangala..."
                  value={logOutlet}
                  onChange={(e) => setLogOutlet(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Date & Advance Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    placeholder="e.g. 500"
                    value={logAmount}
                    onChange={(e) => setLogAmount(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-bold text-amber-700 outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Remarks / Purpose (Optional)
                </label>
                <textarea
                  rows="2"
                  placeholder="Reason for advance payout..."
                  value={logRemarks}
                  onChange={(e) => setLogRemarks(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsLogModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={logSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm transition active:scale-95 disabled:bg-amber-400 flex items-center gap-1.5 cursor-pointer"
                >
                  {logSubmitting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Advance</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
