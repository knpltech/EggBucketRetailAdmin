import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FiUsers, FiCalendar, FiEdit2 } from "react-icons/fi";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { ADMIN_PATH } from "../constant";
import {
  getCachedUserInfo,
  patchCachedUserInfoCustomer,
} from "../utils/customerInfoClientCache";
import ExecutionCalendarModal from "../components/ExecutionCalendarModal";
import {
  LOGIC_1_PURCHASE_CADENCE,
  LOGIC_2_CUSTOMER_STATE,
  LOGIC_3_PURCHASE_INTENT,
  DEFAULT_LOGIC_1,
  DEFAULT_LOGIC_2,
  DEFAULT_LOGIC_3,
  resolveCleanPattern,
  getTodayEffectiveStatus as resolveTodayEffectiveStatus,
} from "../utils/aiSuggestionEngine";
import {
  getDateStringInTimeZone,
  getPeakFrequencyNumber,
  computePeakFrequency,
  resolvePeakFrequency,
  getPeakFrequencyLabel,
  getPeakFrequencyColor,
  normalizePotential,
  getPotentialNumber,
  computePeakPotentialNumber,
  computePotential,
  getPotentialColor,
  getDeliveredCountForCustomer,
  getCurrentCategory,
  getCurrentCategoryColor,
  normalizeDeliveryGap,
  getDeliveryGapNumber,
  getDeliveryGapColor,
  getFrequencyGapNumber,
  getFrequencyGapLabel,
  getFrequencyGapColor,
  getRiskFactorNumber,
  getRiskFactorLabel,
  getRiskFactorColor,
  getStatusColor,
  buildAgentInitialsMap,
  getAgentInitials,
  isCustomerAssignedToAgent,
} from "../utils/customerMetrics";

// TABS
const TABS = [
  "ALL",
  "RESIDENTIAL CUSTOMER",
  "ONBOARDING",
  "CALLING CUSTOMER",
  "D0",
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "D6",
  "D7",
];

// ─── Residential Customer Helper ─────────────────────────────────────────────

/**
 * Determine if a customer is a Residential Customer
 * Formula: Customer whose Business Type is Residential Customers
 */
export function isResidentialCustomer(customer = {}) {
  if (!customer || typeof customer !== "object") return false;
  const bt = String(customer.businessType || "").trim().toLowerCase();
  return bt.includes("residential") || bt.includes("residencial");
}

export default function CustomerManagement() {
  const [customers, setCustomers] = useState([]);
  const [categoryPeaks, setCategoryPeaks] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  const [activeTab, setActiveTab] = useState("ALL");
  const [activeBusinessTab, setActiveBusinessTab] = useState("ALL");
  const [activeZoneTab, setActiveZoneTab] = useState("ALL");
  const [activeGapTab, setActiveGapTab] = useState("ALL");
  const [activeRouteTab, setActiveRouteTab] = useState("ALL");
  const [activeAgentTab, setActiveAgentTab] = useState("ALL AGENTS");
  const [activeWeekdayTab, setActiveWeekdayTab] = useState("ALL CUSTOMERS");
  const [activeStatusTab, setActiveStatusTab] = useState("ALL STATUS");
  const [activeRemarkTab, setActiveRemarkTab] = useState("ALL");
  const [activeCadenceFilter, setActiveCadenceFilter] = useState("ALL");
  const [activeStateFilter, setActiveStateFilter] = useState("ALL");
  const [activeIntentFilter, setActiveIntentFilter] = useState("ALL");
  const [zones, setZones] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [agents, setAgents] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [sortBy, setSortBy] = useState("name");
  const [updatingTodayId, setUpdatingTodayId] = useState(null);
  const [updatingScheduleId, setUpdatingScheduleId] = useState(null);
  const [openScheduleId, setOpenScheduleId] = useState(null);
  const [calendarCustomer, setCalendarCustomer] = useState(null);
  const [resettingCustomerId, setResettingCustomerId] = useState("");

  const [assigningRouteId, setAssigningRouteId] = useState(null);
  const [editingRouteId, setEditingRouteId] = useState(null);

  const [assigningZoneId, setAssigningZoneId] = useState(null);
  const [editingZoneId, setEditingZoneId] = useState(null);

  const assignZone = async (id, zoneName) => {
    if (!zoneName || assigningZoneId === id) return;

    try {
      setAssigningZoneId(id);
      await axios.post(`${ADMIN_PATH}/customer/status`, {
        id,
        zone: zoneName,
      });

      setCustomers((prev) =>
        prev.map((c) => (c.id === id ? { ...c, zone: zoneName } : c))
      );
    } catch (err) {
      console.error("Error assigning zone:", err);
      alert("Failed to assign zone");
    } finally {
      setAssigningZoneId(null);
    }
  };

  const assignRoute = async (id, routeName) => {
    if (!routeName || assigningRouteId === id) return;

    try {
      setAssigningRouteId(id);
      await axios.post(`${ADMIN_PATH}/customer/status`, {
        id,
        route: routeName,
      });

      setCustomers((prev) =>
        prev.map((c) => (c.id === id ? { ...c, route: routeName } : c))
      );
    } catch (err) {
      console.error("Error assigning route:", err);
      alert("Failed to assign route");
    } finally {
      setAssigningRouteId(null);
    }
  };

  const canDownloadExcel = true;
  const todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata");

  // ─── Helper: normalise a page response into rows ──────────────────────────
  const normaliseRows = (rows) =>
    rows.map((c) => ({
      ...c,
      peakFrequency: resolvePeakFrequency(c),
      potential: c.Peak_Potential || computePotential(c.last8Days),
      deliveryGap: normalizeDeliveryGap(c.deliveryGap),
      deliveredCount: getDeliveredCountForCustomer(c),
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

        const normalizedRows = normaliseRows(rows);
        setCustomers(normalizedRows);

        // Fetch category peak potentials for today's weekday
        try {
          const peakRes = await axios.get(`${ADMIN_PATH}/category-peak-potentials`);
          setCategoryPeaks(peakRes.data || {});
        } catch (err) {
          console.error("Error fetching category peak potentials:", err);
        }

        // Fetch zones dynamically
        try {
          const zonesRes = await axios.get(`${ADMIN_PATH}/zones`);
          setZones(zonesRes.data || []);
        } catch (err) {
          console.error("Error fetching zones:", err);
        }

        // Fetch routes dynamically
        try {
          const routesRes = await axios.get(`${ADMIN_PATH}/routes`);
          const routeNames = (routesRes.data || []).map(r => typeof r === "string" ? r : r.name).filter(Boolean);
          setRoutes(routeNames);
        } catch (err) {
          console.error("Error fetching routes:", err);
        }

        // Fetch agents dynamically
        try {
          const agentsRes = await axios.get(`${ADMIN_PATH}/get-del-partner`);
          setAgents(agentsRes.data || []);
        } catch (err) {
          console.error("Error fetching agents:", err);
        }

        // Fetch business types dynamically
        try {
          const btRes = await axios.get(`${ADMIN_PATH}/business-types`);
          const rawBt = btRes.data || [];
          const sanitizedBt = rawBt
            .map((t) => {
              const val = String(t || "").trim();
              if (!val || val.toLowerCase() === "premium customer") return null;
              if (val.toLowerCase().includes("residential") || val.toLowerCase().includes("residencial")) {
                return "RESIDENTIAL CUSTOMERS";
              }
              return val;
            })
            .filter(Boolean);
          setBusinessTypes(Array.from(new Set(sanitizedBt)));
        } catch (err) {
          console.error("Error fetching business types:", err);
        }
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
  }, [activeTab, activeBusinessTab, activeZoneTab, activeRouteTab, activeAgentTab, activeWeekdayTab, activeStatusTab, activeGapTab, sortBy, activeRemarkTab, activeCadenceFilter, activeStateFilter, activeIntentFilter]);

  // ─── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenScheduleId(null);
      setCalendarCustomer(null);
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const getDeliveredCount = (customer) => {
    const last8Days = customer.last8Days || {};
    let count = 0;
    const today = new Date();
    // Today + last 7 days (8 days total: i = 0 through 7)
    for (let i = 0; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = getDateStringInTimeZone(d, "Asia/Kolkata");
      const entry = last8Days[dateStr];
      const status = typeof entry === "string" ? entry : entry?.status;
      if (status === "delivered") count++;
    }
    return Math.min(count, 7);
  };

  const getLatestStatus = (customer) => {
    const last8Days = customer.last8Days || {};
    const entry = last8Days[todayDate];
    const todayStatus = (
      typeof entry === "string" ? entry : entry?.status || ""
    )
      .trim()
      .toLowerCase();
    if (todayStatus === "delivered") return "Delivered";
    if (
      [
        "checked",
        "reached",
        "price_mismatch",
        "stock_available",
        "other_vendor",
        "confirmed_tomorrow",
      ].includes(todayStatus)
    )
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
    return raw
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getTodayEffectiveStatus = (customer) => {
    return resolveTodayEffectiveStatus(customer, todayDate);
  };

  const getAttendedAgentNameForDate = (customer, dateKey = todayDate) => {
    const last8Days = customer.last8Days || {};
    const dayEntry = last8Days[dateKey];
    if (!dayEntry) return "";

    const entryObj = typeof dayEntry === "object" ? dayEntry : { status: dayEntry };
    const rawStatus = String(entryObj.status || "").trim().toLowerCase();

    const isDelivered = rawStatus === "delivered";
    const isChecked = [
      "checked",
      "reached",
      "price_mismatch",
      "price_issue",
      "shop_closed",
      "stock_available",
      "other_vendor",
      "confirmed_tomorrow",
      "confirmed_for_tomorrow",
      "need_credit",
      "quality_issue",
      "owner_not_available",
    ].includes(rawStatus) || Boolean(entryObj.reason) || Boolean(entryObj.checkReason);

    // Only attended customers (Delivered or Checked) have an attending agent
    if (!isDelivered && !isChecked) {
      return "";
    }

    // 1. Direct agentName
    if (entryObj.agentName && typeof entryObj.agentName === "string" && entryObj.agentName.trim()) {
      return entryObj.agentName.trim();
    }

    // 2. Nested agent object
    const nested = entryObj.assignedDeliverymen || entryObj.agent || null;
    if (nested && typeof nested === "object") {
      const nName = nested.name || nested.display_name || nested.agentName || "";
      if (nName) return nName.trim();
    }

    // 3. Match agentId in agents array
    const aId = entryObj.agentId || entryObj.deliveryManId || (typeof nested === "string" ? nested : "");
    if (aId) {
      const matched = (agents || []).find((a) => a.id === aId || a._id === aId || a.uid === aId);
      if (matched) {
        return (matched.name || matched.display_name || "").trim();
      }
    }

    if (entryObj.deliveryMan) {
      if (typeof entryObj.deliveryMan === "string") {
        const dm = entryObj.deliveryMan.trim();
        const matched = (agents || []).find((a) => a.id === dm || a.uid === dm || (a.name && a.name.toLowerCase() === dm.toLowerCase()));
        if (matched) return (matched.name || matched.display_name || "").trim();
        return dm;
      }
      if (typeof entryObj.deliveryMan === "object") {
        return (entryObj.deliveryMan.name || entryObj.deliveryMan.display_name || "").trim();
      }
    }

    if (customer.deliveryAgent && customer.deliveryAgent !== "-") {
      return String(customer.deliveryAgent).trim();
    }

    return "";
  };

  const getDeliveredOrCheckedAgentName = (customer) => {
    return getAttendedAgentNameForDate(customer, todayDate);
  };

  const isCustomerAttendedBySelectedAgent = (customer, selectedAgent, dateKey = todayDate) => {
    if (!customer || !selectedAgent) return false;

    const attendedName = getAttendedAgentNameForDate(customer, dateKey);
    if (!attendedName) return false;

    const targetName = String(selectedAgent.name || selectedAgent.display_name || selectedAgent.id || "").trim().toLowerCase();
    const targetId = String(selectedAgent.id || selectedAgent.uid || selectedAgent._id || "").trim();

    if (targetName && attendedName.toLowerCase() === targetName) {
      return true;
    }

    const last8Days = customer.last8Days || {};
    const dayEntry = last8Days[dateKey];
    const entryObj = typeof dayEntry === "object" ? dayEntry : {};
    const eAgentId = String(entryObj.agentId || entryObj.deliveryManId || "").trim();
    if (targetId && eAgentId && (eAgentId === targetId || eAgentId === selectedAgent.uid)) {
      return true;
    }

    const nested = entryObj.assignedDeliverymen || entryObj.agent;
    if (nested && typeof nested === "object") {
      const nName = String(nested.name || nested.display_name || nested.agentName || "").trim().toLowerCase();
      if (targetName && nName === targetName) return true;
      const nId = String(nested.id || nested._id || nested.uid || "").trim();
      if (targetId && nId && (nId === targetId || nId === selectedAgent.uid)) return true;
    } else if (typeof nested === "string" && nested.trim()) {
      if (targetId && (nested.trim() === targetId || nested.trim() === selectedAgent.uid)) return true;
      if (nested.trim().toLowerCase() === targetName) return true;
    }

    if (entryObj.deliveryMan) {
      if (typeof entryObj.deliveryMan === "string") {
        const dm = entryObj.deliveryMan.trim();
        if (targetId && (dm === targetId || dm === selectedAgent.uid)) return true;
        if (dm.toLowerCase() === targetName) return true;
      } else if (typeof entryObj.deliveryMan === "object") {
        const dmName = String(entryObj.deliveryMan.name || entryObj.deliveryMan.display_name || "").trim().toLowerCase();
        if (targetName && dmName === targetName) return true;
        const dmId = String(entryObj.deliveryMan.id || entryObj.deliveryMan._id || entryObj.deliveryMan.uid || "").trim();
        if (targetId && dmId && (dmId === targetId || dmId === selectedAgent.uid)) return true;
      }
    }

    return false;
  };

  const agentInitialsMap = useMemo(() => {
    const names = [];
    if (Array.isArray(agents)) {
      agents.forEach((a) => {
        const name = a.name || a.display_name;
        if (name) names.push(name);
      });
    }
    if (Array.isArray(customers)) {
      customers.forEach((c) => {
        const todayEntry = c.last8Days?.[todayDate];
        if (todayEntry?.agentName) names.push(todayEntry.agentName);
      });
    }
    return buildAgentInitialsMap(names);
  }, [agents, customers, todayDate]);

  // ─── Filter + Sort (on loaded data) ───────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...customers];
    if (activeTab === "RESIDENTIAL CUSTOMER" || activeTab === "RESIDENTIAL CUSTOMERS") {
      list = list.filter((c) => isResidentialCustomer(c));
    } else if (activeTab === "ONBOARDING") {
      const fortyFiveDaysMs = 45 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      list = list.filter((c) => {
        if (!c.createdAt) return false;
        const createdTime = new Date(c.createdAt).getTime();
        return (now - createdTime) <= fortyFiveDaysMs;
      });
    } else if (activeTab === "CALLING CUSTOMER" || activeTab === "CALLING CUSTOMERS") {
      list = list.filter((c) => {
        const bt = String(c.businessType || "").trim().toLowerCase();
        return bt === "calling customer" || bt === "calling customers";
      });
    } else if (/^D[0-7]$/.test(activeTab)) {
      const targetDays = Number(activeTab.slice(1));
      list = list.filter((c) => {
        const count = c.deliveredCount ?? getDeliveredCount(c);
        return targetDays === 7 ? count >= 7 : count === targetDays;
      });
    }

    if (activeBusinessTab !== "ALL") {
      if (activeBusinessTab === "UNASSIGNED") {
        list = list.filter((c) => !c.businessType || String(c.businessType).trim() === "" || String(c.businessType).trim().toUpperCase() === "UNASSIGNED");
      } else {
        list = list.filter(
          (c) => String(c.businessType || "").trim().toLowerCase() === activeBusinessTab.toLowerCase()
        );
      }
    }

    if (activeZoneTab !== "ALL") {
      if (activeZoneTab === "UNASSIGNED") {
        list = list.filter((c) => !c.zone || String(c.zone).trim() === "" || String(c.zone).trim().toUpperCase() === "UNASSIGNED");
      } else {
        list = list.filter(
          (c) => String(c.zone || "").trim().toLowerCase() === activeZoneTab.toLowerCase()
        );
      }
    }

    if (activeRouteTab !== "ALL") {
      if (activeRouteTab === "UNASSIGNED") {
        list = list.filter((c) => !c.route || String(c.route).trim() === "");
      } else {
        list = list.filter(
          (c) => String(c.route || "").trim().toLowerCase() === activeRouteTab.toLowerCase()
        );
      }
    }

    if (activeAgentTab !== "ALL AGENTS") {
      if (activeAgentTab === "UNASSIGNED") {
        list = list.filter((c) => {
          const attendedName = getAttendedAgentNameForDate(c, todayDate);
          return !attendedName || attendedName === "-" || attendedName.toLowerCase() === "unassigned";
        });
      } else {
        const selectedAgent = (agents || []).find((a) => a.id === activeAgentTab || a.uid === activeAgentTab || a._id === activeAgentTab) || { id: activeAgentTab, name: activeAgentTab };
        list = list.filter((c) => isCustomerAttendedBySelectedAgent(c, selectedAgent, todayDate));
      }
    }

    if (activeWeekdayTab !== "ALL CUSTOMERS") {
      const dayKeyMap = {
        "Sunday": "sun",
        "Monday": "mon",
        "Tuesday": "tue",
        "Wednesday": "wed",
        "Thursday": "thu",
        "Friday": "fri",
        "Saturday": "sat"
      };
      const dayKey = dayKeyMap[activeWeekdayTab];
      if (dayKey) {
        list = list.filter((c) => {
          const s = c.weeklySchedule || { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true };
          return s[dayKey] === true;
        });
      }
    }

    if (activeStatusTab !== "ALL STATUS") {
      if (activeStatusTab === "Undelivered") {
        list = list.filter((c) => {
          const s = getLatestStatus(c).toLowerCase();
          return s === "checked" || s === "pending";
        });
      } else {
        list = list.filter((c) => getLatestStatus(c).toLowerCase() === activeStatusTab.toLowerCase());
      }
    }

    if (activeGapTab !== "ALL") {
      list = list.filter((c) => {
        const gapNum = getDeliveryGapNumber(c.deliveryGap);
        if (activeGapTab === "G0") return gapNum === 0;
        if (activeGapTab === "G1") return gapNum === 1;
        if (activeGapTab === "G2") return gapNum === 2;
        if (activeGapTab === "G3") return gapNum === 3;
        if (activeGapTab === "G4") return gapNum === 4;
        if (activeGapTab === "G5") return gapNum === 5;
        if (activeGapTab === "G6") return gapNum === 6;
        if (activeGapTab === "G7") return gapNum === 7;
        if (activeGapTab === "G7+") return gapNum >= 7;
        if (activeGapTab === "G10+") return gapNum >= 10;
        if (activeGapTab === "G15+") return gapNum >= 15;
        if (activeGapTab === "G20+") return gapNum >= 20;
        if (activeGapTab === "G30+") return gapNum >= 30;
        return true;
      });
    }

    if (activeRemarkTab !== "ALL") {
      list = list.filter((c) => {
        const last8Days = c.last8Days || {};
        const entry = last8Days[todayDate];
        const entryObj = typeof entry === "object" ? entry : {};
        const status = getLatestStatus(c);
        const reason = String(entryObj.reason || entryObj.status || entryObj.type || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_");
        const matchVal = activeRemarkTab.toLowerCase();
        return (
          status === "Checked" &&
          (reason === matchVal ||
            (matchVal === "price_issue" && (reason === "price_issue" || reason === "price_mismatch")) ||
            (matchVal === "confirmed_tomorrow" && (reason === "confirmed_tomorrow" || reason === "confirmed_for_tomorrow")))
        );
      });
    }

    if (activeCadenceFilter !== "ALL") {
      list = list.filter((c) => {
        const val = resolveCleanPattern(c.purchaseCadence || c.pattern, LOGIC_1_PURCHASE_CADENCE, DEFAULT_LOGIC_1);
        return val === activeCadenceFilter;
      });
    }

    if (activeStateFilter !== "ALL") {
      list = list.filter((c) => {
        const val = resolveCleanPattern(c.customerState, LOGIC_2_CUSTOMER_STATE, DEFAULT_LOGIC_2);
        return val === activeStateFilter;
      });
    }

    if (activeIntentFilter !== "ALL") {
      list = list.filter((c) => {
        const val = resolveCleanPattern(c.purchaseIntent, LOGIC_3_PURCHASE_INTENT, DEFAULT_LOGIC_3);
        return val === activeIntentFilter;
      });
    }

    if (sortBy === "name") {
      list.sort((a, b) =>
        getName(a).toLowerCase().localeCompare(getName(b).toLowerCase()),
      );
    } else if (sortBy === "zone") {
      list.sort((a, b) =>
        String(a.zone || "")
          .toLowerCase()
          .localeCompare(String(b.zone || "").toLowerCase()),
      );
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
    } else if (sortBy === "frequencyGap") {
      list.sort((a, b) => {
        const diff = getFrequencyGapNumber(b) - getFrequencyGapNumber(a);
        if (diff !== 0) return diff;
        return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
      });
    } else if (sortBy === "riskFactor") {
      list.sort((a, b) => {
        const diff = getRiskFactorNumber(a) - getRiskFactorNumber(b);
        if (diff !== 0) return diff;
        return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
      });
    } else if (sortBy === "peakPotential") {
      list.sort((a, b) => {
        const diff =
          getPotentialNumber(b.potential) - getPotentialNumber(a.potential);
        if (diff !== 0) return diff;
        return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
      });
    } else if (sortBy === "deliveryGap") {
      list.sort((a, b) => {
        const diff =
          getDeliveryGapNumber(a.deliveryGap) -
          getDeliveryGapNumber(b.deliveryGap);
        if (diff !== 0) return diff;
        return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
      });
    } else if (sortBy === "currentCategory") {
      list.sort((a, b) => {
        const aCount = a.deliveredCount ?? getDeliveredCountForCustomer(a);
        const bCount = b.deliveredCount ?? getDeliveredCountForCustomer(b);
        const diff = bCount - aCount;
        if (diff !== 0) return diff;
        return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
      });
    } else if (sortBy === "remarks") {
      const withR = list.filter((c) => getRemarkDisplay(c) !== "");
      const noR = list.filter((c) => getRemarkDisplay(c) === "");
      withR.sort((a, b) =>
        getRemarkDisplay(a)
          .toLowerCase()
          .localeCompare(getRemarkDisplay(b).toLowerCase()),
      );
      noR.sort((a, b) =>
        getName(a).toLowerCase().localeCompare(getName(b).toLowerCase()),
      );
      return [...withR, ...noR];
    } else if (sortBy === "weeklySchedule") {
      list.sort((a, b) => {
        const getDaysCount = (c) => {
          const schedule = c.weeklySchedule || {
            mon: true,
            tue: true,
            wed: true,
            thu: true,
            fri: true,
            sat: true,
            sun: true,
          };
          return Object.values(schedule).filter(Boolean).length;
        };
        const diff = getDaysCount(b) - getDaysCount(a);
        if (diff !== 0) return diff;
        return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
      });
    } else if (sortBy === "purchaseCadence") {
      list.sort((a, b) => {
        const valA = resolveCleanPattern(a.purchaseCadence || a.pattern, LOGIC_1_PURCHASE_CADENCE, DEFAULT_LOGIC_1);
        const valB = resolveCleanPattern(b.purchaseCadence || b.pattern, LOGIC_1_PURCHASE_CADENCE, DEFAULT_LOGIC_1);
        return valA.localeCompare(valB);
      });
    } else if (sortBy === "customerState") {
      list.sort((a, b) => {
        const valA = resolveCleanPattern(a.customerState, LOGIC_2_CUSTOMER_STATE, DEFAULT_LOGIC_2);
        const valB = resolveCleanPattern(b.customerState, LOGIC_2_CUSTOMER_STATE, DEFAULT_LOGIC_2);
        return valA.localeCompare(valB);
      });
    } else if (sortBy === "purchaseIntent") {
      list.sort((a, b) => {
        const valA = resolveCleanPattern(a.purchaseIntent, LOGIC_3_PURCHASE_INTENT, DEFAULT_LOGIC_3);
        const valB = resolveCleanPattern(b.purchaseIntent, LOGIC_3_PURCHASE_INTENT, DEFAULT_LOGIC_3);
        return valA.localeCompare(valB);
      });
    } else {
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return list;
  }, [customers, activeTab, activeBusinessTab, activeZoneTab, activeRouteTab, activeAgentTab, activeWeekdayTab, activeStatusTab, activeGapTab, sortBy, todayDate, agents, activeRemarkTab, activeCadenceFilter, activeStateFilter, activeIntentFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredActiveCount = useMemo(() => {
    return filtered.filter((c) => getTodayEffectiveStatus(c) === "ON").length;
  }, [filtered, todayDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const yesterdayFilteredCount = useMemo(() => {
    let list = [...customers];
    
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    list = list.filter((c) => {
      if (!c.createdAt) return true;
      return new Date(c.createdAt) < todayStart;
    });

    const getYesterdayDeliveredCount = (customer) => {
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

    if (activeTab === "RESIDENTIAL CUSTOMER" || activeTab === "RESIDENTIAL CUSTOMERS") {
      list = list.filter((c) => isResidentialCustomer(c));
    } else if (activeTab === "ONBOARDING") {
      const fortyFiveDaysMs = 45 * 24 * 60 * 60 * 1000;
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;
      list = list.filter((c) => {
        if (!c.createdAt) return false;
        const createdTime = new Date(c.createdAt).getTime();
        return (yesterday - createdTime) <= fortyFiveDaysMs;
      });
    } else if (activeTab === "CALLING CUSTOMER" || activeTab === "CALLING CUSTOMERS") {
      list = list.filter((c) => {
        const bt = String(c.businessType || "").trim().toLowerCase();
        return bt === "calling customer" || bt === "calling customers";
      });
    } else if (/^D[0-7]$/.test(activeTab)) {
      const targetDays = Number(activeTab.slice(1));
      list = list.filter((c) => targetDays === 7 ? getYesterdayDeliveredCount(c) >= 7 : getYesterdayDeliveredCount(c) === targetDays);
    }

    if (activeBusinessTab !== "ALL") {
      if (activeBusinessTab === "UNASSIGNED") {
        list = list.filter((c) => !c.businessType || String(c.businessType).trim() === "" || String(c.businessType).trim().toUpperCase() === "UNASSIGNED");
      } else {
        list = list.filter((c) => String(c.businessType || "").trim().toLowerCase() === activeBusinessTab.toLowerCase());
      }
    }

    if (activeZoneTab !== "ALL") {
      if (activeZoneTab === "UNASSIGNED") {
        list = list.filter((c) => !c.zone || String(c.zone).trim() === "" || String(c.zone).trim().toUpperCase() === "UNASSIGNED");
      } else {
        list = list.filter((c) => String(c.zone || "").trim().toLowerCase() === activeZoneTab.toLowerCase());
      }
    }

    if (activeRouteTab !== "ALL") {
      if (activeRouteTab === "UNASSIGNED") {
        list = list.filter((c) => !c.route || String(c.route).trim() === "");
      } else {
        list = list.filter((c) => String(c.route || "").trim().toLowerCase() === activeRouteTab.toLowerCase());
      }
    }

    if (activeAgentTab !== "ALL AGENTS") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = getDateStringInTimeZone(yesterday, "Asia/Kolkata");

      if (activeAgentTab === "UNASSIGNED") {
        list = list.filter((c) => {
          const attendedName = getAttendedAgentNameForDate(c, yesterdayDate);
          return !attendedName || attendedName === "-" || attendedName.toLowerCase() === "unassigned";
        });
      } else {
        const selectedAgent = (agents || []).find((a) => a.id === activeAgentTab || a.uid === activeAgentTab || a._id === activeAgentTab) || { id: activeAgentTab, name: activeAgentTab };
        list = list.filter((c) => isCustomerAttendedBySelectedAgent(c, selectedAgent, yesterdayDate));
      }
    }

    if (activeWeekdayTab !== "ALL CUSTOMERS") {
      const dayKeyMap = { Sunday: "sun", Monday: "mon", Tuesday: "tue", Wednesday: "wed", Thursday: "thu", Friday: "fri", Saturday: "sat" };
      const dayKey = dayKeyMap[activeWeekdayTab];
      if (dayKey) {
        list = list.filter((c) => {
          const s = c.weeklySchedule || { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true };
          return s[dayKey] === true;
        });
      }
    }

    if (activeStatusTab !== "ALL STATUS") {
      const getYesterdayLatestStatus = (customer) => {
        const last8Days = customer.last8Days || {};
        const today = new Date();
        today.setDate(today.getDate() - 1);
        const dateStr = getDateStringInTimeZone(today, "Asia/Kolkata");
        const entry = last8Days[dateStr];
        const st = (typeof entry === "string" ? entry : entry?.status || "").trim().toLowerCase();
        if (st === "delivered") return "Delivered";
        if (["checked", "reached", "price_mismatch", "stock_available", "other_vendor", "confirmed_tomorrow"].includes(st)) return "Checked";
        return "Pending";
      };

      if (activeStatusTab === "Undelivered") {
        list = list.filter((c) => {
          const s = getYesterdayLatestStatus(c).toLowerCase();
          return s === "checked" || s === "pending";
        });
      } else {
        list = list.filter((c) => getYesterdayLatestStatus(c).toLowerCase() === activeStatusTab.toLowerCase());
      }
    }

    if (activeGapTab !== "ALL") {
      list = list.filter((c) => {
        const gapNum = getDeliveryGapNumber(c.deliveryGap);
        if (activeGapTab === "G0") return gapNum === 0;
        if (activeGapTab === "G1") return gapNum === 1;
        if (activeGapTab === "G2") return gapNum === 2;
        if (activeGapTab === "G3") return gapNum === 3;
        if (activeGapTab === "G4") return gapNum === 4;
        if (activeGapTab === "G5") return gapNum === 5;
        if (activeGapTab === "G6") return gapNum === 6;
        if (activeGapTab === "G7") return gapNum === 7;
        if (activeGapTab === "G7+") return gapNum >= 7;
        if (activeGapTab === "G10+") return gapNum >= 10;
        if (activeGapTab === "G15+") return gapNum >= 15;
        if (activeGapTab === "G20+") return gapNum >= 20;
        if (activeGapTab === "G30+") return gapNum >= 30;
        return true;
      });
    }

    if (activeRemarkTab !== "ALL") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDateStr = getDateStringInTimeZone(yesterday, "Asia/Kolkata");
      list = list.filter((c) => {
        const last8Days = c.last8Days || {};
        const entry = last8Days[yesterdayDateStr];
        const entryObj = typeof entry === "object" ? entry : {};
        const getYesterdayLatestStatus = (customer) => {
          const last8Days = customer.last8Days || {};
          const entry = last8Days[yesterdayDateStr];
          const st = (typeof entry === "string" ? entry : entry?.status || "").trim().toLowerCase();
          if (st === "delivered") return "Delivered";
          if (["checked", "reached", "price_mismatch", "stock_available", "other_vendor", "confirmed_tomorrow"].includes(st)) return "Checked";
          return "Pending";
        };
        const status = getYesterdayLatestStatus(c);
        const reason = String(entryObj.reason || "").trim().toLowerCase();
        return status === "Checked" && reason === activeRemarkTab.toLowerCase();
      });
    }

    return list.length;
  }, [customers, activeTab, activeBusinessTab, activeZoneTab, activeRouteTab, activeAgentTab, activeWeekdayTab, activeStatusTab, activeGapTab, agents, activeRemarkTab]);

  const lastWeekActiveCount = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const lastWeekDateStr = getDateStringInTimeZone(d, "Asia/Kolkata");
    return filtered.filter(c => resolveTodayEffectiveStatus(c, lastWeekDateStr) === "ON").length;
  }, [filtered]);

  const customersDiff = filtered.length - yesterdayFilteredCount;
  const activeDiff = filteredActiveCount - lastWeekActiveCount;

  // ─── Weekday name for display ──────────────────────────────────────────────
  const weekdayName = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday",
  ][new Date().getDay()];

  // ─── Total Peak Potential: persistent best for the current tab ─────────
  const totalPeakPotential = useMemo(() => {
    if (activeRouteTab !== "ALL") {
      return Number(categoryPeaks[`ROUTE_${activeRouteTab.toUpperCase()}`]) || 0;
    }

    if (activeZoneTab !== "ALL") {
      return Number(categoryPeaks[`ZONE_${activeZoneTab.toUpperCase()}`]) || 0;
    }

    if (activeBusinessTab !== "ALL") {
      return Number(categoryPeaks[activeBusinessTab.toUpperCase()]) || 0;
    }

    let key = "ALL";
    if (activeTab === "RESIDENTIAL CUSTOMER" || activeTab === "RESIDENTIAL CUSTOMERS") {
      key = "RESIDENTIAL";
    } else if (activeTab === "ONBOARDING") {
      key = "ONBOARDING";
    } else if (activeTab === "CALLING CUSTOMER") {
      key = "CALLING_CUSTOMER";
    } else if (activeTab !== "ALL") {
      key = activeTab; // "D0", "D1", etc.
    }
    return Number(categoryPeaks[key]) || 0;
  }, [categoryPeaks, activeTab, activeBusinessTab, activeZoneTab, activeRouteTab]);

  // ─── Potential Achieved: sum of trays delivered TODAY in current tab ───────
  const potentialAchieved = useMemo(() => {
    return filtered.reduce((sum, c) => {
      const last8Days = c.last8Days || {};
      const entry = last8Days[todayDate];
      if (!entry) return sum;
      const status = (typeof entry === "string" ? entry : entry?.status || "")
        .trim()
        .toLowerCase();
      if (status !== "delivered") return sum;
      const trays =
        entry.traysDelivered ??
        entry.trays ??
        entry.quantity ??
        entry?.deliveredTrays ??
        0;
      const numTrays = Number(trays);
      return sum + (Number.isFinite(numTrays) && numTrays > 0 ? numTrays : 0);
    }, 0);
  }, [filtered, todayDate]);

  // ─── Last Weekday Potential: sum of trays delivered exactly 7 days ago ────
  const lastWeekdayPotential = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const lastWeekDateStr = getDateStringInTimeZone(d, "Asia/Kolkata");

    return filtered.reduce((sum, c) => {
      const last8Days = c.last8Days || {};
      const entry = last8Days[lastWeekDateStr];
      if (!entry) return sum;
      const status = (typeof entry === "string" ? entry : entry?.status || "")
        .trim()
        .toLowerCase();
      if (status !== "delivered") return sum;
      const trays =
        entry.traysDelivered ??
        entry.trays ??
        entry.quantity ??
        entry?.deliveredTrays ??
        0;
      const numTrays = Number(trays);
      return sum + (Number.isFinite(numTrays) && numTrays > 0 ? numTrays : 0);
    }, 0);
  }, [filtered]);

  // ─── Achievement %: today's trays vs best same-weekday total ──────────────
  const achievementPercentage = useMemo(() => {
    if (totalPeakPotential <= 0) return 0;
    return Math.round((potentialAchieved / totalPeakPotential) * 100);
  }, [potentialAchieved, totalPeakPotential]);

  const lastAchievementPercentage = useMemo(() => {
    if (totalPeakPotential <= 0) return 0;
    return Math.round((lastWeekdayPotential / totalPeakPotential) * 100);
  }, [lastWeekdayPotential, totalPeakPotential]);

  const wowPercentage = useMemo(() => {
    if (lastWeekdayPotential === 0) return potentialAchieved > 0 ? 100 : 0;
    return (((potentialAchieved - lastWeekdayPotential) / lastWeekdayPotential) * 100).toFixed(2);
  }, [potentialAchieved, lastWeekdayPotential]);

  // ─── Toggle delivery (optimistically adjusts totalActive) ─────────────────
  const toggleTodayDelivery = async (customer) => {
    if (!customer?.id || updatingTodayId === customer.id) return;

    // ⭐ PROTECTION: Refuse toggle if delivery/check already completed
    const last8Days = customer.last8Days || {};
    const todayEntry = last8Days[todayDate];

    const todayStatus = String(
      typeof todayEntry === "string" ? todayEntry : todayEntry?.status || "",
    )
      .trim()
      .toLowerCase();

    const completedStatuses = [
      "delivered",
      "checked",
      "reached",
      "price_mismatch",
      "stock_available",
      "other_vendor",
      "shop_closed",
      "confirmed_tomorrow",
    ];

    if (completedStatuses.includes(todayStatus)) {
      return; // Silently refuse - toggle is locked
    }

    const current = getTodayEffectiveStatus(customer);
    const nextStatus = current === "ON" ? "OFF" : "ON";
    const previousOverride = customer.todayOverride;
    const optimisticOverride = {
      date: todayDate,
      status: nextStatus,
      type: "MANUAL",
    };

    // Optimistic UI: row update
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
        patchCachedUserInfoCustomer(customer.id, (row) => ({
          ...row,
          todayOverride: saved,
        }));
        setCustomers((prev) =>
          prev.map((row) =>
            row.id === customer.id ? { ...row, todayOverride: saved } : row,
          ),
        );
      }
    } catch (err) {
      console.error("Today delivery toggle error:", err);
      // Revert row
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

  const updateWeeklySchedule = async (customer, day) => {
    if (!customer?.id || updatingScheduleId === customer.id) return;

    const current = customer.weeklySchedule || {
      mon: true,
      tue: true,
      wed: true,
      thu: true,
      fri: true,
      sat: true,
      sun: true,
    };

    const updated = {
      ...current,
      [day]: !current[day],
    };

    const previousSchedule = customer.weeklySchedule;

    setCustomers((prev) =>
      prev.map((c) =>
        c.id === customer.id ? { ...c, weeklySchedule: updated } : c,
      ),
    );

    try {
      setUpdatingScheduleId(customer.id);
      const res = await axios.post(`${ADMIN_PATH}/customer/weekly-schedule`, {
        id: customer.id,
        weeklySchedule: updated,
      });
      const saved = res?.data?.weeklySchedule;
      if (saved && typeof saved === "object") {
        patchCachedUserInfoCustomer(customer.id, (row) => ({
          ...row,
          weeklySchedule: saved,
        }));
        setCustomers((prev) =>
          prev.map((row) =>
            row.id === customer.id ? { ...row, weeklySchedule: saved } : row,
          ),
        );
      }
    } catch (err) {
      console.error("Weekly schedule update error:", err);
      setCustomers((prev) =>
        prev.map((row) =>
          row.id === customer.id
            ? { ...row, weeklySchedule: previousSchedule }
            : row,
        ),
      );
    } finally {
      setUpdatingScheduleId(null);
    }
  };

  const handleResetCustomer = async (customer) => {
    if (!customer?.id || resettingCustomerId === customer.id) return;

    const status = getLatestStatus(customer);
    if (status === "Delivered") {
      alert("Delivered status cannot be reset.");
      return;
    }
    if (status !== "Checked") {
      alert("Only checked customers can be reset to pending.");
      return;
    }

    const customerName = getName(customer) || "Customer";
    const confirmed = window.confirm(
      `Reset ${customerName} to pending for today?`,
    );
    if (!confirmed) return;

    try {
      setResettingCustomerId(customer.id);
      const res = await axios.post(`${ADMIN_PATH}/customer-retention/reset`, {
        customerId: customer.id,
        date: todayDate,
      });

      if (res.status === 200 || res.data?.message) {
        // Optimistically update customer in state
        setCustomers((prev) =>
          prev.map((c) => {
            if (c.id !== customer.id) return c;
            const updatedLast8Days = { ...(c.last8Days || {}) };
            delete updatedLast8Days[todayDate];
            return {
              ...c,
              last8Days: updatedLast8Days,
            };
          }),
        );

        // Also update client cache
        patchCachedUserInfoCustomer(customer.id, (row) => {
          const updatedLast8Days = { ...(row.last8Days || {}) };
          delete updatedLast8Days[todayDate];
          return {
            ...row,
            last8Days: updatedLast8Days,
          };
        });

        alert("Customer reset to pending successfully!");
      }
    } catch (err) {
      console.error("Reset error:", err);
      const errorMsg =
        err?.response?.data?.message ||
        err?.message ||
        "Reset failed. Please try again.";
      alert(errorMsg);
    } finally {
      setResettingCustomerId("");
    }
  };

  // ─── Excel ────────────────────────────────────────────────────────────────
  const downloadExcel = () => {
    if (!canDownloadExcel) return;
    const data = filtered.map((c) => {
      const baseData = {
        "Customer ID": c.custid || c.id,
        Name: getName(c),
        Zone: c.zone || "",
        Route: c.route || c.routeName || c.route_name || c.Route || "",
        Peak_Potential: normalizePotential(c.potential),
        Peak_Frequency: getPeakFrequencyLabel(c),
        "Frequency Gap": getFrequencyGapLabel(c),
        Risk_Factor: getRiskFactorLabel(c),
        Delivery_Gap: normalizeDeliveryGap(c.deliveryGap),
      };
      // Add Current_Category for ALL, RESIDENTIAL CUSTOMER, ONBOARDING, CALLING CUSTOMER tabs
      if (activeTab === "ALL" || activeTab === "RESIDENTIAL CUSTOMER" || activeTab === "RESIDENTIAL CUSTOMERS" || activeTab === "ONBOARDING" || activeTab === "CALLING CUSTOMER") {
        baseData.Current_Category = getCurrentCategory(c);
      }
      baseData["Purchase Cadence"] = resolveCleanPattern(c.purchaseCadence || c.pattern, LOGIC_1_PURCHASE_CADENCE, DEFAULT_LOGIC_1);
      baseData["Customer State"] = resolveCleanPattern(c.customerState, LOGIC_2_CUSTOMER_STATE, DEFAULT_LOGIC_2);
      baseData["Purchase Intent"] = resolveCleanPattern(c.purchaseIntent, LOGIC_3_PURCHASE_INTENT, DEFAULT_LOGIC_3);
      baseData.Status = getLatestStatus(c);
      baseData.Remarks = getRemarkDisplay(c);
      return baseData;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab);
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf]), `${activeTab}.xlsx`);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedCustomers = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
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
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold">
                  {loading ? "…" : filtered.length}
                </p>
                {!loading && (
                  <span className={`inline-flex items-center gap-1 text-sm font-bold whitespace-nowrap ${customersDiff > 0 ? 'text-green-500' : customersDiff < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                    <span>{customersDiff > 0 ? '▲' : customersDiff < 0 ? '▼' : '▬'}</span>
                    <span>{Math.abs(customersDiff)}</span>
                  </span>
                )}
              </div>
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
              <option value="frequencyGap">Frequency Gap</option>
              <option value="riskFactor">Risk Factor</option>
              <option value="deliveryGap">Delivery_Gap</option>
              <option value="currentCategory">Current Category</option>
              <option value="zone">Zone</option>
              <option value="delivery">Delivery Plan </option>
              <option value="status">Status </option>
              <option value="remarks">Remarks </option>
              <option value="weeklySchedule">Weekly Schedule</option>
              <option value="purchaseCadence">Purchase Cadence</option>
              <option value="customerState">Customer State</option>
              <option value="purchaseIntent">Purchase Intent</option>
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
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-green-600">
                {loading ? "…" : filteredActiveCount}
              </p>
              {!loading && (
                <span className={`inline-flex items-center gap-1 text-sm font-bold whitespace-nowrap ${activeDiff > 0 ? 'text-green-500' : activeDiff < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                  <span>{activeDiff > 0 ? '▲' : activeDiff < 0 ? '▼' : '▬'}</span>
                  <span>{Math.abs(activeDiff)}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ⭐ Total Peak Potential & Potential Achieved row */}
      <div className="flex gap-4 mb-4">
        <div className="bg-white px-5 py-3 rounded-xl shadow border-l-4 border-orange-500">
          <p className="text-xs text-gray-500 whitespace-nowrap">
            Best {weekdayName} Potential
          </p>
          <p className="text-xl font-bold text-orange-600">
            {loading ? "…" : `T(${totalPeakPotential})`}
          </p>
        </div>

        <div className="bg-white px-5 py-3 rounded-xl shadow border-l-4 border-purple-500">
          <p className="text-xs text-gray-500 whitespace-nowrap">
            Potential Achieved
          </p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold text-purple-600">
              {loading ? "…" : potentialAchieved}
            </p>
            {!loading && (
              <span className={`inline-flex items-center gap-1 text-sm font-bold whitespace-nowrap ${wowPercentage > 0 ? 'text-green-500' : wowPercentage < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                <span>{wowPercentage > 0 ? '▲' : wowPercentage < 0 ? '▼' : '▬'}</span>
                <span>{Math.abs(wowPercentage)}%</span>
              </span>
            )}
          </div>
          {!loading && totalPeakPotential > 0 && (
            <p
              className="text-xs font-semibold mt-1"
              style={{
                color:
                  achievementPercentage >= 100
                    ? "#0F9D58"
                    : achievementPercentage >= 70
                      ? "#FB8C00"
                      : "#FF3B30",
              }}
            >
              {achievementPercentage}% achieved
            </p>
          )}
        </div>
        <div className="bg-white px-5 py-3 rounded-xl shadow border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 whitespace-nowrap">
            Last {weekdayName} Potential
          </p>
          <p className="text-xl font-bold text-blue-600">
            {loading ? "…" : lastWeekdayPotential}
          </p>
          {!loading && totalPeakPotential > 0 && (
            <p
              className="text-xs font-semibold mt-1"
              style={{
                color:
                  lastAchievementPercentage >= 100
                    ? "#0F9D58"
                    : lastAchievementPercentage >= 70
                      ? "#FB8C00"
                      : "#FF3B30",
              }}
            >
              {lastAchievementPercentage}% achieved
            </p>
          )}
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-4 flex-wrap">
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



      {/* ROUTE FILTERS TABS */}
      {routes && routes.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveRouteTab("ALL")}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeRouteTab === "ALL" ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            ALL ROUTES
          </button>
          <button
            onClick={() => setActiveRouteTab("UNASSIGNED")}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeRouteTab === "UNASSIGNED" ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            UNASSIGNED
          </button>
          {routes.map((r) => {
            const rName = typeof r === "string" ? r : r?.name;
            if (!rName) return null;
            return (
              <button
                key={rName}
                onClick={() => setActiveRouteTab(rName)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeRouteTab === rName ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
              >
                {rName}
              </button>
            );
          })}
        </div>
      )}

      {/* AGENT FILTERS TABS */}
      {agents && agents.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveAgentTab("ALL AGENTS")}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeAgentTab === "ALL AGENTS" ? "bg-pink-600 text-white border-pink-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            ALL AGENTS
          </button>
          <button
            onClick={() => setActiveAgentTab("UNASSIGNED")}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeAgentTab === "UNASSIGNED" ? "bg-pink-600 text-white border-pink-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            UNASSIGNED
          </button>
          {agents.filter(a => a.active !== false).map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveAgentTab(a.id)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeAgentTab === a.id ? "bg-pink-600 text-white border-pink-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
            >
              {a.name || a.display_name || "Unknown Agent"}
            </button>
          ))}
        </div>
      )}

      {/* STATUS FILTERS TABS */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["ALL STATUS", "Pending", "Checked", "Delivered", "Undelivered"].map((status) => (
          <button
            key={status}
            onClick={() => setActiveStatusTab(status)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeStatusTab === status ? "bg-orange-600 text-white border-orange-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-xs text-center border-collapse">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="px-2 py-2 leading-tight">
                <div>Customer</div>
                <div>ID</div>
              </th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Zone</th>
              <th className="px-2 py-2">Route</th>

              <th className="px-2 py-2 leading-tight">
                <div>Delivery</div>
                <div>Plan</div>
              </th>
              <th className="px-2 py-2 leading-tight">
                <div>Weekly</div>
                <div>Schedule</div>
              </th>
              <th className="px-2 py-2 leading-tight">
                <div>Peak</div>
                <div>Potential</div>
              </th>
              <th className="px-2 py-2 leading-tight">
                <div>Peak</div>
                <div>Frequency</div>
              </th>
              <th className="px-2 py-2 leading-tight">
                <div>Frequency</div>
                <div>Gap</div>
              </th>
              <th className="px-2 py-2 leading-tight">
                <div>Risk</div>
                <div>Factor</div>
              </th>
              <th className="px-2 py-2 leading-tight">
                <div>Delivery</div>
                <div>Gap</div>
              </th>
              {(activeTab === "ALL" || activeTab === "RESIDENTIAL CUSTOMER" || activeTab === "RESIDENTIAL CUSTOMERS" || activeTab === "ONBOARDING" || activeTab === "CALLING CUSTOMER") && (
                <th className="px-2 py-2 leading-tight">
                  <div>Current</div>
                  <div>Category</div>
                </th>
              )}
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2 leading-tight">
                <div>Execution</div>
                <div>Calendar</div>
              </th>
              <th className="px-2 py-2">Reset</th>
              <th className="px-2 py-2 leading-tight">
                <div>Delivery</div>
                <div>Agent</div>
              </th>
            </tr>
          </thead>

          <tbody>
            {paginatedCustomers.map((c) => (
              <tr key={c.id} className={`border-t ${calendarCustomer?.id === c.id ? 'relative z-50' : ''}`}>
                <td className="px-2 py-3 font-medium">{c.custid || c.id}</td>
                <td className="px-2 py-3 font-medium">{getName(c)}</td>
                <td
                  className="px-2 py-3 font-medium text-gray-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!c.zone || c.zone === "UNASSIGNED" ? (
                    <select
                      disabled={assigningZoneId === c.id}
                      onChange={(e) => assignZone(c.id, e.target.value)}
                      className="border rounded px-2 py-1 w-32 text-xs bg-white text-gray-900"
                    >
                      <option value="">Assign Zone</option>
                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  ) : editingZoneId === c.id ? (
                    <select
                      autoFocus
                      defaultValue={c.zone}
                      onBlur={() => setEditingZoneId(null)}
                      onChange={async (e) => {
                        await assignZone(c.id, e.target.value);
                        setEditingZoneId(null);
                      }}
                      className="border rounded px-2 py-1 w-32 text-xs bg-white text-gray-900"
                    >
                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <span>{c.zone}</span>
                      <button
                        onClick={() => setEditingZoneId(c.id)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <FiEdit2 />
                      </button>
                    </div>
                  )}
                </td>
                <td
                  className="px-2 py-3 font-medium text-gray-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!c.route || c.route === "UNASSIGNED" ? (
                    <select
                      disabled={assigningRouteId === c.id}
                      onChange={(e) => assignRoute(c.id, e.target.value)}
                      className="border rounded px-2 py-1 w-32 text-xs bg-white text-gray-900"
                    >
                      <option value="">Assign</option>
                      {routes.map((r) => {
                        const rName = typeof r === "string" ? r : r?.name;
                        if (!rName) return null;
                        return (
                          <option key={rName} value={rName}>
                            {rName}
                          </option>
                        );
                      })}
                    </select>
                  ) : editingRouteId === c.id ? (
                    <select
                      autoFocus
                      defaultValue={c.route}
                      onBlur={() => setEditingRouteId(null)}
                      onChange={async (e) => {
                        await assignRoute(c.id, e.target.value);
                        setEditingRouteId(null);
                      }}
                      className="border rounded px-2 py-1 w-32 text-xs bg-white text-gray-900"
                    >
                      {routes.map((r) => {
                        const rName = typeof r === "string" ? r : r?.name;
                        if (!rName) return null;
                        return (
                          <option key={rName} value={rName}>
                            {rName}
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <span>{c.route}</span>
                      <button
                        onClick={() => setEditingRouteId(c.id)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <FiEdit2 />
                      </button>
                    </div>
                  )}
                </td>

                <td className="px-2 py-3">
                  {(() => {
                    const effective = getTodayEffectiveStatus(c);
                    const isOn = effective === "ON";
                    const isUpdating = updatingTodayId === c.id;

                    // Detect today's delivery/check status
                    const last8Days = c.last8Days || {};
                    const todayEntry = last8Days[todayDate];
                    const todayStatus = String(
                      typeof todayEntry === "string"
                        ? todayEntry
                        : todayEntry?.status || "",
                    )
                      .trim()
                      .toLowerCase();

                    const completedStatuses = [
                      "delivered",
                      "checked",
                      "reached",
                      "price_mismatch",
                      "stock_available",
                      "other_vendor",
                      "shop_closed",
                      "confirmed_tomorrow",
                    ];

                    const isCompleted = completedStatuses.includes(todayStatus);

                    const isLocked = isCompleted;

                    return (
                      <label
                        className={`relative inline-flex items-center ${isUpdating || isLocked
                          ? "opacity-50 cursor-not-allowed"
                          : "cursor-pointer"
                          }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={isOn}
                          disabled={isUpdating || isLocked}
                          onChange={() => toggleTodayDelivery(c)}
                          aria-label={isOn ? "Today: ON" : "Today: OFF"}
                        />
                        <div className="w-12 h-6 bg-gray-300 rounded-full peer peer-checked:bg-green-600 transition-colors" />
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-6" />
                      </label>
                    );
                  })()}
                </td>

                <td className="px-2 py-3">
                  {(() => {
                    const isOpen = openScheduleId === c.id;
                    const isUpdating = updatingScheduleId === c.id;
                    const schedule = c.weeklySchedule || {
                      sun: true,
                      mon: true,
                      tue: true,
                      wed: true,
                      thu: true,
                      fri: true,
                      sat: true,
                    };
                    const days = [
                      "sun",
                      "mon",
                      "tue",
                      "wed",
                      "thu",
                      "fri",
                      "sat",
                    ];
                    const labels = {
                      sun: "SUN",
                      mon: "MON",
                      tue: "TUE",
                      wed: "WED",
                      thu: "THU",
                      fri: "FRI",
                      sat: "SAT",
                    };
                    const activeDaysCount =
                      Object.values(schedule).filter(Boolean).length;
                    return (
                      <div className="relative inline-block">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenScheduleId(isOpen ? null : c.id);
                          }}
                          className="px-3 py-1 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 transition whitespace-nowrap"
                          disabled={isUpdating}
                        >
                          {activeDaysCount} Days {isOpen ? "▲" : "▼"}
                        </button>
                        {isOpen && (
                          <div
                            className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 p-2 min-w-[120px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {days.map((day) => (
                              <button
                                key={day}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateWeeklySchedule(c, day);
                                }}
                                disabled={isUpdating}
                                className={`block w-full text-left px-3 py-1 rounded mb-1 last:mb-0 font-medium text-sm transition ${schedule[day]
                                  ? "bg-green-500 text-white border border-green-600"
                                  : "bg-red-500 text-white border border-red-600"
                                  } ${isUpdating
                                    ? "opacity-50 cursor-not-allowed"
                                    : "cursor-pointer hover:opacity-90"
                                  }`}
                              >
                                {labels[day]}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </td>

                <td className="px-2 py-3">
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: getPotentialColor(c.potential) }}
                  >
                    {normalizePotential(c.potential)}
                  </span>
                </td>

                <td className="px-2 py-3">
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: getPeakFrequencyColor(c) }}
                  >
                    {getPeakFrequencyLabel(c)}
                  </span>
                </td>

                <td className="px-2 py-3">
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: getFrequencyGapColor(c) }}
                  >
                    {getFrequencyGapLabel(c)}
                  </span>
                </td>

                <td className="px-2 py-3">
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: getRiskFactorColor(c) }}
                  >
                    {getRiskFactorLabel(c)}
                  </span>
                </td>

                <td className="px-2 py-3">
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
                    style={{
                      backgroundColor: getDeliveryGapColor(c.deliveryGap),
                    }}
                  >
                    {normalizeDeliveryGap(c.deliveryGap)}
                  </span>
                </td>

                {(activeTab === "ALL" || activeTab === "RESIDENTIAL CUSTOMER" || activeTab === "RESIDENTIAL CUSTOMERS" || activeTab === "ONBOARDING" || activeTab === "CALLING CUSTOMER") && (
                  <td className="px-2 py-3">
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
                      style={{
                        backgroundColor: getCurrentCategoryColor(
                          getCurrentCategory(c),
                        ),
                      }}
                    >
                      {getCurrentCategory(c)}
                    </span>
                  </td>
                )}

                <td className="px-2 py-3">
                  {(() => {
                    const agentName = getDeliveredOrCheckedAgentName(c);
                    return (
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(getLatestStatus(c))}`}
                          title={agentName ? `Marked by: ${agentName}` : undefined}
                        >
                          {getLatestStatus(c)}
                        </span>
                        <span
                          className="text-[10px] text-gray-500 font-medium"
                          title={agentName ? `Marked by: ${agentName}` : undefined}
                        >
                          {getRemarkDisplay(c)}
                        </span>
                      </div>
                    );
                  })()}
                </td>
                <td className="px-2 py-3">
                  <div className="relative inline-block">
                    <div
                      className="flex justify-center items-center cursor-pointer hover:bg-gray-100 p-2 rounded-full transition-colors w-min mx-auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCalendarCustomer(calendarCustomer?.id === c.id ? null : c);
                      }}
                      title="Click to view full calendar"
                    >
                      <FiCalendar className="w-5 h-5 text-blue-600" />
                    </div>
                    {calendarCustomer?.id === c.id && (
                      <ExecutionCalendarModal
                        customer={c}
                        onClose={() => setCalendarCustomer(null)}
                      />
                    )}
                  </div>
                </td>
                <td className="px-2 py-3">
                  {(() => {
                    const status = getLatestStatus(c);
                    const isChecked = status === "Checked";
                    const isDelivered = status === "Delivered";
                    const isResetting = resettingCustomerId === c.id;

                    return (
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResetCustomer(c);
                          }}
                          disabled={!isChecked || isResetting}
                          className={`rounded-full text-[10px] leading-3 font-semibold flex items-center justify-center text-center px-2 py-1 min-w-[32px] h-[24px] shrink-0 transition ${
                            isChecked
                              ? "bg-[#FF3B30] text-white shadow hover:opacity-90 cursor-pointer"
                              : isDelivered
                              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                              : "bg-gray-100 text-gray-300 cursor-not-allowed"
                          } disabled:opacity-50`}
                          title={
                            isDelivered
                              ? "Delivered status cannot be reset"
                              : isChecked
                              ? "Reset to pending"
                              : "Already pending"
                          }
                        >
                          {isResetting ? ".." : "R"}
                        </button>
                      </div>
                    );
                  })()}
                </td>
                {/* Delivery Agent Column at the End (Initials only with collision resolution, empty for pending) */}
                <td className="px-2 py-3 text-center align-middle">
                  {(() => {
                    const agentName = getDeliveredOrCheckedAgentName(c);
                    const initials = agentName ? getAgentInitials(agentName, agentInitialsMap) : "";

                    if (!initials) return null;

                    return (
                      <div
                        className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px] mx-auto shadow-xs"
                        title={agentName}
                      >
                        {initials}
                      </div>
                    );
                  })()}
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
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
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

