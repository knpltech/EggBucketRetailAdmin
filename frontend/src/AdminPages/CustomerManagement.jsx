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
import { getTodayEffectiveStatus as resolveTodayEffectiveStatus } from "../utils/aiSuggestionEngine";
import ExecutionCalendarModal from "../components/ExecutionCalendarModal";

// TABS
const TABS = [
  "ALL",
  "PRIME CUSTOMER",
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

// ─── Prime Customer Helpers ───────────────────────────────────────────────
/**
 * Compute Peak_Potential numeric value from last8Days
 * Returns the maximum number of trays delivered (0 if no deliveries)
 */
function computePeakPotentialNumber(last8Days = {}) {
  if (!last8Days || typeof last8Days !== "object") return 0;

  let maxTrays = 0;
  Object.values(last8Days).forEach((entry) => {
    if (!entry) return;

    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || "",
    )
      .trim()
      .toLowerCase();

    if (status !== "delivered") return;

    const trays =
      entry.traysDelivered ??
      entry.trays ??
      entry.quantity ??
      entry?.deliveredTrays ??
      0;
    const numTrays = Number(trays);

    if (Number.isFinite(numTrays) && numTrays > maxTrays) {
      maxTrays = numTrays;
    }
  });

  return maxTrays;
}

/**
 * Determine Prime Customer type based on Peak_Potential
 * Prime Customer: Peak_Potential >= T10 (i.e., >= 10 trays)
 * Regular Customer: Peak_Potential < T10 (i.e., < 10 trays)
 */
function getPrimeCustomerType(peakPotentialNumber = 0) {
  const num = Number(peakPotentialNumber);
  if (!Number.isFinite(num)) return "REGULAR";
  return num >= 10 ? "PRIME" : "REGULAR";
}

/**
 * Sync Prime Customer status for a single customer
 * Calculates Peak_Potential, determines if PRIME or REGULAR, and compares with stored value
 * Returns: { customerType, needsUpdate, peakPotential }
 */
function syncPrimeCustomer(customer = {}) {
  if (!customer || typeof customer !== "object") {
    return { customerType: "REGULAR", needsUpdate: false };
  }

  const peakPotential = computePeakPotentialNumber(customer.last8Days);
  const calculatedType = getPrimeCustomerType(peakPotential);

  const storedType = String(customer.customerType || "").trim().toUpperCase();
  const normalizedStoredType =
    storedType === "PRIME" || storedType === "REGULAR" ? storedType : null;

  const needsUpdate =
    normalizedStoredType === null || normalizedStoredType !== calculatedType;

  return {
    customerType: calculatedType,
    needsUpdate,
    peakPotential,
  };
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
  const [activeRouteTab, setActiveRouteTab] = useState("ALL");
  const [activeWeekdayTab, setActiveWeekdayTab] = useState("ALL CUSTOMERS");
  const [activeStatusTab, setActiveStatusTab] = useState("ALL STATUS");
  const [zones, setZones] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [sortBy, setSortBy] = useState("name");
  const [updatingTodayId, setUpdatingTodayId] = useState(null);
  const [updatingScheduleId, setUpdatingScheduleId] = useState(null);
  const [openScheduleId, setOpenScheduleId] = useState(null);
  const [calendarCustomer, setCalendarCustomer] = useState(null);

  const [assigningRouteId, setAssigningRouteId] = useState(null);
  const [editingRouteId, setEditingRouteId] = useState(null);

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
      peakFrequency: computePeakFrequency(c.last8Days),
      potential: computePotential(c.last8Days),
      deliveryGap: computeDeliveryGap(c.last8Days, todayDate),
    }));

  // ─── Helper: Sync Prime Customer status for all customers ─────────────────
  const syncAllPrimeCustomers = async (customersList) => {
    // Sync Prime Customer status in batch for better performance
    // This avoids making individual API calls for each customer
    const customersToUpdate = customersList
      .map((customer) => {
        const syncResult = syncPrimeCustomer(customer);
        if (syncResult.needsUpdate) {
          return {
            id: customer.id,
            customerType: syncResult.customerType,
          };
        }
        return null;
      })
      .filter(Boolean);

    // Update Firestore for all customers that need syncing
    // Using batch updates to minimize API calls
    if (customersToUpdate.length > 0) {
      // Batch updates: group in chunks of 50 to avoid timeout
      for (let i = 0; i < customersToUpdate.length; i += 50) {
        const batch = customersToUpdate.slice(i, i + 50);
        try {
          await Promise.all(
            batch.map((update) =>
              axios.post(`${ADMIN_PATH}/customer/status`, {
                id: update.id,
                customerType: update.customerType,
              })
            )
          );
          // Update local state with synced customerType
          setCustomers((prev) =>
            prev.map((c) => {
              const update = customersToUpdate.find((u) => u.id === c.id);
              return update ? { ...c, customerType: update.customerType } : c;
            })
          );
        } catch (err) {
          console.error("Error syncing Prime Customer status:", err);
        }
      }
    }
  };

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

        // Sync Prime Customer status for all customers
        // This ensures Firestore is kept in sync with Peak_Potential
        await syncAllPrimeCustomers(normalizedRows);

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
          setRoutes(routesRes.data || []);
        } catch (err) {
          console.error("Error fetching routes:", err);
        }

        // Fetch business types dynamically
        try {
          const btRes = await axios.get(`${ADMIN_PATH}/business-types`);
          setBusinessTypes(btRes.data || []);
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
  }, [activeTab, activeBusinessTab, activeZoneTab, activeRouteTab, activeWeekdayTab, activeStatusTab, sortBy]);

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

  // ─── Filter + Sort (on loaded data) ───────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...customers];
    if (activeTab === "PRIME CUSTOMER") {
      // Filter by calculated Peak Potential >= 10 from last8Days
      list = list.filter((c) => {
        const peakPotential = computePeakPotentialNumber(c.last8Days);
        return peakPotential >= 10;
      });
    } else if (activeTab === "ONBOARDING") {
      list = list.filter(
        (c) =>
          !c.zone ||
          c.zone === "" ||
          c.zone === null ||
          c.zone === "UNASSIGNED",
      );
    } else if (/^D[0-7]$/.test(activeTab)) {
      const targetDays = Number(activeTab.slice(1));
      list = list.filter((c) => getDeliveredCount(c) === targetDays);
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
      list = list.filter((c) => getLatestStatus(c).toLowerCase() === activeStatusTab.toLowerCase());
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
    } else {
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return list;
  }, [customers, activeTab, activeBusinessTab, activeZoneTab, activeRouteTab, activeWeekdayTab, activeStatusTab, sortBy, todayDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredActiveCount = useMemo(() => {
    return filtered.filter((c) => getTodayEffectiveStatus(c) === "ON").length;
  }, [filtered, todayDate]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (activeTab === "PRIME CUSTOMER") {
      key = "PRIME";
    } else if (activeTab === "ONBOARDING") {
      key = "ONBOARDING";
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

  // ─── Achievement %: today's trays vs best same-weekday total ──────────────
  const achievementPercentage = useMemo(() => {
    if (totalPeakPotential <= 0) return 0;
    return Math.round((potentialAchieved / totalPeakPotential) * 100);
  }, [potentialAchieved, totalPeakPotential]);

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

  // ─── Excel ────────────────────────────────────────────────────────────────
  const downloadExcel = () => {
    if (!canDownloadExcel) return;
    const data = filtered.map((c) => {
      const baseData = {
        "Customer ID": c.custid || c.id,
        Name: getName(c),
        Zone: c.zone || "",
        Peak_Potential: normalizePotential(c.potential),
        Peak_Frequency: getPeakFrequencyLabel(c),
        Delivery_Gap: normalizeDeliveryGap(c.deliveryGap),
      };
      // Add Current_Category for ALL, PRIME CUSTOMER and ONBOARDING tabs
      if (activeTab === "ALL" || activeTab === "PRIME CUSTOMER" || activeTab === "ONBOARDING") {
        baseData.Current_Category = getCurrentCategory(c);
      }
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
              <option value="weeklySchedule">Weekly Schedule</option>
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
          <p className="text-xl font-bold text-purple-600">
            {loading ? "…" : potentialAchieved}
          </p>
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

      {/* BUSINESS CATEGORIES TABS */}
      {businessTypes && businessTypes.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setActiveBusinessTab("ALL")}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeBusinessTab === "ALL" ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            ALL CATEGORIES
          </button>
          <button
            onClick={() => setActiveBusinessTab("UNASSIGNED")}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeBusinessTab === "UNASSIGNED" ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            UNASSIGNED
          </button>
          {businessTypes.map((t) => (
            <button
              key={t}
              onClick={() => setActiveBusinessTab(t)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeBusinessTab === t ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* ZONE FILTERS TABS */}
      {zones && zones.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveZoneTab("ALL")}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeZoneTab === "ALL" ? "bg-teal-600 text-white border-teal-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            ALL ZONES
          </button>
          <button
            onClick={() => setActiveZoneTab("UNASSIGNED")}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeZoneTab === "UNASSIGNED" ? "bg-teal-600 text-white border-teal-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            UNASSIGNED
          </button>
          {zones.map((z) => (
            <button
              key={z}
              onClick={() => setActiveZoneTab(z)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeZoneTab === z ? "bg-teal-600 text-white border-teal-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
            >
              {z}
            </button>
          ))}
        </div>
      )}

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
          {routes.map((r) => (
            <button
              key={r}
              onClick={() => setActiveRouteTab(r)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeRouteTab === r ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* WEEKDAY FILTERS TABS */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["ALL CUSTOMERS", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => (
          <button
            key={day}
            onClick={() => setActiveWeekdayTab(day)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${activeWeekdayTab === day ? "bg-purple-600 text-white border-purple-600 shadow-sm" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
          >
            {day}
          </button>
        ))}
      </div>

      {/* STATUS FILTERS TABS */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["ALL STATUS", "Pending", "Checked", "Delivered"].map((status) => (
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
              <th className="px-2 py-3">Customer ID</th>
              <th className="px-2 py-3">Name</th>
              <th className="px-2 py-3">Zone</th>
              <th className="px-2 py-3">Route</th>

              <th className="px-2 py-3">Delivery Plan</th>
              <th className="px-2 py-3">Weekly Schedule</th>
              <th className="px-2 py-3">Peak_Potential</th>
              <th className="px-2 py-3">Peak_Frequency</th>
              <th className="px-2 py-3">Delivery_Gap</th>
              {(activeTab === "ALL" || activeTab === "PRIME CUSTOMER" || activeTab === "ONBOARDING") && (
                <th className="px-2 py-3">Current Category</th>
              )}
              <th className="px-2 py-3">Status</th>
              <th className="px-2 py-3 whitespace-nowrap">Execution Calendar</th>
            </tr>
          </thead>

          <tbody>
            {paginatedCustomers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-2 py-3 font-medium">{c.custid || c.id}</td>
                <td className="px-2 py-3 font-medium">{getName(c)}</td>
                <td className="px-2 py-3 font-medium text-gray-700">
                  {c.zone || "UNASSIGNED"}
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
                      {routes.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
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
                      {routes.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
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
                      mon: true,
                      tue: true,
                      wed: true,
                      thu: true,
                      fri: true,
                      sat: true,
                      sun: true,
                    };
                    const days = [
                      "mon",
                      "tue",
                      "wed",
                      "thu",
                      "fri",
                      "sat",
                      "sun",
                    ];
                    const labels = {
                      mon: "MON",
                      tue: "TUE",
                      wed: "WED",
                      thu: "THU",
                      fri: "FRI",
                      sat: "SAT",
                      sun: "SUN",
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
                    style={{
                      backgroundColor: getDeliveryGapColor(c.deliveryGap),
                    }}
                  >
                    {normalizeDeliveryGap(c.deliveryGap)}
                  </span>
                </td>

                {(activeTab === "ALL" || activeTab === "PRIME CUSTOMER" || activeTab === "ONBOARDING") && (
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
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(getLatestStatus(c))}`}
                    >
                      {getLatestStatus(c)}
                    </span>
                    <span className="text-[10px] text-gray-500 font-medium">
                      {getRemarkDisplay(c)}
                    </span>
                  </div>
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

    if (
      latestDeliveredDayNumber === null ||
      dayNumber > latestDeliveredDayNumber
    ) {
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
      typeof entry === "string" ? entry : entry?.status || entry?.type || "",
    )
      .trim()
      .toLowerCase();

    if (status !== "delivered") return;

    const trays =
      entry.traysDelivered ??
      entry.trays ??
      entry.quantity ??
      entry?.deliveredTrays ??
      0;
    const numTrays = Number(trays);

    if (Number.isFinite(numTrays) && numTrays > maxTrays) {
      maxTrays = numTrays;
    }
  });

  return maxTrays > 0 ? `T${maxTrays}` : "T1";
}

function getCurrentCategory(customer) {
  return `D${getDeliveredCountForCustomer(customer)}`;
}

function getCurrentCategoryColor(category) {
  const match = String(category || "").match(/^D(\d+)$/);
  if (!match) return "#FF3B30";

  const num = Number(match[1]);
  if (!Number.isFinite(num)) return "#FF3B30";

  if (num <= 2) return "#FF3B30"; // red: D0-D2
  if (num <= 4) return "#FB8C00"; // orange: D3-D4
  return "#0F9D58"; // green: D5-D7
}
