import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { ADMIN_PATH } from "../constant";
import {
  Calendar,
  CalendarDays,
  User,
  Search,
  Filter,
  ArrowUpDown,
  Calculator,
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
  MapPin,
  Clock,
  FileText,
  Camera,
  Check,
  Building2,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Zap,
} from "lucide-react";

// Exact Penalty Types from Mobile App (Pic 2)
export const PENALTY_TYPES = [
  "Login Delay",
  "Customer Un-Attended",
  "Unpolite Behaviour to Customer",
  "Non Negotiating Attitude",
  "Early Log Out",
  "Non Completion of Customers Alloted",
  "Un-Authorised Leave",
  "Vehicle Charging Operation",
  "Cleaning of Vehicle",
  "Excess Damage",
];

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

function getPenaltySortTime(p) {
  if (p?.createdAt) {
    if (typeof p.createdAt === "object" && (p.createdAt._seconds || p.createdAt.seconds)) {
      return (p.createdAt._seconds || p.createdAt.seconds) * 1000;
    }
    const t = new Date(p.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (p?.dateKey) {
    const t = new Date(p.dateKey).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

export default function PenaltyManagement() {
  // Page view mode: 'entry' (Full Page Form) or 'reports' (Full Page Details Dashboard)
  const [currentPage, setCurrentPage] = useState("reports");

  const [deliveryPartners, setDeliveryPartners] = useState([]);
  const [salesPartners, setSalesPartners] = useState([]);
  const [outletsList, setOutletsList] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Filters for Reports Page (Default to all recorded entries so existing records immediately show)
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("__all__");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("summary"); // 'summary' | 'detailed'
  const [hideZeroPenalties, setHideZeroPenalties] = useState(true);
  const [sortBy, setSortBy] = useState("date_desc");

  // ⭐ Advance Reports State
  const [advances, setAdvances] = useState([]);
  const [loadingAdvances, setLoadingAdvances] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advancePreset, setAdvancePreset] = useState("today"); // 'today' | 'this_week' | 'this_month' | 'all_time' | 'custom'
  const [advanceFromDate, setAdvanceFromDate] = useState(() => getTodayDateKey());
  const [advanceToDate, setAdvanceToDate] = useState(() => getTodayDateKey());
  const [advanceSelectedAgent, setAdvanceSelectedAgent] = useState("__all__");
  const [advanceSearchQuery, setAdvanceSearchQuery] = useState("");
  const [advanceViewMode, setAdvanceViewMode] = useState("summary"); // 'summary' | 'detailed'

  // Full Page Entry Form State (Pic 2)
  const [formOutlet, setFormOutlet] = useState("");
  const [formAgent, setFormAgent] = useState("");
  const [formDate, setFormDate] = useState(getTodayDateKey());
  const [formPenaltyType, setFormPenaltyType] = useState(PENALTY_TYPES[0]);
  const [formRemarks, setFormRemarks] = useState("");
  const [formPhotoUrl, setFormPhotoUrl] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // View details item
  const [viewingPenalty, setViewingPenalty] = useState(null);

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

      // Extract unique outlets
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

  // Fetch Penalties
  const fetchPenalties = useCallback(async () => {
    try {
      setRefreshing(true);
      const params = {};
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      if (selectedAgent && selectedAgent !== "__all__") params.agentName = selectedAgent;

      const res = await axios.get(`${ADMIN_PATH}/penalties`, { params });

      if (res.data && res.data.success) {
        setPenalties(res.data.penalties || []);
      }
    } catch (err) {
      console.error("Error fetching penalties:", err);
      showToast("Failed to load penalties");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fromDate, toDate, selectedAgent]);

  // Fetch Advances
  const fetchAdvances = useCallback(async (customFrom, customTo, customAgent) => {
    try {
      setLoadingAdvances(true);
      const from = customFrom !== undefined ? customFrom : advanceFromDate;
      const to = customTo !== undefined ? customTo : advanceToDate;
      const ag = customAgent !== undefined ? customAgent : advanceSelectedAgent;

      const params = {};
      if (from) params.fromDate = from;
      if (to) params.toDate = to;
      if (ag && ag !== "__all__") params.agentName = ag;

      const res = await axios.get(`${ADMIN_PATH}/advances`, { params });
      if (res.data && res.data.success) {
        setAdvances(res.data.advances || []);
      }
    } catch (err) {
      console.error("Error fetching advances:", err);
      showToast("Failed to load advances");
    } finally {
      setLoadingAdvances(false);
    }
  }, [advanceFromDate, advanceToDate, advanceSelectedAgent]);

  useEffect(() => {
    if (isAdvanceModalOpen) {
      fetchAdvances();
    }
  }, [isAdvanceModalOpen, fetchAdvances]);

  useEffect(() => {
    fetchAllPersonnel();
  }, []);

  useEffect(() => {
    fetchPenalties();
  }, [fetchPenalties]);

  // Unified list of all delivery agents
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

    // Also include any agent names that appear in penalties
    penalties.forEach((pen) => {
      const name = (pen.agentName || "").trim();
      if (name && !list.has(name)) {
        list.set(name, {
          id: name,
          name,
          outlet: pen.outletName || "",
          active: true,
        });
      }
    });

    return Array.from(list.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [deliveryPartners, salesPartners, penalties]);

  // Lookup map: agent name -> outlet
  const agentOutletMap = useMemo(() => {
    const map = {};
    sortedAgentsList.forEach((a) => {
      map[a.name.toLowerCase().trim()] = a.outlet;
    });
    return map;
  }, [sortedAgentsList]);

  // When form outlet changes, update form agent if applicable
  const handleFormOutletChange = (outletVal) => {
    setFormOutlet(outletVal);
    if (outletVal) {
      const matchingAgent = sortedAgentsList.find(
        (a) => (a.outlet || "").toLowerCase().trim() === outletVal.toLowerCase().trim()
      );
      if (matchingAgent) {
        setFormAgent(matchingAgent.name);
      }
    }
  };

  // When form agent changes, auto-fill outlet
  const handleFormAgentChange = (agentVal) => {
    setFormAgent(agentVal);
    const assignedOutlet = agentOutletMap[agentVal.toLowerCase().trim()];
    if (assignedOutlet) {
      setFormOutlet(assignedOutlet);
    }
  };

  // Submit Penalty Form (Full Page Form - Pic 2)
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formAgent || !formAgent.trim()) {
      setFormError("Please select or enter a delivery agent.");
      return;
    }
    if (!formPenaltyType) {
      setFormError("Please select a penalty type.");
      return;
    }

    setFormError("");
    setFormSubmitting(true);

    const userRole =
      localStorage.getItem("userType") === "supervisor"
        ? "Supervisor (Web)"
        : "Admin (Web)";
    const outletVal = formOutlet || agentOutletMap[formAgent.toLowerCase().trim()] || "";

    const payload = {
      type: "penalty",
      dateKey: formDate || getTodayDateKey(),
      agentName: formAgent.trim(),
      outletName: outletVal,
      penaltyType: formPenaltyType,
      value: 0,
      remarks: formRemarks.trim(),
      photoUrl: formPhotoUrl.trim(),
      supervisorName: userRole,
    };

    try {
      const res = await axios.post(`${ADMIN_PATH}/add-inventory-entry`, payload);
      if (res.data && res.data.success) {
        showToast(`Penalty (${formPenaltyType}) logged for ${formAgent}!`);
        setFormRemarks("");
        setFormPhotoUrl("");
        await fetchPenalties();
        setCurrentPage("reports");
      } else {
        showToast(res.data?.message || "Saved penalty report.");
        await fetchPenalties();
        setCurrentPage("reports");
      }
    } catch (err) {
      console.error("Error submitting penalty:", err);
      const msg =
        err.response?.data?.message ||
        "Failed to submit penalty. Please check if agent's day is locked.";
      setFormError(msg);
      showToast(msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete Penalty Entry
  const handleDeletePenalty = async (entry) => {
    const confirmMsg = `Are you sure you want to delete penalty "${entry.penaltyType}" for ${entry.agentName} on ${entry.dateKey}?`;
    if (!window.confirm(confirmMsg)) return;

    setPenalties((prev) => prev.filter((p) => p.id !== entry.id));
    if (viewingPenalty?.id === entry.id) setViewingPenalty(null);
    showToast("Penalty entry deleted.");

    try {
      await axios.delete(`${ADMIN_PATH}/penalties/${entry.id}`);
      fetchPenalties();
    } catch (err) {
      console.error("Error deleting penalty:", err);
      const msg = err.response?.data?.message || "Failed to delete penalty entry.";
      showToast(msg);
      fetchPenalties();
    }
  };

  // Delete Advance Entry
  const handleDeleteAdvance = async (entry) => {
    const confirmMsg = `Are you sure you want to delete advance entry of ₹${entry.amount || entry.cash} for ${entry.agentName} on ${entry.dateKey}?`;
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

  // Filtered advances for Advance Reports Modal
  const filteredAdvances = useMemo(() => {
    return advances.filter((adv) => {
      if (advanceSelectedAgent !== "__all__") {
        if ((adv.agentName || "").toLowerCase().trim() !== advanceSelectedAgent.toLowerCase().trim()) {
          return false;
        }
      }
      if (advanceSearchQuery.trim()) {
        const q = advanceSearchQuery.toLowerCase().trim();
        const matchesAgent = (adv.agentName || "").toLowerCase().includes(q);
        const matchesOutlet = (adv.outletName || "").toLowerCase().includes(q);
        const matchesRemarks = (adv.remarks || "").toLowerCase().includes(q);
        if (!matchesAgent && !matchesOutlet && !matchesRemarks) return false;
      }
      return true;
    });
  }, [advances, advanceSelectedAgent, advanceSearchQuery]);

  // Total Advance Amount for current Advance Modal filter
  const totalAdvanceAmount = useMemo(() => {
    return filteredAdvances.reduce((sum, item) => sum + (Number(item.amount) || Number(item.cash) || 0), 0);
  }, [filteredAdvances]);

  // Group advances by Agent for Agent-Wise Summary
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
      advanceFromDate && advanceToDate
        ? (advanceFromDate === advanceToDate ? advanceFromDate : `${advanceFromDate} to ${advanceToDate}`)
        : advanceFromDate
        ? `From ${advanceFromDate}`
        : advanceToDate
        ? `Up to ${advanceToDate}`
        : "All Recorded Dates";

    const targetLabel = advanceSelectedAgent !== "__all__" ? `Agent: ${advanceSelectedAgent}` : "All Delivery Agents Combined";

    const summaryText = [
      `ADVANCE PAYMENT REPORT — SALARY DEDUCTION MATH`,
      `Date Range: ${dateLabel}`,
      `Scope: ${targetLabel}`,
      `Total Advance Disbursed: ₹${totalAdvanceAmount.toLocaleString("en-IN")}`,
      `Total Transactions: ${filteredAdvances.length}`,
      `Agent Breakdown:`,
      ...advanceAgentSummaries.map((s) => `  - ${s.agentName} (${s.outletName || "No Outlet"}): ₹${s.totalAmount.toLocaleString("en-IN")} [${s.count}x]`),
    ].join("\n");

    navigator.clipboard.writeText(summaryText);
    showToast("Advance summary copied to clipboard!");
  };

  // Filtered penalties for Reports Dashboard
  const filteredPenalties = useMemo(() => {
    return penalties.filter((p) => {
      // Agent filter
      if (selectedAgent !== "__all__") {
        if ((p.agentName || "").toLowerCase().trim() !== selectedAgent.toLowerCase().trim()) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesAgent = (p.agentName || "").toLowerCase().includes(q);
        const matchesOutlet = (p.outletName || "").toLowerCase().includes(q);
        const matchesType = (p.penaltyType || "").toLowerCase().includes(q);
        const matchesRemarks = (p.remarks || "").toLowerCase().includes(q);
        const matchesSupervisor = (p.supervisorName || "").toLowerCase().includes(q);
        if (!matchesAgent && !matchesOutlet && !matchesType && !matchesRemarks && !matchesSupervisor) {
          return false;
        }
      }

      return true;
    });
  }, [penalties, selectedAgent, searchQuery]);

  // Sorted detailed list
  const sortedDetailedPenalties = useMemo(() => {
    const list = [...filteredPenalties];
    list.sort((a, b) => {
      const tA = getPenaltySortTime(a);
      const tB = getPenaltySortTime(b);
      if (sortBy === "date_desc") return tB - tA;
      if (sortBy === "date_asc") return tA - tB;
      if (sortBy === "agent_asc") return (a.agentName || "").localeCompare(b.agentName || "");
      if (sortBy === "type_asc") return (a.penaltyType || "").localeCompare(b.penaltyType || "");
      return 0;
    });
    return list;
  }, [filteredPenalties, sortBy]);

  // Aggregate penalties per Single Person (Agent)
  const agentSummaries = useMemo(() => {
    return sortedAgentsList.map((agent) => {
      const agentKey = agent.name.toLowerCase().trim();
      const matches = penalties.filter(
        (p) => (p.agentName || "").toLowerCase().trim() === agentKey
      );

      // Group by penalty type
      const typeCounts = {};
      matches.forEach((p) => {
        const type = p.penaltyType || "Early Log Out";
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });

      // Sort chronological
      matches.sort((a, b) => getPenaltySortTime(b) - getPenaltySortTime(a));

      return {
        agent,
        penalties: matches,
        typeCounts,
        totalCount: matches.length,
      };
    });
  }, [sortedAgentsList, penalties]);

  // Filtered agent summaries for Agent-Wise Summary view
  const visibleAgentSummaries = useMemo(() => {
    return agentSummaries.filter(({ agent, totalCount }) => {
      if (selectedAgent !== "__all__" && agent.name.toLowerCase().trim() !== selectedAgent.toLowerCase().trim()) {
        return false;
      }
      if (hideZeroPenalties && selectedAgent === "__all__" && totalCount === 0) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = agent.name.toLowerCase().includes(q);
        const matchesOutlet = (agent.outlet || "").toLowerCase().includes(q);
        if (!matchesName && !matchesOutlet) return false;
      }
      return true;
    });
  }, [agentSummaries, selectedAgent, hideZeroPenalties, searchQuery]);

  // Total Penalties Count for current filter
  const totalPenaltiesCount = filteredPenalties.length;

  // Selected Agent Object
  const selectedAgentObj = useMemo(() => {
    if (selectedAgent === "__all__") return null;
    return (
      sortedAgentsList.find(
        (a) => a.name.toLowerCase().trim() === selectedAgent.toLowerCase().trim()
      ) || {
        name: selectedAgent,
        outlet: agentOutletMap[selectedAgent.toLowerCase().trim()] || "",
      }
    );
  }, [sortedAgentsList, selectedAgent, agentOutletMap]);

  // Violation Type Breakdown for current filter
  const overallTypeBreakdown = useMemo(() => {
    const counts = {};
    filteredPenalties.forEach((p) => {
      const type = p.penaltyType || "Early Log Out";
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filteredPenalties]);

  // Copy Summary to Clipboard formatted for payroll / salary math
  const handleCopySalarySummary = () => {
    const dateRangeLabel =
      fromDate && toDate
        ? `${fromDate} to ${toDate}`
        : fromDate
        ? `From ${fromDate}`
        : toDate
        ? `Up to ${toDate}`
        : "All Recorded Dates";

    if (selectedAgentObj) {
      const summaryText = [
        `OUTLET / AGENT PENALTY REPORT — SALARY TABULATION`,
        `Date Range: ${dateRangeLabel}`,
        `Agent: ${selectedAgentObj.name}`,
        `Outlet / Route: ${selectedAgentObj.outlet || "Not Assigned"}`,
        `Total Penalties: ${totalPenaltiesCount}`,
        `Breakdown:`,
        ...overallTypeBreakdown.map(([type, count]) => `  - ${count}x ${type}`),
      ].join("\n");

      navigator.clipboard.writeText(summaryText);
      showToast(`Penalty summary for "${selectedAgentObj.name}" copied!`);
    } else {
      const summaryText = [
        `ALL PERSONNEL PENALTY REPORT — SALARY TABULATION`,
        `Date Range: ${dateRangeLabel}`,
        `Total Reports Logged: ${totalPenaltiesCount}`,
        `Breakdown:`,
        ...overallTypeBreakdown.map(([type, count]) => `  - ${count}x ${type}`),
      ].join("\n");

      navigator.clipboard.writeText(summaryText);
      showToast("All personnel summary copied to clipboard!");
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

      {/* ========================================================================= */}
      {/* FULL PAGE 1: PENALTY ENTRY FORM (Web Dashboard Matched Design)            */}
      {/* ========================================================================= */}
      {currentPage === "entry" && (
        <div className="max-w-xl mx-auto py-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8 shadow space-y-6">
            {/* Top Navigation & Skip Button */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <button
                type="button"
                onClick={() => setCurrentPage("reports")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Reports</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentPage("reports")}
                className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Skip to View Details</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* Header */}
            <div className="flex items-start gap-3.5">
              <div className="h-11 w-11 rounded-lg bg-rose-50 text-rose-600 grid place-items-center font-bold shrink-0 border border-rose-200">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Penalty Report
                </h1>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">
                  Report violation or penalty for outlet agent.
                </p>
              </div>
            </div>

            {/* Error banner */}
            {formError && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-r-lg text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Main Form Fields */}
            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* 1. OUTLET NAME */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Outlet Name
                </label>
                <div className="relative">
                  <select
                    value={formOutlet}
                    onChange={(e) => handleFormOutletChange(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition appearance-none cursor-pointer"
                  >
                    <option value="">Select Outlet (Optional / Auto-fills)</option>
                    {outletsList.map((out) => (
                      <option key={out} value={out}>
                        {out}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-3.5 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* 2. AGENT NAME */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Agent Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formAgent}
                    onChange={(e) => handleFormAgentChange(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition appearance-none cursor-pointer"
                    required
                  >
                    <option value="" disabled>
                      {sortedAgentsList.length === 0 ? "Loading delivery agents..." : "Select Delivery Agent"}
                    </option>
                    {sortedAgentsList.map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.name} {a.outlet ? `(${a.outlet})` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-3.5 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* 3. DATE OF OCCURRENCE */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Date of Occurrence <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-sm font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition cursor-pointer"
                  required
                />
              </div>

              {/* 4. PENALTY TYPE */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Penalty Type <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formPenaltyType}
                    onChange={(e) => setFormPenaltyType(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition appearance-none cursor-pointer"
                    required
                  >
                    {PENALTY_TYPES.map((pt) => (
                      <option key={pt} value={pt}>
                        {pt}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-3.5 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* 5. REMARKS / NOTES */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Remarks / Notes (Optional)
                </label>
                <textarea
                  rows="2"
                  placeholder="Enter remarks or reason for violation..."
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition resize-none"
                />
              </div>

              {/* 6. PHOTO URL */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Photo / Verification URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://... (verification photo url if available)"
                  value={formPhotoUrl}
                  onChange={(e) => setFormPhotoUrl(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition active:scale-95 disabled:bg-blue-400 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {formSubmitting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Submitting Penalty...</span>
                    </>
                  ) : (
                    <span>Submit Penalty</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FULL PAGE 2: PENALTY REPORTS & TABULATION (Web Theme Matched)              */}
      {/* ========================================================================= */}
      {currentPage === "reports" && (
        <div className="space-y-6">
          {/* Top Header Card */}
          <div className="flex flex-col gap-4 bg-white border border-gray-200 rounded-xl p-5 shadow">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <ShieldAlert className="h-6 w-6 text-rose-600" />
                  Penalty & Advance Reports
                </h2>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  Filter by outlet & tabulate penalties and advance payouts for monthly salary calculations
                </p>
              </div>

              {/* Right column with controls row 1 (presets, custom date, refresh) and controls row 2 (View Advance, Log Penalty) */}
              <div className="flex flex-col items-start lg:items-end justify-end gap-2.5">
                {/* Row 1: Date Range & Quick Presets */}
                <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2">
                  <div className="inline-flex items-center gap-0.5 bg-gray-100 p-1 rounded-lg border border-gray-200 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setFromDate("");
                        setToDate("");
                      }}
                      className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                        !fromDate && !toDate
                          ? "bg-blue-600 text-white font-bold shadow-xs"
                          : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                      }`}
                    >
                      All Time
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFromDate(getFirstDayOfMonthKey());
                        setToDate(getTodayDateKey());
                      }}
                      className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                        fromDate === getFirstDayOfMonthKey() && toDate === getTodayDateKey()
                          ? "bg-blue-600 text-white font-bold shadow-xs"
                          : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                      }`}
                    >
                      This Month
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFromDate(getFirstDayOfPrevMonthKey());
                        setToDate(getLastDayOfPrevMonthKey());
                      }}
                      className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                        fromDate === getFirstDayOfPrevMonthKey() && toDate === getLastDayOfPrevMonthKey()
                          ? "bg-blue-600 text-white font-bold shadow-xs"
                          : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                      }`}
                    >
                      Last Month
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFromDate(getDateDaysAgoKey(30));
                        setToDate(getTodayDateKey());
                      }}
                      className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                        fromDate === getDateDaysAgoKey(30) && toDate === getTodayDateKey()
                          ? "bg-blue-600 text-white font-bold shadow-xs"
                          : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                      }`}
                    >
                      Last 30 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFromDate(getTodayDateKey());
                        setToDate(getTodayDateKey());
                      }}
                      className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${
                        fromDate === getTodayDateKey() && toDate === getTodayDateKey()
                          ? "bg-blue-600 text-white font-bold shadow-xs"
                          : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                      }`}
                    >
                      Today
                    </button>
                  </div>

                  {/* Custom Date Inputs */}
                  <div className="inline-flex items-center gap-1.5 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 shadow-2xs text-xs">
                    <CalendarDays className="h-4 w-4 text-gray-500 shrink-0" />
                    <span className="text-gray-500 font-medium">From:</span>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="bg-transparent border-none outline-none font-semibold text-gray-900 cursor-pointer text-xs"
                    />
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-500 font-medium">To:</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="bg-transparent border-none outline-none font-semibold text-gray-900 cursor-pointer text-xs"
                    />
                    {(fromDate || toDate) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFromDate("");
                          setToDate("");
                        }}
                        title="Clear custom date filter (View all records)"
                        className="text-gray-400 hover:text-gray-700 p-0.5 rounded cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Refresh Button */}
                  <button
                    type="button"
                    onClick={fetchPenalties}
                    disabled={refreshing}
                    title="Refresh data"
                    className="p-2 border border-gray-300 hover:bg-gray-50 rounded-lg text-gray-600 transition shadow-2xs cursor-pointer"
                  >
                    <RefreshCw size={15} className={refreshing ? "animate-spin text-blue-600" : ""} />
                  </button>
                </div>

                {/* Row 2: View Advance Button (left) and Log Penalty Button (right, directly below refresh button) */}
                <div className="flex items-center justify-end gap-2 self-start lg:self-end">
                  {/* View Advance Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdvanceModalOpen(true);
                      fetchAdvances();
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
                    title="View advance reports and payout summary"
                  >
                    <Zap size={15} />
                    <span>View Advance</span>
                  </button>

                  {/* Log New Penalty Button */}
                  <button
                    type="button"
                    onClick={() => setCurrentPage("entry")}
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
                  >
                    <Plus size={15} />
                    <span>Log Penalty</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Control Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-gray-200">
              {/* Agent / Outlet Selector */}
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <span className="text-xs font-bold text-gray-600 uppercase shrink-0 flex items-center gap-1">
                  <User className="h-4 w-4 text-blue-600" /> Filter Person / Outlet:
                </span>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="h-9 rounded-lg text-xs font-semibold bg-gray-50 border border-gray-300 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 px-3 py-1 outline-none flex-1 shadow-xs cursor-pointer"
                >
                  <option value="__all__">
                    All Personnel ({sortedAgentsList.length})
                  </option>
                  {sortedAgentsList.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name} {a.outlet ? `(${a.outlet})` : ""}
                    </option>
                  ))}
                </select>

                {selectedAgent !== "__all__" && (
                  <button
                    type="button"
                    onClick={() => setSelectedAgent("__all__")}
                    className="h-8 w-8 shrink-0 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition grid place-items-center cursor-pointer"
                    title="Clear filter"
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
                  placeholder="Search outlet, agent, or penalty type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 h-9 text-xs font-medium rounded-lg bg-gray-50 border border-gray-300 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-full transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Salary Math Tabulation Banner (Card matching CollectionSummary border-l-4 style) */}
          <div className="rounded-xl border border-gray-200 border-l-4 border-l-rose-500 bg-white p-5 shadow space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-lg bg-rose-50 text-rose-600 grid place-items-center font-bold shrink-0 border border-rose-100">
                  <Calculator className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Salary Math Tabulation</span>
                    <span className="text-rose-600 font-bold">•</span>
                    <span className="text-gray-900 font-semibold">
                      {fromDate && toDate
                        ? `${fromDate} to ${toDate}`
                        : fromDate
                        ? `From ${fromDate}`
                        : toDate
                        ? `Up to ${toDate}`
                        : "All Recorded Dates"}
                    </span>
                  </div>
                  <div className="text-xl font-bold text-gray-900 flex items-center gap-2.5 mt-0.5">
                    {selectedAgentObj ? (
                      <span>
                        {selectedAgentObj.name}
                        {selectedAgentObj.outlet && (
                          <span className="text-sm font-medium text-gray-500 ml-1.5">
                            ({selectedAgentObj.outlet})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span>All Outlets Combined</span>
                    )}
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                      {totalPenaltiesCount} {totalPenaltiesCount === 1 ? "Penalty" : "Penalties"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={handleCopySalarySummary}
                  className="h-9 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg px-3.5 border border-gray-300 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5 text-blue-600" />
                  <span>Copy Salary Summary</span>
                </button>
                {selectedAgent !== "__all__" && (
                  <button
                    type="button"
                    onClick={() => setSelectedAgent("__all__")}
                    className="h-9 text-xs font-semibold rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3 transition cursor-pointer"
                  >
                    View All
                  </button>
                )}
              </div>
            </div>

            {/* Penalty Type Breakdown Pills */}
            <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-gray-500 font-bold uppercase tracking-wider text-[11px] mr-1">
                Breakdown:
              </span>
              {overallTypeBreakdown.length > 0 ? (
                overallTypeBreakdown.map(([type, count]) => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-semibold"
                  >
                    <span className="font-bold text-rose-700">{count}x</span> {type}
                  </span>
                ))
              ) : (
                <span className="text-gray-500 italic flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  No penalties recorded for this selection. Perfect attendance record!
                </span>
              )}
            </div>
          </div>

          {/* View Mode Switcher Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl p-3 shadow text-xs">
            {/* View Mode Toggle Tabs */}
            <div className="inline-flex items-center p-1 rounded-lg bg-gray-100 border border-gray-200 gap-1">
              <button
                type="button"
                onClick={() => setViewMode("summary")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                  viewMode === "summary"
                    ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5 text-blue-600" />
                <span>Outlet-Wise Summary</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("detailed")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                  viewMode === "detailed"
                    ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <TableIcon className="h-3.5 w-3.5 text-blue-600" />
                <span>Detailed Reports List ({filteredPenalties.length})</span>
              </button>
            </div>

            {/* View-Specific Options */}
            <div className="flex items-center gap-3">
              {viewMode === "summary" && selectedAgent === "__all__" && (
                <label className="inline-flex items-center gap-2 font-semibold text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideZeroPenalties}
                    onChange={(e) => setHideZeroPenalties(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                  />
                  <span>Hide outlets with 0 penalties</span>
                </label>
              )}

              {viewMode === "detailed" && (
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="h-3.5 w-3.5 text-gray-500" />
                  <span className="text-gray-600 font-semibold">Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="h-8 text-xs font-semibold bg-gray-50 border border-gray-300 rounded-lg px-2.5 outline-none cursor-pointer"
                  >
                    <option value="date_desc">Newest First</option>
                    <option value="date_asc">Oldest First</option>
                    <option value="agent_asc">Agent Name (A-Z)</option>
                    <option value="type_asc">Penalty Type</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* TAB 1: OUTLET-WISE SUMMARY CARDS                                          */}
          {/* ========================================================================= */}
          {viewMode === "summary" && (
            <div className="space-y-4">
              {visibleAgentSummaries.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleAgentSummaries.map(({ agent, penalties: agentPenalties, typeCounts, totalCount }) => {
                    const isSelected = selectedAgent.toLowerCase().trim() === agent.name.toLowerCase().trim();
                    const hasPenalties = totalCount > 0;
                    const outletTitle = agent.outlet ? `EGGBUCKET ${agent.outlet.toUpperCase()}` : `AGENT: ${agent.name.toUpperCase()}`;

                    return (
                      <div
                        key={agent.name}
                        className={`rounded-xl border p-5 transition-all bg-white shadow flex flex-col justify-between space-y-4 ${
                          isSelected
                            ? "ring-2 ring-blue-600 border-blue-600"
                            : hasPenalties
                            ? "border-gray-200 hover:border-rose-300 hover:shadow-md"
                            : "border-gray-200 hover:border-blue-200"
                        }`}
                      >
                        {/* Header: Outlet / Agent Name & Badge */}
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="font-bold text-xs text-gray-900 flex items-center gap-1.5 uppercase tracking-wide">
                                <Building2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                {outletTitle}
                              </h3>
                              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                <User className="h-3 w-3 text-gray-400" />
                                Agent: <span className="font-bold text-gray-800">{agent.name}</span>
                              </p>
                            </div>

                            {/* Penalty Count Badge */}
                            <div
                              className={`px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 border ${
                                hasPenalties
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                              }`}
                            >
                              {totalCount} {totalCount === 1 ? "Penalty" : "Penalties"}
                            </div>
                          </div>

                          {/* Violations Breakdown */}
                          <div className="mt-3.5 pt-3 border-t border-gray-100">
                            {hasPenalties ? (
                              <div className="space-y-1.5">
                                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                  VIOLATIONS BREAKDOWN:
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(typeCounts).map(([type, cnt]) => (
                                    <span
                                      key={type}
                                      className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 border border-rose-200"
                                    >
                                      <span>{cnt}x</span> {type}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500 italic flex items-center gap-1 py-1">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                <span>Zero violations logged. Clean record!</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Card Footer Actions */}
                        <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedAgent(agent.name)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 transition flex items-center gap-1 cursor-pointer"
                          >
                            <Filter className="h-3 w-3 text-blue-600" />
                            <span>Filter Outlet</span>
                          </button>

                          {hasPenalties && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAgent(agent.name);
                                setViewMode("detailed");
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="h-3 w-3" />
                              <span>View Logs ({totalCount})</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center space-y-2 shadow">
                  <ShieldAlert className="h-8 w-8 text-gray-300 mx-auto" />
                  <div className="font-bold text-sm text-gray-800">No penalty reports found</div>
                  <div className="text-xs text-gray-500">
                    No reports logged matching the current outlet, date, or search filter.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: DETAILED REPORTS LIST TABLE                                        */}
          {/* ========================================================================= */}
          {viewMode === "detailed" && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 font-bold uppercase tracking-wider text-[11px]">
                      <th className="px-4 py-3.5">Date & Time</th>
                      <th className="px-4 py-3.5">Outlet</th>
                      <th className="px-4 py-3.5">Agent Name</th>
                      <th className="px-4 py-3.5">Penalty Type</th>
                      <th className="px-4 py-3.5">Supervisor</th>
                      <th className="px-4 py-3.5">Remarks</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedDetailedPenalties.map((p) => {
                      const { date: dateDisplay, time: timeDisplay } = formatDateTimeDisplay(p.dateKey, p.createdAt);

                      return (
                        <tr key={p.id} className="hover:bg-blue-50/40 transition-colors">
                          <td className="px-4 py-3.5 font-semibold text-gray-900 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                              <span>{dateDisplay || "—"}</span>
                              {timeDisplay && (
                                <span className="text-gray-400 font-normal text-[11px]">
                                  ({timeDisplay})
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3.5 font-semibold text-gray-800 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                              <span>{p.outletName || agentOutletMap[(p.agentName || "").toLowerCase().trim()] || "—"}</span>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 font-bold text-gray-900 whitespace-nowrap">
                            {p.agentName || "Unknown"}
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200">
                              <ShieldAlert className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                              {p.penaltyType || "Violation"}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-gray-600 font-medium whitespace-nowrap">
                            {p.supervisorName || "Admin (Web)"}
                          </td>

                          <td className="px-4 py-3.5 text-gray-600 max-w-xs truncate" title={p.remarks}>
                            {p.remarks || <span className="text-gray-300 italic">None</span>}
                          </td>

                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setViewingPenalty(p)}
                                title="View penalty details"
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePenalty(p)}
                                title="Delete penalty entry"
                                className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {sortedDetailedPenalties.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-gray-500 space-y-2">
                          <ShieldAlert className="h-8 w-8 text-gray-300 mx-auto" />
                          <div className="font-bold text-sm text-gray-700">No penalty reports found</div>
                          <div className="text-xs text-gray-400">
                            No reports logged matching the current outlet, date, or search filter.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PENALTY DETAILS MODAL                                                     */}
      {/* ========================================================================= */}
      {viewingPenalty && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-400" />
                <h3 className="text-base font-bold">Penalty Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingPenalty(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs font-sans">
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">
                    Penalty Type
                  </div>
                  <div className="text-base font-bold text-rose-900 mt-0.5">
                    {viewingPenalty.penaltyType}
                  </div>
                </div>
                <ShieldAlert className="h-7 w-7 text-rose-500 opacity-80" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-200 p-2.5 bg-gray-50">
                  <div className="text-gray-500 font-medium flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-blue-600" /> Outlet
                  </div>
                  <div className="font-bold text-gray-900 mt-1">
                    {viewingPenalty.outletName || agentOutletMap[(viewingPenalty.agentName || "").toLowerCase().trim()] || "—"}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-2.5 bg-gray-50">
                  <div className="text-gray-500 font-medium flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-blue-600" /> Agent Name
                  </div>
                  <div className="font-bold text-gray-900 mt-1">
                    {viewingPenalty.agentName || "—"}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-2.5 bg-gray-50">
                  <div className="text-gray-500 font-medium flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-blue-600" /> Supervisor
                  </div>
                  <div className="font-bold text-gray-900 mt-1">
                    {viewingPenalty.supervisorName || "Admin (Web)"}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-2.5 bg-gray-50">
                  <div className="text-gray-500 font-medium flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-blue-600" /> Date & Time
                  </div>
                  <div className="font-bold text-gray-900 mt-1 truncate">
                    {formatDateTimeDisplay(viewingPenalty.dateKey, viewingPenalty.createdAt).date || viewingPenalty.dateKey || "—"}
                    {formatDateTimeDisplay(viewingPenalty.dateKey, viewingPenalty.createdAt).time && (
                      <span className="text-gray-500 block text-[11px] font-normal">
                        ({formatDateTimeDisplay(viewingPenalty.dateKey, viewingPenalty.createdAt).time})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1">
                <div className="text-xs font-bold text-gray-700 flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 text-blue-600" /> Remarks
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 whitespace-pre-wrap">
                  {viewingPenalty.remarks || "No remarks provided"}
                </div>
              </div>

              {/* Verification Photo */}
              {viewingPenalty.photoUrl && (
                <div className="space-y-1">
                  <div className="text-xs font-bold text-gray-700 flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5 text-blue-600" /> Verification Photo
                  </div>
                  <div className="rounded-lg border overflow-hidden bg-black/5 max-h-48 flex items-center justify-center">
                    <img
                      src={viewingPenalty.photoUrl}
                      alt="Verification Photo"
                      className="w-full h-48 object-cover rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="pt-2 flex items-center justify-between border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => handleDeletePenalty(viewingPenalty)}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 size={14} />
                  <span>Delete</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingPenalty(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FULL SCREEN VIEW: ADVANCE AMOUNT REPORTS & DISBURSEMENTS                  */}
      {/* ========================================================================= */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col w-screen h-screen overflow-hidden font-sans">
          {/* Top Navigation Bar */}
          <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-orange-700 px-6 py-4 flex items-center justify-between text-white shrink-0 shadow-md">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-inner">
                <Zap className="h-5 w-5 text-amber-100" />
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-bold tracking-tight">Advance Amount Reports</h3>
                <p className="text-xs text-amber-100/90 font-medium">
                  Review agent advance disbursements, date-wise totals, and salary deductions
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAdvanceModalOpen(false)}
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-white bg-white/15 hover:bg-white/25 px-3.5 py-2 rounded-xl transition cursor-pointer backdrop-blur-xs border border-white/20"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Penalty Reports</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAdvanceModalOpen(false)}
                className="text-white/80 hover:text-white p-2 rounded-xl hover:bg-white/15 transition cursor-pointer"
                title="Close full-screen view"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* Full Screen Body */}
          <div className="p-6 md:p-8 space-y-6 overflow-y-auto flex-1 w-full max-w-[1600px] mx-auto">
            {/* Filter Section Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Presets: Today (default), This Week, This Month, All Time */}
                <div className="inline-flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setAdvancePreset("today");
                      setAdvanceFromDate(getTodayDateKey());
                      setAdvanceToDate(getTodayDateKey());
                      fetchAdvances(getTodayDateKey(), getTodayDateKey());
                    }}
                    className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                      advancePreset === "today"
                        ? "bg-amber-600 text-white font-bold shadow-sm"
                        : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdvancePreset("this_week");
                      setAdvanceFromDate(getFirstDayOfWeekKey());
                      setAdvanceToDate(getTodayDateKey());
                      fetchAdvances(getFirstDayOfWeekKey(), getTodayDateKey());
                    }}
                    className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                      advancePreset === "this_week"
                        ? "bg-amber-600 text-white font-bold shadow-sm"
                        : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                    }`}
                  >
                    This Week
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdvancePreset("this_month");
                      setAdvanceFromDate(getFirstDayOfMonthKey());
                      setAdvanceToDate(getTodayDateKey());
                      fetchAdvances(getFirstDayOfMonthKey(), getTodayDateKey());
                    }}
                    className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                      advancePreset === "this_month"
                        ? "bg-amber-600 text-white font-bold shadow-sm"
                        : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                    }`}
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdvancePreset("all_time");
                      setAdvanceFromDate("");
                      setAdvanceToDate("");
                      fetchAdvances("", "");
                    }}
                    className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                      advancePreset === "all_time"
                        ? "bg-amber-600 text-white font-bold shadow-sm"
                        : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                    }`}
                  >
                    All Time
                  </button>
                </div>

                {/* Custom Date Inputs & Refresh */}
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-300 rounded-xl px-3.5 py-1.5 shadow-2xs text-xs">
                    <CalendarDays className="h-4 w-4 text-gray-500 shrink-0" />
                    <span className="text-gray-500 font-medium">From:</span>
                    <input
                      type="date"
                      value={advanceFromDate}
                      onChange={(e) => {
                        setAdvancePreset("custom");
                        setAdvanceFromDate(e.target.value);
                      }}
                      className="bg-transparent border-none outline-none font-semibold text-gray-900 cursor-pointer"
                    />
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-500 font-medium">To:</span>
                    <input
                      type="date"
                      value={advanceToDate}
                      onChange={(e) => {
                        setAdvancePreset("custom");
                        setAdvanceToDate(e.target.value);
                      }}
                      className="bg-transparent border-none outline-none font-semibold text-gray-900 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => fetchAdvances()}
                      disabled={loadingAdvances}
                      className="text-xs bg-amber-600 text-white hover:bg-amber-700 px-3 py-1 rounded-lg font-bold transition cursor-pointer shadow-xs active:scale-95"
                    >
                      Apply
                    </button>
                  </div>

                  {/* Refresh Advances Button */}
                  <button
                    type="button"
                    onClick={() => fetchAdvances()}
                    disabled={loadingAdvances}
                    title="Refresh advance data"
                    className="p-2 border border-gray-300 bg-white hover:bg-gray-50 rounded-xl text-gray-600 transition shadow-2xs cursor-pointer"
                  >
                    <RefreshCw size={16} className={loadingAdvances ? "animate-spin text-amber-600" : ""} />
                  </button>
                </div>
              </div>

              {/* Filter Agent & Search Row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-gray-100">
                {/* Agent Selector Dropdown */}
                <div className="flex items-center gap-2 flex-1 max-w-lg">
                  <span className="text-xs font-bold text-gray-600 uppercase shrink-0 flex items-center gap-1">
                    <User className="h-4 w-4 text-amber-600" /> Filter Delivery Agent:
                  </span>
                  <select
                    value={advanceSelectedAgent}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAdvanceSelectedAgent(val);
                      fetchAdvances(advanceFromDate, advanceToDate, val);
                    }}
                    className="h-10 rounded-xl text-xs font-semibold bg-white border border-gray-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 px-3.5 py-1.5 outline-none flex-1 shadow-2xs cursor-pointer"
                  >
                    <option value="__all__">All Delivery Agents ({sortedAgentsList.length})</option>
                    {sortedAgentsList.map((a) => (
                      <option key={a.name} value={a.name}>
                        {a.name} {a.outlet ? `(${a.outlet})` : ""}
                      </option>
                    ))}
                  </select>

                  {advanceSelectedAgent !== "__all__" && (
                    <button
                      type="button"
                      onClick={() => {
                        setAdvanceSelectedAgent("__all__");
                        fetchAdvances(advanceFromDate, advanceToDate, "__all__");
                      }}
                      className="h-9 w-9 shrink-0 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition grid place-items-center cursor-pointer"
                      title="Clear agent filter"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Search box in Advance Modal */}
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search agent, outlet, remarks..."
                    value={advanceSearchQuery}
                    onChange={(e) => setAdvanceSearchQuery(e.target.value)}
                    className="pl-10 pr-9 h-10 text-xs font-medium rounded-xl bg-white border border-gray-300 focus:ring-2 focus:ring-amber-500 outline-none w-full transition shadow-2xs"
                  />
                  {advanceSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setAdvanceSearchQuery("")}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Total Advance Amount Tabulation Banner */}
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
                      {advanceFromDate && advanceToDate
                        ? (advanceFromDate === advanceToDate ? advanceFromDate : `${advanceFromDate} to ${advanceToDate}`)
                        : advanceFromDate
                        ? `From ${advanceFromDate}`
                        : advanceToDate
                        ? `Up to ${advanceToDate}`
                        : "All Time"}
                    </span>
                  </div>
                  <div className="text-3xl font-black text-gray-900 flex items-center gap-3 mt-1">
                    <span>₹{totalAdvanceAmount.toLocaleString("en-IN")}</span>
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                      {filteredAdvances.length} {filteredAdvances.length === 1 ? "Transaction" : "Transactions"}
                    </span>
                  </div>
                  {advanceSelectedAgent !== "__all__" && (
                    <p className="text-xs text-gray-600 font-semibold mt-1">
                      Selected Agent: <span className="text-amber-700 font-bold">{advanceSelectedAgent}</span>
                      {agentOutletMap[advanceSelectedAgent.toLowerCase().trim()] && (
                        <span className="text-gray-500 ml-1">
                          ({agentOutletMap[advanceSelectedAgent.toLowerCase().trim()]})
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
                {advanceSelectedAgent !== "__all__" && (
                  <button
                    type="button"
                    onClick={() => {
                      setAdvanceSelectedAgent("__all__");
                      fetchAdvances(advanceFromDate, advanceToDate, "__all__");
                    }}
                    className="h-10 text-xs font-semibold rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-3.5 transition cursor-pointer"
                  >
                    View All Agents
                  </button>
                )}
              </div>
            </div>

            {/* View Switcher: Summary vs Detailed */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="inline-flex items-center p-1 rounded-xl bg-gray-100 border border-gray-200 gap-1">
                <button
                  type="button"
                  onClick={() => setAdvanceViewMode("summary")}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all cursor-pointer ${
                    advanceViewMode === "summary"
                      ? "bg-white text-gray-900 shadow-xs border border-gray-200"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <LayoutGrid className="h-4 w-4 text-amber-600" />
                  <span>Agent Breakdown ({advanceAgentSummaries.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAdvanceViewMode("detailed")}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold transition-all cursor-pointer ${
                    advanceViewMode === "detailed"
                      ? "bg-white text-gray-900 shadow-xs border border-gray-200"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <TableIcon className="h-4 w-4 text-amber-600" />
                  <span>Detailed Transactions Log ({filteredAdvances.length})</span>
                </button>
              </div>
            </div>

            {/* VIEW 1: AGENT-WISE ADVANCE SUMMARY */}
            {advanceViewMode === "summary" && (
              <div className="space-y-4">
                {advanceAgentSummaries.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {advanceAgentSummaries.map((item) => {
                      const isSelected = advanceSelectedAgent.toLowerCase().trim() === item.agentName.toLowerCase().trim();
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
                                  Outlet: <span className="text-gray-700 font-semibold">{item.outletName || "Not Assigned"}</span>
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
                                setAdvanceSelectedAgent(item.agentName);
                                fetchAdvances(advanceFromDate, advanceToDate, item.agentName);
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-800 transition flex items-center gap-1 cursor-pointer"
                            >
                              <Filter className="h-3 w-3 text-amber-600" />
                              <span>Filter</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAdvanceSelectedAgent(item.agentName);
                                setAdvanceViewMode("detailed");
                                fetchAdvances(advanceFromDate, advanceToDate, item.agentName);
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

            {/* VIEW 2: DETAILED ADVANCE TRANSACTIONS LIST */}
            {advanceViewMode === "detailed" && (
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
                        const { date: dateDisplay, time: timeDisplay } = formatDateTimeDisplay(adv.dateKey, adv.createdAt);
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
          </div>

          {/* Full Screen Footer */}
          <div className="bg-white px-6 md:px-8 py-3.5 border-t border-gray-200 flex items-center justify-between shrink-0 shadow-xs">
            <span className="text-xs font-semibold text-gray-600">
              Total Advance: <span className="font-black text-gray-900">₹{totalAdvanceAmount.toLocaleString("en-IN")}</span> ({filteredAdvances.length} entries)
            </span>
            <button
              type="button"
              onClick={() => setIsAdvanceModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl transition shadow-2xs cursor-pointer active:scale-95"
            >
              Back to Penalty Reports
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
