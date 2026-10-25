import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { ADMIN_PATH } from "../constant";
import * as XLSX from "xlsx";
import {
  Users,
  UserCheck,
  UserPlus,
  Phone,
  PhoneCall,
  MessageSquare,
  MapPin,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Calendar,
  CalendarDays,
  Search,
  Filter,
  Download,
  RefreshCw,
  Trash2,
  Eye,
  X,
  LayoutGrid,
  Table as TableIcon,
  Copy,
  Check,
  Building2,
  Sparkles,
  Smartphone,
  ChevronDown,
  ArrowRight,
  Store,
  Layers,
  HelpCircle,
  Zap,
  Truck,
  User,
  CheckCircle,
} from "lucide-react";

const INDIA_TZ = "Asia/Kolkata";

function getTodayDateKey(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: INDIA_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch (e) {}
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getFirstDayOfWeekKey(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
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

// Format date helper in Asia/Kolkata
const formatDateIST = (dateVal) => {
  if (!dateVal) return "N/A";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: INDIA_TZ,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return String(dateVal);
  }
};

// Relative time helper (e.g. "Just now", "2 hours ago", "Yesterday")
const getRelativeTime = (dateVal) => {
  if (!dateVal) return "";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "";
    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHour / 24);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDateIST(dateVal).split(",")[0];
  } catch {
    return "";
  }
};

// Initials helper
const getInitials = (name = "") => {
  const parts = String(name).trim().split(/\s+/);
  if (!parts[0]) return "NC";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Vibrant avatar color generator based on name
const getAvatarColor = (name = "") => {
  const colors = [
    "bg-blue-600 text-white",
    "bg-indigo-600 text-white",
    "bg-emerald-600 text-white",
    "bg-violet-600 text-white",
    "bg-amber-600 text-white",
    "bg-teal-600 text-white",
    "bg-rose-600 text-white",
    "bg-cyan-600 text-white",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export default function NewCustomers() {
  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    contacted: 0,
    consentGiven: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [consentFilter, setConsentFilter] = useState("ALL");
  const [datePreset, setDatePreset] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [viewMode, setViewMode] = useState("table"); // "table" or "grid"
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState("ROUTES_APP"); // "ROUTES_APP" | "SALES_APP"
  const [manualPriorityCustomers, setManualPriorityCustomers] = useState([]);
  const [manualPriorityLoading, setManualPriorityLoading] = useState(false);
  const [manualPrioritySearch, setManualPrioritySearch] = useState("");
  const [deliveryPartners, setDeliveryPartners] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState("__all__");
  const [priorityAttendanceFilter, setPriorityAttendanceFilter] = useState("ALL"); // ALL, ATTENDED, DELIVERED, CHECKED, PENDING
  const [deletePriorityModalCustomer, setDeletePriorityModalCustomer] = useState(null);
  const [clearingPriority, setClearingPriority] = useState(false);

  // Modals state
  const [selectedCustomer, setSelectedCustomer] = useState(null); // Detail modal
  const [convertingCustomer, setConvertingCustomer] = useState(null); // Convert modal
  const [deleteConfirmCustomer, setDeleteConfirmCustomer] = useState(null); // Delete modal

  // Convert form data
  const [convertForm, setConvertForm] = useState({
    zone: "UNASSIGNED",
    route: "UNASSIGNED",
    potential: "T1",
    remarks: "",
  });
  const [zonesList, setZonesList] = useState([]);
  const [routesList, setRoutesList] = useState([]);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Detail modal notes state
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("PENDING");

  // Toast feedback
  const [toastMessage, setToastMessage] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const showToast = (message, type = "success") => {
    setToastMessage({ message, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const getAuthHeader = () => {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Copy to clipboard helper
  const handleCopy = (text, label = "Copied", id = null) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
    showToast(`${label} copied to clipboard!`);
  };

  // Handle Preset Change
  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    if (preset === "today") {
      const today = getTodayDateKey();
      setFromDate(today);
      setToDate(today);
    } else if (preset === "this_week") {
      setFromDate(getFirstDayOfWeekKey());
      setToDate(getTodayDateKey());
    } else if (preset === "this_month") {
      setFromDate(getFirstDayOfMonthKey());
      setToDate(getTodayDateKey());
    } else if (preset === "last_month") {
      setFromDate(getFirstDayOfPrevMonthKey());
      setToDate(getLastDayOfPrevMonthKey());
    } else if (preset === "all") {
      setFromDate("");
      setToDate("");
    }
  };

  // Fetch all new customers
  const fetchNewCustomers = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      try {
        const res = await axios.get(`${ADMIN_PATH}/new-customers`, {
          headers: getAuthHeader(),
        });
        if (res.data?.success) {
          setCustomers(res.data.data || []);
          if (res.data.summary) {
            setSummary(res.data.summary);
          }
        }
      } catch (err) {
        console.error("Failed to load new customers:", err);
        showToast(
          err.response?.data?.message || "Failed to load registrations",
          "error"
        );
      } finally {
        setLoading(false);
        if (isManualRefresh) setRefreshing(false);
      }
    },
    []
  );

  // Fetch zones & routes for convert modal
  const fetchZonesAndRoutes = useCallback(async () => {
    try {
      const [zonesRes, routesRes] = await Promise.all([
        axios.get(`${ADMIN_PATH}/zones`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
        axios.get(`${ADMIN_PATH}/routes`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
      ]);
      const fetchedZones = Array.isArray(zonesRes.data) ? zonesRes.data : [];
      const fetchedRoutes = (Array.isArray(routesRes.data) ? routesRes.data : [])
        .map((r) => (typeof r === "string" ? r : r.name))
        .filter(Boolean);

      setZonesList(fetchedZones.sort((a, b) => String(a).localeCompare(String(b))));
      setRoutesList(fetchedRoutes.sort((a, b) => String(a).localeCompare(String(b))));
    } catch (e) {
      console.warn("Could not fetch zones/routes:", e);
    }
  }, []);

  // Fetch delivery partners for filter dropdown
  const fetchDeliveryPartners = useCallback(async () => {
    try {
      const res = await axios.get(`${ADMIN_PATH}/del-partners`, {
        headers: getAuthHeader(),
      });
      if (Array.isArray(res.data)) {
        setDeliveryPartners(res.data);
      }
    } catch (e) {
      console.warn("Could not fetch delivery partners:", e);
    }
  }, []);

  // Fetch manual priority customers from "customers" collection
  const fetchManualPriorityCustomers = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setManualPriorityLoading(true);
      try {
        const res = await axios.get(`${ADMIN_PATH}/manual-priority-customers`, {
          headers: getAuthHeader(),
        });
        if (res.data?.success) {
          setManualPriorityCustomers(res.data.data || []);
        }
      } catch (err) {
        console.error("Failed to load manual priority customers:", err);
      } finally {
        if (isManualRefresh) setManualPriorityLoading(false);
      }
    },
    []
  );

  // Delete / Clear manual priority customer
  const handleConfirmClearPriority = async () => {
    if (!deletePriorityModalCustomer) return;
    setClearingPriority(true);
    try {
      const res = await axios.delete(
        `${ADMIN_PATH}/manual-priority-customers/${deletePriorityModalCustomer.id}`,
        { headers: getAuthHeader() }
      );
      if (res.data?.success) {
        showToast(`Priority request cleared for ${deletePriorityModalCustomer.name}`);
        setManualPriorityCustomers((prev) =>
          prev.filter((c) => c.id !== deletePriorityModalCustomer.id)
        );
        setDeletePriorityModalCustomer(null);
      } else {
        showToast(res.data?.message || "Failed to clear priority", "error");
      }
    } catch (err) {
      console.error("Failed to clear priority:", err);
      showToast(
        err.response?.data?.message || "Failed to clear priority",
        "error"
      );
    } finally {
      setClearingPriority(false);
    }
  };

  useEffect(() => {
    fetchNewCustomers();
    fetchZonesAndRoutes();
    fetchManualPriorityCustomers(true);
    fetchDeliveryPartners();
  }, [fetchNewCustomers, fetchZonesAndRoutes, fetchManualPriorityCustomers, fetchDeliveryPartners]);

  // Auto refresh interval (every 30 seconds if toggled on)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchNewCustomers();
      fetchManualPriorityCustomers();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchNewCustomers, fetchManualPriorityCustomers]);

  const handleRefreshAll = () => {
    fetchNewCustomers(true);
    fetchManualPriorityCustomers(true);
    fetchDeliveryPartners();
  };

  // Update Status handler
  const handleUpdateStatus = async (customer, newStatus, customNotes = null) => {
    try {
      setSubmittingAction(true);
      const payload = {
        status: newStatus,
      };
      if (customNotes !== null) {
        payload.notes = customNotes;
      }

      const res = await axios.put(
        `${ADMIN_PATH}/new-customers/${customer.id}/status`,
        payload,
        { headers: getAuthHeader() }
      );

      if (res.data?.success) {
        showToast(`Registration marked as ${newStatus}`);
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === customer.id
              ? {
                  ...c,
                  status: newStatus,
                  notes: customNotes !== null ? customNotes : c.notes,
                }
              : c
          )
        );
        if (selectedCustomer && selectedCustomer.id === customer.id) {
          setSelectedCustomer((prev) => ({
            ...prev,
            status: newStatus,
            notes: customNotes !== null ? customNotes : prev.notes,
          }));
        }
      }
    } catch (err) {
      console.error("Status update error:", err);
      showToast(
        err.response?.data?.message || "Failed to update registration status",
        "error"
      );
    } finally {
      setSubmittingAction(false);
    }
  };

  // Delete customer registration
  const handleDeleteCustomer = async () => {
    if (!deleteConfirmCustomer) return;
    try {
      setSubmittingAction(true);
      const res = await axios.delete(
        `${ADMIN_PATH}/new-customers/${deleteConfirmCustomer.id}`,
        { headers: getAuthHeader() }
      );
      if (res.data?.success) {
        showToast("Registration deleted successfully");
        setCustomers((prev) =>
          prev.filter((c) => c.id !== deleteConfirmCustomer.id)
        );
        if (selectedCustomer?.id === deleteConfirmCustomer.id) {
          setSelectedCustomer(null);
        }
        setDeleteConfirmCustomer(null);
      }
    } catch (err) {
      console.error("Delete error:", err);
      showToast(
        err.response?.data?.message || "Failed to delete registration",
        "error"
      );
    } finally {
      setSubmittingAction(false);
    }
  };

  // Convert to full Customer handler
  const handleConvertSubmit = async (e) => {
    e.preventDefault();
    if (!convertingCustomer) return;
    try {
      setSubmittingAction(true);
      const res = await axios.post(
        `${ADMIN_PATH}/new-customers/${convertingCustomer.id}/convert`,
        convertForm,
        { headers: getAuthHeader() }
      );

      if (res.data?.success) {
        showToast("Customer successfully approved & added to directory!");
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === convertingCustomer.id
              ? { ...c, status: "APPROVED", notes: convertForm.remarks }
              : c
          )
        );
        if (selectedCustomer?.id === convertingCustomer.id) {
          setSelectedCustomer((prev) => ({
            ...prev,
            status: "APPROVED",
            notes: convertForm.remarks,
          }));
        }
        setConvertingCustomer(null);
      }
    } catch (err) {
      console.error("Convert error:", err);
      showToast(
        err.response?.data?.message || "Failed to convert customer",
        "error"
      );
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open Convert Modal
  const openConvertModal = (customer) => {
    const defaultRoute =
      routesList.find(
        (r) =>
          r === "R001N-Onboarding Customers" ||
          r === "R001N-Onboarding Customers (Everyone)" ||
          r.includes("R001N") ||
          r.toLowerCase().includes("onboarding")
      ) || "R001N-Onboarding Customers (Everyone)";

    setConvertingCustomer(customer);
    setConvertForm({
      zone: zonesList[0] || "UNASSIGNED",
      route: defaultRoute,
      potential: "T1",
      remarks: `Converted from App Registration (${customer.source || "App"})`,
    });
  };

  // Open Detail Modal
  const openDetailModal = (customer) => {
    setSelectedCustomer(customer);
    setEditNotes(customer.notes || "");
    setEditStatus(customer.status || "PENDING");
  };

  // Filtered customers calculation
  const filteredCustomers = useMemo(() => {
    return customers.filter((item) => {
      // 1. Status Filter
      if (statusFilter !== "ALL" && item.status !== statusFilter) {
        return false;
      }

      // 2. Consent Filter
      if (consentFilter === "GIVEN" && !item.consent_given) return false;
      if (consentFilter === "NOT_GIVEN" && item.consent_given) return false;

      // 3. Date Filter
      if (fromDate || toDate) {
        if (!item.createdAt) return false;
        const itemDate = new Date(item.createdAt);
        if (fromDate) {
          const from = new Date(fromDate);
          from.setHours(0, 0, 0, 0);
          if (itemDate < from) return false;
        }
        if (toDate) {
          const to = new Date(toDate);
          to.setHours(23, 59, 59, 999);
          if (itemDate > to) return false;
        }
      }

      // 4. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (item.name || "").toLowerCase().includes(q);
        const matchesBusiness = (item.businessName || item.business || "").toLowerCase().includes(q);
        const matchesPhone = (item.phone || "").toLowerCase().includes(q);
        const matchesId = (item.id || "").toLowerCase().includes(q);
        const matchesSource = (item.source || "").toLowerCase().includes(q);
        if (!matchesName && !matchesBusiness && !matchesPhone && !matchesId && !matchesSource) {
          return false;
        }
      }

      return true;
    });
  }, [customers, statusFilter, consentFilter, fromDate, toDate, searchQuery]);

  // Export to Excel
  const exportToExcel = () => {
    if (!filteredCustomers.length) {
      showToast("No data to export", "error");
      return;
    }

    const exportRows = filteredCustomers.map((c, index) => ({
      "SL No": index + 1,
      "Document ID": c.id,
      "Customer Name": c.name || "N/A",
      "Business Name": c.businessName || c.business || "N/A",
      "Phone Number": c.phone || "N/A",
      "Location Coordinates": c.location || "N/A",
      "Latitude": c.lat || "",
      "Longitude": c.lng || "",
      "Status": c.status || "PENDING",
      "Consent Given": c.consent_given ? "YES" : "NO",
      "Consent Type": c.consent_type || "service_calls",
      "Consent Timestamp": c.consent_timestamp || "N/A",
      "Consent Agreement Text": c.consent_text || "",
      "Source": c.source || "App registration",
      "Registration Date (IST)": formatDateIST(c.createdAt),
      "Admin Notes": c.notes || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "New Customer Registrations");

    // Auto-fit column widths
    const maxProps = Object.keys(exportRows[0] || {}).map((key) => ({
      wch: Math.max(key.length, 14),
    }));
    worksheet["!cols"] = maxProps;

    const todayStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `EggBucket_New_Customers_${todayStr}.xlsx`);
    showToast("Exported to Excel successfully!");
  };

  // Filtered manual priority list
  const filteredManualPriority = useMemo(() => {
    return manualPriorityCustomers.filter((c) => {
      // 1. Search Query
      if (manualPrioritySearch.trim()) {
        const q = manualPrioritySearch.toLowerCase().trim();
        const matchesName = c.name && c.name.toLowerCase().includes(q);
        const matchesBusiness = (c.businessName || c.business) && (c.businessName || c.business).toLowerCase().includes(q);
        const matchesLocation = c.location && c.location.toLowerCase().includes(q);
        const matchesTime = c.timeOfRequest && c.timeOfRequest.toLowerCase().includes(q);
        const matchesPhone = c.phone && c.phone.toLowerCase().includes(q);
        const matchesCustId = c.custid && c.custid.toLowerCase().includes(q);
        const matchesAgent = c.attendedAgent && c.attendedAgent.toLowerCase().includes(q);
        const matchesReason = c.attendedReason && c.attendedReason.toLowerCase().includes(q);
        const matchesRoute = c.route && c.route.toLowerCase().includes(q);
        if (
          !matchesName &&
          !matchesBusiness &&
          !matchesLocation &&
          !matchesTime &&
          !matchesPhone &&
          !matchesCustId &&
          !matchesAgent &&
          !matchesReason &&
          !matchesRoute
        ) {
          return false;
        }
      }

      // 2. Selected Delivery Agent Filter
      if (selectedAgent !== "__all__" && selectedAgent !== "all") {
        const aLower = selectedAgent.toLowerCase().trim();
        const matchesAgent =
          (c.attendedAgent && c.attendedAgent.toLowerCase().includes(aLower)) ||
          (c.route && c.route.toLowerCase().includes(aLower));
        if (!matchesAgent) return false;
      }

      // 3. Attendance Status Filter
      if (priorityAttendanceFilter !== "ALL") {
        if (priorityAttendanceFilter === "ATTENDED" && !c.attended) return false;
        if (priorityAttendanceFilter === "DELIVERED" && c.attendedType !== "DELIVERED") return false;
        if (priorityAttendanceFilter === "CHECKED" && c.attendedType !== "CHECKED") return false;
        if (priorityAttendanceFilter === "PENDING" && c.attended) return false;
      }

      // 4. Date Filter
      if (datePreset !== "all" && fromDate && toDate) {
        const itemDate =
          c.requestDateKey ||
          (c.timeOfRequestIso ? c.timeOfRequestIso.slice(0, 10) : "");
        if (itemDate) {
          if (itemDate < fromDate || itemDate > toDate) return false;
        }
      }

      return true;
    });
  }, [
    manualPriorityCustomers,
    manualPrioritySearch,
    selectedAgent,
    priorityAttendanceFilter,
    datePreset,
    fromDate,
    toDate,
  ]);

  // Export manual priority customers to Excel (Name, Business Name, Location, Time of Request, Attendance)
  const exportManualPriorityToExcel = () => {
    try {
      const exportData = filteredManualPriority.map((c, idx) => ({
        "SL No": idx + 1,
        "Name": c.name || "N/A",
        "Cust ID": c.custid || "N/A",
        "Business Name": c.businessName || c.business || "N/A",
        "Location": c.location || "N/A",
        "Time of Request": c.timeOfRequest || "N/A",
        "Attendance Status": c.attendedStatus || (c.attended ? "Attended" : "Pending"),
        "Attended Date": c.attendedDate || "N/A",
        "Attended By Agent": c.attendedAgent || "N/A",
        "Delivered Trays / Check Reason": c.attendedQuantity
          ? `${c.attendedQuantity} trays`
          : c.attendedReason || "N/A",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 8 },
        { wch: 25 },
        { wch: 12 },
        { wch: 25 },
        { wch: 35 },
        { wch: 22 },
        { wch: 18 },
        { wch: 15 },
        { wch: 20 },
        { wch: 28 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Priority_Customers");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      XLSX.writeFile(wb, `Priority_Customers_${timestamp}.xlsx`);
      showToast("Exported priority customers to Excel!");
    } catch (e) {
      showToast("Failed to export Excel file", "error");
    }
  };

  // Status badge styler
  const renderStatusBadge = (status) => {
    const s = String(status || "PENDING").toUpperCase();
    switch (s) {
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Approved
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Rejected
          </span>
        );
      case "CONTACTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
            Contacted
          </span>
        );
      case "PENDING":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Pending Review
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 font-sans text-gray-800 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-sm font-semibold animate-in fade-in slide-in-from-top-3 duration-200 border ${
            toastMessage.type === "error"
              ? "bg-rose-900 text-rose-100 border-rose-700"
              : "bg-gray-900 text-white border-gray-700"
          }`}
        >
          {toastMessage.type === "error" ? (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          )}
          <span>{toastMessage.message}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. TOP HEADER & CONTROLS CARD (Advance Management style - Image 1)       */}
      {/* ========================================================================= */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center font-bold shrink-0 shadow-md shadow-amber-500/20">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                  App Orders
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  {activeMainTab === "ROUTES_APP"
                    ? "Routes App (Delivery)"
                    : "Sales App Registrations"}
                </span>
              </div>
            </div>
          </div>

          {/* Right column: Date Presets, Custom Range, Refresh, Auto-Sync & Export */}
          <div className="flex flex-col items-start lg:items-end justify-end gap-2.5">
            <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2">
              {/* Date presets pill container */}
              <div className="inline-flex items-center gap-0.5 bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs font-semibold">
                {[
                  { key: "today", label: "Today" },
                  { key: "this_week", label: "This Week" },
                  { key: "this_month", label: "This Month" },
                  { key: "last_month", label: "Last Month" },
                  { key: "all", label: "All Time" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handlePresetChange(item.key)}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-xs ${
                      datePreset === item.key
                        ? "bg-amber-600 text-white font-bold shadow-xs"
                        : "text-gray-700 hover:text-gray-900 hover:bg-gray-200/70"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Date Range Input */}
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs text-gray-700">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-semibold text-gray-500">From:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setDatePreset("custom");
                  }}
                  className="bg-transparent border-none outline-none text-xs font-semibold text-gray-800 cursor-pointer"
                />
                <span className="text-gray-400">•</span>
                <span className="font-semibold text-gray-500">To:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setDatePreset("custom");
                  }}
                  className="bg-transparent border-none outline-none text-xs font-semibold text-gray-800 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={handleRefreshAll}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs transition cursor-pointer"
                >
                  Apply
                </button>
              </div>

              {/* Refresh button */}
              <button
                type="button"
                onClick={handleRefreshAll}
                disabled={refreshing || manualPriorityLoading}
                className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-700 transition cursor-pointer shadow-2xs disabled:opacity-50"
                title="Refresh All"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    refreshing || manualPriorityLoading ? "animate-spin text-amber-600" : ""
                  }`}
                />
              </button>

              {/* Export Excel */}
              <button
                type="button"
                onClick={activeMainTab === "ROUTES_APP" ? exportManualPriorityToExcel : exportToExcel}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Filter Delivery Agent & Search Row (Exact Image 1 layout) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-600 flex items-center gap-1.5 uppercase tracking-wide shrink-0">
              <User className="w-4 h-4 text-amber-600" />
              FILTER DELIVERY AGENT:
            </label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="px-3 py-1.5 bg-amber-50/60 hover:bg-amber-50 border border-amber-300 rounded-xl text-xs font-bold text-amber-950 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer min-w-[220px]"
            >
              <option value="__all__">All Delivery Agents ({deliveryPartners.length})</option>
              {deliveryPartners.map((agent) => (
                <option key={agent.id || agent.name} value={agent.name}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={
                activeMainTab === "ROUTES_APP"
                  ? "Search agent, outlet, remarks, or customer..."
                  : "Search customer name, shop/business, phone, doc ID..."
              }
              value={activeMainTab === "ROUTES_APP" ? manualPrioritySearch : searchQuery}
              onChange={(e) =>
                activeMainTab === "ROUTES_APP"
                  ? setManualPrioritySearch(e.target.value)
                  : setSearchQuery(e.target.value)
              }
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition placeholder:text-gray-400"
            />
            {(activeMainTab === "ROUTES_APP" ? manualPrioritySearch : searchQuery) && (
              <button
                type="button"
                onClick={() =>
                  activeMainTab === "ROUTES_APP"
                    ? setManualPrioritySearch("")
                    : setSearchQuery("")
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. APP SWITCHER TABS (Exact Image 3 style)                                */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 bg-gray-100 rounded-xl border border-gray-200 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveMainTab("ROUTES_APP")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeMainTab === "ROUTES_APP"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <Truck className="w-4 h-4 text-amber-600" />
            <span>Routes App (Delivery)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                activeMainTab === "ROUTES_APP"
                  ? "bg-amber-100 text-amber-900"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              {filteredManualPriority.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("SALES_APP")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeMainTab === "SALES_APP"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span>Sales App</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                activeMainTab === "SALES_APP"
                  ? "bg-blue-100 text-blue-900"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              {filteredCustomers.length}
            </span>
          </button>
        </div>

        <div className="text-xs text-gray-400 font-medium px-2 hidden sm:block">
          {activeMainTab === "ROUTES_APP"
            ? "Firebase: customers collection (manual_priority : true)"
            : "Firebase: New Customer collection"}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. TAB 1: ROUTES APP (DELIVERY) — EXISTING CUSTOMERS MANUAL PRIORITY     */}
      {/* ========================================================================= */}
      {activeMainTab === "ROUTES_APP" ? (
        <div className="space-y-5">
          {/* Quick Counter Banner for Priority Customers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Total Requests
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-0.5">
                  {filteredManualPriority.length}
                </p>
              </div>
            </div>

            <div
              onClick={() =>
                setPriorityAttendanceFilter(
                  priorityAttendanceFilter === "DELIVERED" ? "ALL" : "DELIVERED"
                )
              }
              className={`border rounded-2xl p-4 shadow-sm flex items-center gap-3.5 transition cursor-pointer ${
                priorityAttendanceFilter === "DELIVERED"
                  ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400"
                  : "bg-white border-gray-200 hover:border-emerald-300"
              }`}
            >
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Delivered
                </p>
                <p className="text-xl sm:text-2xl font-bold text-emerald-900 mt-0.5">
                  {
                    filteredManualPriority.filter(
                      (c) => c.attendedType === "DELIVERED"
                    ).length
                  }
                </p>
              </div>
            </div>

            <div
              onClick={() =>
                setPriorityAttendanceFilter(
                  priorityAttendanceFilter === "CHECKED" ? "ALL" : "CHECKED"
                )
              }
              className={`border rounded-2xl p-4 shadow-sm flex items-center gap-3.5 transition cursor-pointer ${
                priorityAttendanceFilter === "CHECKED"
                  ? "bg-amber-50 border-amber-300 ring-2 ring-amber-400"
                  : "bg-white border-gray-200 hover:border-amber-300"
              }`}
            >
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Checked / Reached
                </p>
                <p className="text-xl sm:text-2xl font-bold text-amber-900 mt-0.5">
                  {
                    filteredManualPriority.filter(
                      (c) => c.attendedType === "CHECKED"
                    ).length
                  }
                </p>
              </div>
            </div>

            <div
              onClick={() =>
                setPriorityAttendanceFilter(
                  priorityAttendanceFilter === "PENDING" ? "ALL" : "PENDING"
                )
              }
              className={`border rounded-2xl p-4 shadow-sm flex items-center gap-3.5 transition cursor-pointer ${
                priorityAttendanceFilter === "PENDING"
                  ? "bg-blue-50 border-blue-300 ring-2 ring-blue-400"
                  : "bg-white border-gray-200 hover:border-blue-300"
              }`}
            >
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Pending Delivery
                </p>
                <p className="text-xl sm:text-2xl font-bold text-blue-900 mt-0.5">
                  {filteredManualPriority.filter((c) => !c.attended).length}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Attendance Filter Toolbar */}
          <div className="bg-white border border-gray-200 rounded-2xl p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-bold text-gray-500 mr-1 uppercase text-[11px] tracking-wide">
                Attendance:
              </span>
              {[
                { key: "ALL", label: "All", count: manualPriorityCustomers.length },
                {
                  key: "ATTENDED",
                  label: "Attended",
                  count: manualPriorityCustomers.filter((c) => c.attended).length,
                },
                {
                  key: "DELIVERED",
                  label: "Delivered",
                  count: manualPriorityCustomers.filter(
                    (c) => c.attendedType === "DELIVERED"
                  ).length,
                },
                {
                  key: "CHECKED",
                  label: "Checked",
                  count: manualPriorityCustomers.filter(
                    (c) => c.attendedType === "CHECKED"
                  ).length,
                },
                {
                  key: "PENDING",
                  label: "Pending",
                  count: manualPriorityCustomers.filter((c) => !c.attended).length,
                },
              ].map((btn) => (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => setPriorityAttendanceFilter(btn.key)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    priorityAttendanceFilter === btn.key
                      ? "bg-amber-500 text-white shadow-xs"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <span>{btn.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      priorityAttendanceFilter === btn.key
                        ? "bg-white/20 text-white"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {btn.count}
                  </span>
                </button>
              ))}
            </div>

            <span className="text-xs font-semibold text-gray-500 self-center">
              Showing <strong className="text-gray-800">{filteredManualPriority.length}</strong> of{" "}
              {manualPriorityCustomers.length} Priority Requests
            </span>
          </div>

          {/* Priority Customers Table */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            {manualPriorityLoading && manualPriorityCustomers.length === 0 ? (
              <div className="p-16 text-center space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin text-amber-500 mx-auto" />
                <p className="text-sm font-bold text-gray-700">Loading priority customers...</p>
                <p className="text-xs text-gray-400">Querying customer collection for manual_priority: true</p>
              </div>
            ) : filteredManualPriority.length === 0 ? (
              <div className="p-16 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 mx-auto flex items-center justify-center border border-amber-100">
                  <Zap className="w-7 h-7" />
                </div>
                <p className="text-base font-bold text-gray-800">
                  {manualPrioritySearch || priorityAttendanceFilter !== "ALL"
                    ? "No matching priority requests"
                    : "No Manual Priority Customers"}
                </p>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  {manualPrioritySearch || priorityAttendanceFilter !== "ALL"
                    ? "Try clearing the search or attendance filter."
                    : "Currently, no customer document in the customer collection has manual_priority: true."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/90 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-4 px-5">Customer Name</th>
                      <th className="py-4 px-5">Business Name</th>
                      <th className="py-4 px-5">Location</th>
                      <th className="py-4 px-5">Time of Request</th>
                      <th className="py-4 px-5">Delivery Attendance</th>
                      <th className="py-4 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {filteredManualPriority.map((c) => (
                      <tr key={c.id} className="hover:bg-amber-50/30 transition-colors group">
                        {/* 1. Name */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-xl font-black flex items-center justify-center text-xs shrink-0 shadow-xs ${getAvatarColor(
                                c.name
                              )}`}
                            >
                              {getInitials(c.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-gray-900 text-sm truncate">
                                  {c.name}
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                                  <Zap className="w-3 h-3 text-amber-600 fill-amber-500" />
                                  Priority
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {c.custid && (
                                  <span className="text-xs text-gray-400 font-mono">
                                    {c.custid}
                                  </span>
                                )}
                                {c.route && (
                                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded-md">
                                    {c.route}
                                  </span>
                                )}
                                {c.phone && (
                                  <div className="flex items-center gap-1 text-[11px] text-gray-400">
                                    <Phone className="w-3 h-3 text-gray-400" />
                                    <span>{c.phone}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. Business Name */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="font-semibold text-gray-800">
                              {c.businessName}
                            </span>
                          </div>
                        </td>

                        {/* 3. Location */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                            <span
                              className="text-gray-700 font-medium text-xs sm:text-sm truncate max-w-[200px]"
                              title={c.location}
                            >
                              {c.location}
                            </span>
                            {c.location && (
                              <button
                                type="button"
                                onClick={() => handleCopy(c.location, "Location", `loc-${c.id}`)}
                                className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition cursor-pointer"
                                title="Copy Location"
                              >
                                {copiedId === `loc-${c.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                            {c.lat && c.lng && (
                              <a
                                href={`https://www.google.com/maps?q=${c.lat},${c.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition cursor-pointer"
                                title="Open in Google Maps"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </td>

                        {/* 4. Time of Request */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                            <div>
                              <p className="font-bold text-gray-800 text-xs sm:text-sm whitespace-nowrap">
                                {c.timeOfRequest}
                              </p>
                              {c.timeOfRequestMs && (
                                <p className="text-[11px] text-gray-400 font-medium whitespace-nowrap">
                                  {getRelativeTime(c.timeOfRequestMs)}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 5. Delivery Attendance (Reflects whether delivered or checked) */}
                        <td className="py-4 px-5">
                          {c.attended && c.attendedType === "DELIVERED" ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Delivered</span>
                                {c.attendedQuantity && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-emerald-200/60 text-emerald-800 text-[10px] font-black">
                                    {c.attendedQuantity} trays
                                  </span>
                                )}
                              </span>
                              <div className="text-[11px] text-gray-500 font-medium flex items-center gap-1 flex-wrap">
                                {c.attendedAgent && (
                                  <span className="font-semibold text-gray-700">by {c.attendedAgent}</span>
                                )}
                                {c.attendedDate && <span>• {c.attendedDate}</span>}
                              </div>
                            </div>
                          ) : c.attended && c.attendedType === "CHECKED" ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                <span>Checked</span>
                                {c.attendedReason && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-amber-200/60 text-amber-900 text-[10px] font-black">
                                    {c.attendedReason}
                                  </span>
                                )}
                              </span>
                              <div className="text-[11px] text-gray-500 font-medium flex items-center gap-1 flex-wrap">
                                {c.attendedAgent && (
                                  <span className="font-semibold text-gray-700">by {c.attendedAgent}</span>
                                )}
                                {c.attendedDate && <span>• {c.attendedDate}</span>}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                                <Clock className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                                <span>Pending Delivery</span>
                              </span>
                              <div className="text-[11px] text-gray-400 font-medium">
                                Awaiting route agent
                              </div>
                            </div>
                          )}
                        </td>

                        {/* 6. Actions (Delete button appears when attended) */}
                        <td className="py-4 px-5 text-right">
                          {c.attended ? (
                            <button
                              type="button"
                              onClick={() => setDeletePriorityModalCustomer(c)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 hover:border-rose-300 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs active:scale-95"
                              title="Delete / Clear Priority Request"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              <span>Delete</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeletePriorityModalCustomer(c)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-medium transition cursor-pointer"
                              title="Cancel Priority Request"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Cancel</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* 4. TAB 2: SALES APP — NEW CUSTOMER ONBOARDING REGISTRATIONS              */
        /* ========================================================================= */
        <div className="space-y-5">
          {/* 4 Summary Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {/* Card 1: Total */}
            <div className="bg-gradient-to-br from-blue-50/60 to-blue-50/20 border border-blue-100 rounded-xl p-4 flex items-center gap-3.5">
              <div className="h-10 w-10 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Total Registrations
                </p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-0.5">
                  {summary.total}
                </p>
              </div>
            </div>

            {/* Card 2: Pending */}
            <div
              onClick={() => setStatusFilter("PENDING")}
              className={`border rounded-xl p-4 flex items-center gap-3.5 transition cursor-pointer ${
                statusFilter === "PENDING"
                  ? "bg-amber-100/70 border-amber-300 ring-2 ring-amber-400"
                  : "bg-gradient-to-br from-amber-50/60 to-amber-50/20 border-amber-100 hover:border-amber-300"
              }`}
            >
              <div className="h-10 w-10 rounded-lg bg-amber-600/10 text-amber-600 flex items-center justify-center font-bold shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Pending Review
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xl sm:text-2xl font-bold text-amber-900">
                    {summary.pending}
                  </span>
                  {summary.pending > 0 && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: Approved */}
            <div
              onClick={() => setStatusFilter("APPROVED")}
              className={`border rounded-xl p-4 flex items-center gap-3.5 transition cursor-pointer ${
                statusFilter === "APPROVED"
                  ? "bg-emerald-100/70 border-emerald-300 ring-2 ring-emerald-400"
                  : "bg-gradient-to-br from-emerald-50/60 to-emerald-50/20 border-emerald-100 hover:border-emerald-300"
              }`}
            >
              <div className="h-10 w-10 rounded-lg bg-emerald-600/10 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Approved
                </p>
                <p className="text-xl sm:text-2xl font-bold text-emerald-900 mt-0.5">
                  {summary.approved}
                </p>
              </div>
            </div>

            {/* Card 4: Consent Compliance */}
            <div
              onClick={() => setConsentFilter(consentFilter === "GIVEN" ? "ALL" : "GIVEN")}
              className={`border rounded-xl p-4 flex items-center gap-3.5 transition cursor-pointer ${
                consentFilter === "GIVEN"
                  ? "bg-indigo-100/70 border-indigo-300 ring-2 ring-indigo-400"
                  : "bg-gradient-to-br from-indigo-50/60 to-indigo-50/20 border-indigo-100 hover:border-indigo-300"
              }`}
            >
              <div className="h-10 w-10 rounded-lg bg-indigo-600/10 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Consent Verified
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xl sm:text-2xl font-bold text-indigo-900">
                    {summary.consentGiven}
                  </span>
                  <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                    {summary.total > 0
                      ? `${Math.round((summary.consentGiven / summary.total) * 100)}%`
                      : "100%"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Filters Toolbar */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Status filter chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-gray-500 mr-1 uppercase tracking-wider">
                  Status:
                </span>
                {[
                  { key: "ALL", label: "All", count: customers.length },
                  { key: "PENDING", label: "Pending", count: summary.pending },
                  { key: "APPROVED", label: "Approved", count: summary.approved },
                  { key: "CONTACTED", label: "Contacted", count: summary.contacted },
                  { key: "REJECTED", label: "Rejected", count: summary.rejected },
                ].map((btn) => (
                  <button
                    key={btn.key}
                    type="button"
                    onClick={() => setStatusFilter(btn.key)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      statusFilter === btn.key
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    <span>{btn.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                        statusFilter === btn.key
                          ? "bg-white/20 text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {btn.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Legal Consent filter & View Mode */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs font-semibold">
                  <span className="text-gray-500 text-[11px] px-1 font-bold">Consent:</span>
                  <button
                    type="button"
                    onClick={() => setConsentFilter("ALL")}
                    className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                      consentFilter === "ALL"
                        ? "bg-blue-600 text-white font-bold"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsentFilter("GIVEN")}
                    className={`px-2 py-0.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                      consentFilter === "GIVEN"
                        ? "bg-emerald-600 text-white font-bold"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    Verified
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsentFilter("NOT_GIVEN")}
                    className={`px-2 py-0.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                      consentFilter === "NOT_GIVEN"
                        ? "bg-rose-600 text-white font-bold"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <ShieldAlert className="w-3 h-3" />
                    Not Given
                  </button>
                </div>

                {/* View Mode Toggle */}
                <div className="inline-flex items-center p-1 rounded-xl bg-gray-100 border border-gray-200 gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      viewMode === "table"
                        ? "bg-white text-blue-600 shadow-xs"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                    title="Table View"
                  >
                    <TableIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      viewMode === "grid"
                        ? "bg-white text-blue-600 shadow-xs"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                    title="Grid Cards View"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

      {/* Main Content Area: Loading / Empty / Table / Grid */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-800">
            Fetching New Customer Registrations...
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Connecting to Firestore collection "New Customer"...
          </p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 mx-auto flex items-center justify-center">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-gray-800">
            No Registrations Found
          </h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            {searchQuery || statusFilter !== "ALL" || consentFilter !== "ALL"
              ? "No new customer registrations match your selected search or filter criteria. Try clearing filters."
              : "No documents have been recorded in the 'New Customer' collection yet."}
          </p>
          {(searchQuery || statusFilter !== "ALL" || consentFilter !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("ALL");
                setConsentFilter("ALL");
                setDatePreset("all");
                setFromDate("");
                setToDate("");
              }}
              className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Clear All Filters
            </button>
          )}
        </div>
      ) : viewMode === "table" ? (
        /* TABLE VIEW */
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-600 uppercase font-bold text-[11px] tracking-wider">
                  <th className="py-3.5 px-4">Customer & Business</th>
                  <th className="py-3.5 px-4">Contact</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4">Consent & Audit</th>
                  <th className="py-3.5 px-4">Registered At</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.map((cust) => {
                  const hasCoordinates = cust.lat && cust.lng;
                  const gmapsUrl = hasCoordinates
                    ? `https://www.google.com/maps?q=${cust.lat},${cust.lng}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        cust.location || cust.name
                      )}`;

                  return (
                    <tr
                      key={cust.id}
                      className="hover:bg-blue-50/30 transition-colors group"
                    >
                      {/* Customer & Business */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs ${getAvatarColor(
                              cust.name
                            )}`}
                          >
                            {getInitials(cust.name)}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 flex items-center gap-1.5">
                              <span>{cust.name || "Unnamed"}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-normal">
                                {cust.source || "App"}
                              </span>
                            </div>
                            <div className="text-gray-500 flex items-center gap-1 mt-0.5">
                              <Store className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className="font-semibold text-gray-700">
                                {cust.businessName || cust.business || "No Shop Name"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Phone & Direct Links */}
                      <td className="py-3.5 px-4">
                        {cust.phone ? (
                          <div className="space-y-1">
                            <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                              <Phone className="w-3 h-3 text-gray-400" />
                              <span>{cust.phone}</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(cust.phone, "Phone number", cust.id)}
                                className="text-gray-400 hover:text-gray-700 transition"
                                title="Copy phone number"
                              >
                                {copiedId === cust.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <a
                                href={`tel:${cust.phone}`}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800"
                              >
                                Call
                              </a>
                              <span className="text-gray-300">•</span>
                              <a
                                href={`https://wa.me/91${cust.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                                  `Hello ${cust.name}, thank you for registering with EggBucket!`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-800"
                              >
                                WhatsApp
                              </a>
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">No phone</span>
                        )}
                      </td>

                      {/* Location */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-gray-700">
                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span className="font-medium truncate max-w-[170px]" title={cust.location}>
                              {cust.location || "Location not provided"}
                            </span>
                          </div>
                          {cust.location && (
                            <a
                              href={gmapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800"
                            >
                              <span>View on Google Maps</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Consent & Compliance */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {cust.consent_given ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              Consent Granted
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <ShieldAlert className="w-3 h-3 text-rose-600" />
                              No Consent
                            </span>
                          )}
                          <div className="text-[10px] text-gray-400">
                            {cust.consent_type ? `Type: ${cust.consent_type}` : "Consent logged"}
                          </div>
                        </div>
                      </td>

                      {/* Registration Date */}
                      <td className="py-3.5 px-4">
                        <div className="text-gray-900 font-semibold">
                          {formatDateIST(cust.createdAt)}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {getRelativeTime(cust.createdAt)}
                        </div>
                      </td>

                      {/* Status Dropdown */}
                      <td className="py-3.5 px-4">
                        <select
                          value={cust.status || "PENDING"}
                          onChange={(e) => handleUpdateStatus(cust, e.target.value)}
                          className={`text-xs font-bold rounded-lg px-2.5 py-1.5 border outline-none cursor-pointer shadow-2xs transition ${
                            cust.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : cust.status === "REJECTED"
                              ? "bg-rose-50 text-rose-800 border-rose-300"
                              : cust.status === "CONTACTED"
                              ? "bg-blue-50 text-blue-800 border-blue-300"
                              : "bg-amber-50 text-amber-800 border-amber-300"
                          }`}
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="APPROVED">APPROVED</option>
                          <option value="CONTACTED">CONTACTED</option>
                          <option value="REJECTED">REJECTED</option>
                        </select>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View details */}
                          <button
                            type="button"
                            onClick={() => openDetailModal(cust)}
                            className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="View Full Details Dossier"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Convert to customer */}
                          <button
                            type="button"
                            onClick={() => openConvertModal(cust)}
                            className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                            title="Approve & Convert into Active Customer"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>

                          {/* Delete registration */}
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmCustomer(cust)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Registration Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer info */}
          <div className="px-4 py-3 bg-gray-50/70 border-t border-gray-200 text-xs font-medium text-gray-500 flex items-center justify-between">
            <span>
              Showing <strong className="text-gray-900">{filteredCustomers.length}</strong> of{" "}
              <strong className="text-gray-900">{customers.length}</strong> total registrations
            </span>
            <span className="text-[11px] text-gray-400">
              Egg Bucket Retail Admin Sync
            </span>
          </div>
        </div>
      ) : (
        /* GRID / CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCustomers.map((cust) => {
            const hasCoordinates = cust.lat && cust.lng;
            const gmapsUrl = hasCoordinates
              ? `https://www.google.com/maps?q=${cust.lat},${cust.lng}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  cust.location || cust.name
                )}`;

            return (
              <div
                key={cust.id}
                className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
              >
                {/* Card Header: Avatar, Name, Status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 shadow-sm ${getAvatarColor(
                        cust.name
                      )}`}
                    >
                      {getInitials(cust.name)}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base leading-tight">
                        {cust.name || "Unnamed"}
                      </h3>
                      <div className="text-xs text-gray-600 font-semibold flex items-center gap-1.5 mt-0.5">
                        <Store className="w-3.5 h-3.5 text-gray-400" />
                        <span>{cust.businessName || cust.business || "No Shop Name"}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {formatDateIST(cust.createdAt)} ({getRelativeTime(cust.createdAt)})
                      </div>
                    </div>
                  </div>
                  {renderStatusBadge(cust.status)}
                </div>

                {/* Card Body: Phone, Location, Consent */}
                <div className="bg-gray-50/80 rounded-xl p-3 space-y-2 text-xs border border-gray-100">
                  {/* Phone */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-medium flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-blue-600" />
                      {cust.phone || "No phone"}
                    </span>
                    {cust.phone && (
                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${cust.phone}`}
                          className="text-[11px] font-bold text-blue-600 hover:underline"
                        >
                          Call
                        </a>
                        <span className="text-gray-300">•</span>
                        <a
                          href={`https://wa.me/91${cust.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-bold text-emerald-600 hover:underline"
                        >
                          WhatsApp
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Location */}
                  <div className="flex items-start justify-between gap-2 pt-1.5 border-t border-gray-200/50">
                    <span className="text-gray-500 font-medium flex items-start gap-1.5 truncate max-w-[200px]" title={cust.location}>
                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                      <span className="truncate">{cust.location || "No coordinates"}</span>
                    </span>
                    {cust.location && (
                      <a
                        href={gmapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1 shrink-0"
                      >
                        Maps <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {/* Consent */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-gray-200/50">
                    <span className="text-[11px] text-gray-500">Legal Consent</span>
                    {cust.consent_given ? (
                      <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Granted
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                        Not Given
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Footer: Quick Actions */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <select
                      value={cust.status || "PENDING"}
                      onChange={(e) => handleUpdateStatus(cust, e.target.value)}
                      className="text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none cursor-pointer"
                    >
                      <option value="PENDING">Pending</option>
                      <option value="APPROVED">Approve</option>
                      <option value="CONTACTED">Contacted</option>
                      <option value="REJECTED">Reject</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openDetailModal(cust)}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold text-gray-700 flex items-center gap-1 transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Details</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openConvertModal(cust)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-xs font-bold text-white flex items-center gap-1 transition shadow-xs"
                      title="Convert to Active Customer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Convert</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: FULL CUSTOMER REGISTRATION DOSSIER                               */}
      {/* ========================================================================= */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-5 flex items-start justify-between">
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-base shrink-0 shadow-md ${getAvatarColor(
                    selectedCustomer.name
                  )}`}
                >
                  {getInitials(selectedCustomer.name)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-white">
                      {selectedCustomer.name || "Unnamed"}
                    </h2>
                    {renderStatusBadge(selectedCustomer.status)}
                  </div>
                  <p className="text-xs text-gray-300 font-medium flex items-center gap-1.5 mt-1">
                    <Store className="w-3.5 h-3.5 text-blue-400" />
                    <span>
                      {selectedCustomer.businessName ||
                        selectedCustomer.business ||
                        "No business registered"}
                    </span>
                    <span className="text-gray-500">•</span>
                    <span>Doc ID: {selectedCustomer.id}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
              {/* Section 1: Contact Details & Quick Communications */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-blue-600" />
                  Contact & Communication
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-400 text-[11px]">Phone Number</span>
                    <div className="text-sm font-bold text-gray-900 flex items-center gap-2 mt-0.5">
                      <span>{selectedCustomer.phone || "Not provided"}</span>
                      {selectedCustomer.phone && (
                        <button
                          type="button"
                          onClick={() => handleCopy(selectedCustomer.phone, "Phone")}
                          className="text-gray-400 hover:text-gray-700"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[11px]">Registration Source</span>
                    <div className="text-sm font-bold text-gray-900 mt-0.5 flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-indigo-600" />
                      <span>{selectedCustomer.source || "App registration"}</span>
                    </div>
                  </div>
                </div>

                {selectedCustomer.phone && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200/60">
                    <a
                      href={`tel:${selectedCustomer.phone}`}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 transition text-xs shadow-xs"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Call Immediately</span>
                    </a>
                    <a
                      href={`https://wa.me/91${selectedCustomer.phone.replace(
                        /\D/g,
                        ""
                      )}?text=${encodeURIComponent(
                        `Hello ${selectedCustomer.name}, greeting from EggBucket Retail!`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 transition text-xs shadow-xs"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat on WhatsApp</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Section 2: Location & Mapping */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-rose-600" />
                    Location & Coordinates
                  </h4>
                  {selectedCustomer.location && (
                    <a
                      href={`https://www.google.com/maps?q=${selectedCustomer.lat || ""},${
                        selectedCustomer.lng || ""
                      }`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <span>Open Google Maps</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-400 text-[11px]">Location String</span>
                    <p className="text-xs font-bold text-gray-900 mt-0.5">
                      {selectedCustomer.location || "No location captured"}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[11px]">Parsed Lat / Lng</span>
                    <p className="text-xs font-bold text-gray-900 mt-0.5 font-mono">
                      {selectedCustomer.lat && selectedCustomer.lng
                        ? `${selectedCustomer.lat}, ${selectedCustomer.lng}`
                        : "N/A"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Section 3: Legal Consent Audit Trail */}
              <div className="bg-indigo-50/50 border border-indigo-200/80 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-700" />
                  Legal Consent Audit & Regulatory Compliance
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-indigo-400 text-[11px]">Consent Granted</span>
                    <div className="text-xs font-bold text-indigo-950 mt-0.5">
                      {selectedCustomer.consent_given ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Yes (Verified)
                        </span>
                      ) : (
                        <span className="text-rose-700 font-bold">No</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-indigo-400 text-[11px]">Consent Type</span>
                    <p className="text-xs font-bold text-indigo-950 mt-0.5">
                      {selectedCustomer.consent_type || "service_calls"}
                    </p>
                  </div>
                  <div>
                    <span className="text-indigo-400 text-[11px]">Consent Timestamp</span>
                    <p className="text-xs font-bold text-indigo-950 mt-0.5">
                      {selectedCustomer.consent_timestamp || "N/A"}
                    </p>
                  </div>
                </div>

                {/* Consent Text signed by user */}
                {selectedCustomer.consent_text && (
                  <div className="mt-2 pt-2 border-t border-indigo-100">
                    <span className="text-indigo-600 text-[11px] font-semibold block mb-1">
                      Exact User Signed Agreement:
                    </span>
                    <div className="p-3 bg-white/90 border border-indigo-200 rounded-lg text-xs italic text-indigo-950 font-serif">
                      "{selectedCustomer.consent_text}"
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: Administrative Notes & Status Update */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-blue-600" />
                  Admin Notes & Status Modification
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1">
                      Update Registration Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full h-9 rounded-lg text-xs font-bold bg-white border border-gray-300 px-3 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="PENDING">PENDING (Under Review)</option>
                      <option value="APPROVED">APPROVED (Verified)</option>
                      <option value="CONTACTED">CONTACTED (Follow-up)</option>
                      <option value="REJECTED">REJECTED (Declined)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1">
                      Registered Date & Time
                    </label>
                    <div className="h-9 px-3 bg-gray-100 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 flex items-center">
                      {formatDateIST(selectedCustomer.createdAt)}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">
                    Internal Notes / Remarks
                  </label>
                  <textarea
                    rows={2}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Add notes about this customer, call remarks, shop size, etc..."
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={submittingAction}
                    onClick={() =>
                      handleUpdateStatus(selectedCustomer, editStatus, editNotes)
                    }
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    {submittingAction ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Save Status & Notes</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-100 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmCustomer(selectedCustomer)}
                className="px-3.5 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Record</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-xl text-xs font-bold transition"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const c = selectedCustomer;
                    setSelectedCustomer(null);
                    openConvertModal(c);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Convert to Customer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CONVERT TO ACTIVE CUSTOMER MODAL                                  */}
      {/* ========================================================================= */}
      {convertingCustomer && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-emerald-700 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-800/80 flex items-center justify-center font-bold">
                  <UserCheck className="w-5 h-5 text-emerald-200" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight">
                    Convert to Active Customer
                  </h3>
                  <p className="text-xs text-emerald-100 font-medium">
                    Approves registration & adds customer to live directory
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConvertingCustomer(null)}
                className="text-emerald-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConvertSubmit} className="p-6 space-y-4 text-xs">
              {/* Customer summary pill */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
                <div className="font-bold text-gray-900 text-sm">
                  {convertingCustomer.name}
                </div>
                <div className="text-gray-600 flex items-center gap-2">
                  <span>Shop: {convertingCustomer.businessName || convertingCustomer.business}</span>
                  <span>•</span>
                  <span>Phone: {convertingCustomer.phone}</span>
                </div>
                <div className="text-[11px] text-gray-500 truncate">
                  Loc: {convertingCustomer.location || "No coordinates"}
                </div>
              </div>

              {/* Zone Assignment */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Assign Delivery Zone
                </label>
                <select
                  value={convertForm.zone}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, zone: e.target.value })
                  }
                  className="w-full h-10 bg-white border border-gray-300 rounded-xl px-3 font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="UNASSIGNED">UNASSIGNED</option>
                  {zonesList.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>

              {/* Route Assignment */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Assign Delivery Route
                </label>
                <select
                  value={convertForm.route}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, route: e.target.value })
                  }
                  className="w-full h-10 bg-white border border-gray-300 rounded-xl px-3 font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value={convertForm.route || "R001N-Onboarding Customers (Everyone)"}>
                    {convertForm.route || "R001N-Onboarding Customers (Everyone)"} (Default)
                  </option>
                  <option value="UNASSIGNED">UNASSIGNED</option>
                  {routesList
                    .filter((r) => r !== (convertForm.route || "R001N-Onboarding Customers (Everyone)"))
                    .map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                </select>
              </div>

              {/* Potential Tier */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Initial Tray Potential
                </label>
                <select
                  value={convertForm.potential}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, potential: e.target.value })
                  }
                  className="w-full h-10 bg-white border border-gray-300 rounded-xl px-3 font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T15", "T20", "T25", "T30", "T50", "T100"].map(
                    (p) => (
                      <option key={p} value={p}>
                        {p} ({p.replace("T", "")} trays)
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Remarks / Notes
                </label>
                <input
                  type="text"
                  value={convertForm.remarks}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, remarks: e.target.value })
                  }
                  placeholder="Optional onboarding remarks"
                  className="w-full h-10 bg-white border border-gray-300 rounded-xl px-3 font-medium text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConvertingCustomer(null)}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 font-bold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50"
                >
                  {submittingAction ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Confirm & Convert</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: DELETE CONFIRMATION MODAL                                        */}
      {/* ========================================================================= */}
      {deleteConfirmCustomer && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center border border-rose-100">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Delete Registration?
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Are you sure you want to permanently delete registration for{" "}
                <strong className="text-gray-800">
                  {deleteConfirmCustomer.name}
                </strong>
                ? This cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmCustomer(null)}
                className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleDeleteCustomer}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {submittingAction && (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DELETE / CLEAR MANUAL PRIORITY CONFIRMATION MODAL               */}
      {/* ========================================================================= */}
      {deletePriorityModalCustomer && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-900">
                  {deletePriorityModalCustomer.attended
                    ? "Delete Priority Request?"
                    : "Cancel Priority Request?"}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  This will remove the manual priority flag (<code className="text-amber-700 bg-amber-50 px-1 py-0.5 rounded font-mono">manual_priority: false</code>) for{" "}
                  <strong className="text-gray-900">{deletePriorityModalCustomer.name}</strong>.
                </p>
              </div>
            </div>

            {/* Attendance Status Info Banner */}
            <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-semibold">Attendance Status:</span>
                {deletePriorityModalCustomer.attended ? (
                  deletePriorityModalCustomer.attendedType === "DELIVERED" ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Delivered ({deletePriorityModalCustomer.attendedQuantity || 0} Trays)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      Checked {deletePriorityModalCustomer.attendedReason && `(${deletePriorityModalCustomer.attendedReason})`}
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    Pending Delivery
                  </span>
                )}
              </div>

              {deletePriorityModalCustomer.attendedAgent && (
                <div className="flex items-center justify-between text-[11px] text-gray-600 pt-1 border-t border-gray-200/60">
                  <span>Delivery Agent:</span>
                  <span className="font-bold text-gray-800">{deletePriorityModalCustomer.attendedAgent}</span>
                </div>
              )}

              {deletePriorityModalCustomer.attendedDate && (
                <div className="flex items-center justify-between text-[11px] text-gray-600">
                  <span>Attendance Date:</span>
                  <span className="font-semibold text-gray-800">{deletePriorityModalCustomer.attendedDate}</span>
                </div>
              )}

              {deletePriorityModalCustomer.businessName && (
                <div className="flex items-center justify-between text-[11px] text-gray-600">
                  <span>Shop / Business:</span>
                  <span className="font-semibold text-gray-800">{deletePriorityModalCustomer.businessName}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletePriorityModalCustomer(null)}
                disabled={clearingPriority}
                className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearPriority}
                disabled={clearingPriority}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-rose-600/20 disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {clearingPriority ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
