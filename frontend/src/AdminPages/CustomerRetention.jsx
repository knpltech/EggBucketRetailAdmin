import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { ADMIN_PATH } from "../constant";

const CATEGORY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "stock_available", label: "Stock Available" },
  { value: "shop_closed", label: "Shop Closed" },
  { value: "other_vendor", label: "Other Vendor" },
];
const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "zone", label: "Zone" },
  { value: "deliveryTime", label: "Delivery Time" },
  { value: "deliveryAgent", label: "Delivery Agent" },
];
const CHECKED_TYPES = [
  "reached",
  "price_mismatch",
  "shop_closed",
  "stock_available",
  "other_vendor",
];
const ROWS_PER_PAGE = 25;
const RETENTION_CACHE_TTL_MS = 60 * 60 * 1000; // 1 HOUR - super aggressive caching to minimize API calls

const getTodayDate = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day
    ? `${year}-${month}-${day}`
    : new Date().toISOString().slice(0, 10);
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getPastThreeDatesPlusToday = (dateString) => {
  const endDate = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(endDate.getTime())) return [];

  return [3, 2, 1, 0].map((offset) => {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - offset);
    return formatDateKey(date);
  });
};

const getDatesInRange = (startDate, endDate) => {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const formatDayHeader = (dateString) => {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { day: "-", date: dateString };

  return {
    day: date.toLocaleDateString("en-IN", { weekday: "short" }),
    date: date.toLocaleDateString("en-IN", {
      month: "short",
      day: "2-digit",
    }),
  };
};

const getStatusClasses = (statusKey) => {
  if (statusKey === "delivered") {
    return "bg-[#0F9D58] text-white";
  }
  if (statusKey === "checked") {
    return "bg-[#FB8C00] text-white";
  }
  return "bg-[#FF3B30] text-white";
};

const getStatusRemark = (status) => {
  if (status?.key !== "checked") return "";
  const reason = normalizeRetentionRemark(status.reason);
  if (reason) return reason;
  const categoryLabel = normalizeRetentionRemark(status.categoryLabel);
  return categoryLabel || "";
};

const normalizeRetentionRemark = (value = "") => {
  const text = String(value || "").trim();
  if (!text || text === "-") return "";

  const normalized = text
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized === "price mismatch" || normalized === "shop closed") {
    return "Shop Closed";
  }

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatDeliveryTime = (timestamp) => {
  const date = parseTimestamp(timestamp);
  if (!date) return "-";
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const getStatusText = (status) => {
  if (!status) return "Pending";
  const remark = getStatusRemark(status);
  return remark ? `${status.label} - ${remark}` : status.label;
};

const parseTimestamp = (value) => {
  if (!value) return null;

  if (value instanceof Date) return value;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  if (typeof value === "number") {
    // Treat 10-digit numbers as seconds, otherwise milliseconds.
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Handle raw Firestore Timestamp object that lost its prototype
  if (value && typeof value === "object" && value._seconds !== undefined) {
    const date = new Date(value._seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

const getStatusFromDelivery = (delivery) => {
  if (!delivery) {
    return {
      key: "pending",
      label: "Pending",
      category: "",
      categoryLabel: "",
      reason: "",
    };
  }

  // If the backend already processed this into a status object, use it directly
  if (delivery.key) {
    return delivery;
  }

  const apiStatus = String(delivery.status || "")
    .trim()
    .toLowerCase();
  const type = String(delivery.type || "")
    .trim()
    .toLowerCase();
  const reason = String(delivery.checkReason || delivery.reason || "")
    .trim();
  const normalizedReason = reason.toLowerCase().replace(/\s+/g, "_");
  const checkedCategories = [
    "stock_available",
    "shop_closed",
    "other_vendor",
  ];
  const normalizedType = type === "price_mismatch" ? "shop_closed" : type;
  const normalizedReasonLabel = normalizedReason === "price_mismatch" ? "shop_closed" : normalizedReason;
  const category = checkedCategories.includes(normalizedType)
    ? normalizedType
    : checkedCategories.includes(normalizedReasonLabel)
      ? normalizedReasonLabel
      : "";
  const categoryLabel =
    category === "stock_available"
      ? "Stock Available"
      : category === "shop_closed"
        ? "Shop Closed"
        : category === "other_vendor"
          ? "Other Vendor"
          : "";

  if (apiStatus === "delivered" || type === "delivered") {
    return {
      key: "delivered",
      label: "Delivered",
      category: "",
      categoryLabel: "",
      reason: "",
    };
  }

  if (apiStatus === "checked" || CHECKED_TYPES.includes(type) || category) {
    return {
      key: "checked",
      label: "Checked",
      category,
      categoryLabel,
      reason: reason || categoryLabel,
    };
  }

  return {
    key: "pending",
    label: "Pending",
    category: "",
    categoryLabel: "",
    reason: "",
  };
};

const CustomerRow = React.memo(({ customer, dates, onReset, resettingId }) => {
  return (
    <tr className="border-t hover:bg-slate-50">
      <td className="px-2 py-2 font-semibold text-slate-900 text-xs">{customer.name}</td>
      <td className="px-2 py-2 text-slate-700 text-xs">{customer.phone}</td>
      <td className="px-2 py-2 text-slate-700 text-xs">{customer.zone}</td>
      <td className="px-2 py-2 text-slate-700 text-xs whitespace-nowrap">{formatDeliveryTime(customer.deliveryTime)}</td>
      <td className="px-2 py-2 text-slate-700 text-xs truncate max-w-[80px]">{customer.deliveryAgent}</td>

      {dates.map((date) => {
        const status = customer.days?.[date] || { key: "pending", label: "PENDING" };
        const remark = getStatusRemark(status);
        return (
          <td key={date} className="px-1 py-2 text-center align-middle">
            <div className="flex flex-col items-center justify-start h-[40px]">
              <button
                type="button"
                className={`mx-auto rounded-full text-[9px] leading-3 font-semibold flex items-center justify-center text-center px-1.5 w-[70px] min-h-[24px] shrink-0 ${getStatusClasses(status.key)}`}
                title={status.label}
              >
                {status.label.toUpperCase()}
              </button>
              <div className="h-[14px] mt-0.5 text-[10px] font-medium text-slate-700 leading-tight text-center" title={remark}>
                {remark || ""}
              </div>
            </div>
          </td>
        );
      })}

      <td className="px-2 py-2 text-center align-middle">
        <div className="flex flex-col items-center justify-center h-[40px]">
          <button
            type="button"
            onClick={() => onReset(customer)}
            disabled={resettingId === customer.id}
            className="mx-auto rounded-full text-[9px] leading-3 font-semibold flex items-center justify-center text-center px-1.5 w-[70px] min-h-[24px] shrink-0 bg-[#FF3B30] text-white shadow hover:opacity-90 disabled:opacity-50"
            title="Reset to pending"
          >
            {resettingId === customer.id ? ".." : "R"}
          </button>
        </div>
      </td>
    </tr>
  );
});

const CustomerRetention = () => {
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [deliveryAgentOptions, setDeliveryAgentOptions] = useState([]);
  const [startRange, setStartRange] = useState("");
  const [endRange, setEndRange] = useState("");
  const [dates, setDates] = useState(() => getPastThreeDatesPlusToday(getTodayDate()));
  const [customers, setCustomers] = useState([]);
  const [counts, setCounts] = useState({
    all: 0,
    stock_available: 0,
    shop_closed: 0,
    other_vendor: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resettingId, setResettingId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  // ⭐ CACHE: Store fetched data per key to avoid repeated API calls
  const cacheRef = useRef({});

  // ⭐ OPTIMIZED: Fetch retention data with backend pagination & caching
  const fetchRetentionCustomers = useCallback(
    async ({ date = selectedDate, page = currentPage, category = selectedCategory, sort = sortBy, agent = selectedAgent, showLoader = true } = {}) => {
      const cacheKey = `retention:${date}:${category}:${agent}:${sort}:${page}`;
      const cached = cacheRef.current[cacheKey];

      if (cached && Date.now() - cached.savedAt < RETENTION_CACHE_TTL_MS) {
        setDates(cached.dates || getPastThreeDatesPlusToday(date));
        setCustomers(cached.customers || []);
        setCounts(cached.counts || { all: 0, stock_available: 0, price_mismatch: 0, shop_closed: 0, other_vendor: 0 });
        setDeliveryAgentOptions(cached.deliveryAgentOptions || []);
        setTotalPages(cached.totalPages || 1);
        setTotalCustomers(cached.total || 0);
        setError("");
        setLoading(false);
        return;
      }

      if (showLoader) setLoading(true);

      try {
        const res = await axios.get(`${ADMIN_PATH}/customer-retention`, {
          params: { date, page, limit: ROWS_PER_PAGE, category, sortBy: sort, agent },
        });

        const payload = res?.data || {};
        const nextDates = payload.dates?.length ? payload.dates : getPastThreeDatesPlusToday(date);
        const nextCustomers = Array.isArray(payload.customers)
          ? payload.customers.map((customer) => {
            const dayStatuses = {};
            nextDates.forEach((dateKey) => {
              dayStatuses[dateKey] = getStatusFromDelivery(customer?.days?.[dateKey] || null);
            });
            return {
              ...customer,
              phone: customer.phone || "",
              zone: customer.zone || "UNASSIGNED",
              todayCategory: customer.todayCategory || "",
              todayCategoryLabel: customer.todayCategoryLabel || "-",
              todayReason: customer.todayReason || "",
              deliveryTime: customer.deliveryTime || customer.delivery_time || customer.time || null,
              deliveryAgent: customer.deliveryAgent || "-",
              days: dayStatuses,
            };
          })
          : [];

        const newCounts = {
          all: 0,
          stock_available: 0,
          shop_closed: 0,
          other_vendor: 0,
          ...(payload.counts || {}),
        };
        newCounts.shop_closed =
          payload.counts?.shop_closed ?? payload.counts?.price_mismatch ?? newCounts.shop_closed;
        const newDeliveryAgentOptions = Array.isArray(payload.deliveryAgentOptions)
          ? payload.deliveryAgentOptions
          : [];
        const newTotalPages = payload.totalPages || 1;
        const newTotal = payload.total || 0;

        cacheRef.current[cacheKey] = {
          savedAt: Date.now(),
          dates: nextDates,
          customers: nextCustomers,
          counts: newCounts,
          deliveryAgentOptions: newDeliveryAgentOptions,
          totalPages: newTotalPages,
          total: newTotal,
        };

        setDates(nextDates);
        setCustomers(nextCustomers);
        setCounts(newCounts);
        setDeliveryAgentOptions(newDeliveryAgentOptions);
        setTotalPages(newTotalPages);
        setTotalCustomers(newTotal);
        setError("");
      } catch (err) {
        setError(err?.response?.data?.message || `Unable to load customer retention data for ${date}`);
        setCustomers([]);
        setCounts({ all: 0, stock_available: 0, shop_closed: 0, other_vendor: 0 });
        setDeliveryAgentOptions([]);
        setTotalPages(1);
        setTotalCustomers(0);
        setDates(getPastThreeDatesPlusToday(date));
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [selectedDate, currentPage, selectedCategory, sortBy, selectedAgent],
  );

  // Load data whenever relevant state changes
  useEffect(() => {
    fetchRetentionCustomers({ date: selectedDate, page: currentPage, category: selectedCategory, sort: sortBy, agent: selectedAgent });
  }, [selectedDate, currentPage, selectedCategory, sortBy, selectedAgent, fetchRetentionCustomers]);

  const handleDateChange = (e) => {
    const nextDate = e.target.value;
    setSelectedDate(nextDate);
    setDates(getPastThreeDatesPlusToday(nextDate));
    setCurrentPage(1);
    setSelectedCategory("all");
    setSelectedAgent("all");
  };

  const handleCategoryChange = useCallback((category) => {
    setSelectedCategory(category);
    setCurrentPage(1);
  }, []);

  const handleSortChange = (e) => {
    setSortBy(e.target.value);
    setCurrentPage(1);
  };

  const handleAgentChange = (e) => {
    setSelectedAgent(e.target.value);
    setCurrentPage(1);
  };

  const handleReset = useCallback(
    async (customer) => {
      const confirmed = window.confirm(
        `Reset ${customer.name} to pending for ${selectedDate}?`,
      );
      if (!confirmed) return;

      try {
        setResettingId(customer.id);

        // Verify customer has required ID
        if (!customer.id) {
          throw new Error("Customer ID is missing");
        }

        const resetPayload = {
          customerId: customer.id,
          date: selectedDate,
        };

        console.log("Reset payload:", resetPayload);

        let resetSuccess = false;

        // Try the primary endpoint first
        try {
          const res = await axios.post(
            `${ADMIN_PATH}/customer-retention/reset`,
            resetPayload,
          );
          console.log("Reset response:", res.data);
          resetSuccess = true;
        } catch (primaryError) {
          console.error("Primary endpoint failed:", primaryError);

          // Only try fallback if it's a 404
          if (primaryError?.response?.status === 404) {
            console.log("Trying fallback endpoint...");
            try {
              const res = await axios.post(
                `${ADMIN_PATH}/customer/retention/reset`,
                resetPayload,
              );
              console.log("Fallback reset response:", res.data);
              resetSuccess = true;
            } catch (fallbackError) {
              console.error("Fallback endpoint also failed:", fallbackError);
              throw fallbackError;
            }
          } else {
            throw primaryError;
          }
        }

        if (resetSuccess) {
          // Clear all retention caches to force fresh data on next load
          Object.keys(cacheRef.current).forEach((key) => {
            if (key.startsWith("retention:")) {
              delete cacheRef.current[key];
            }
          });

          // Refetch without loader
          await fetchRetentionCustomers({
            date: selectedDate,
            page: currentPage,
            category: selectedCategory,
            sort: sortBy,
            agent: selectedAgent,
            showLoader: false,
          });

          alert("Customer reset successfully!");
        }
      } catch (err) {
        console.error("Reset error details:", err);
        const errorMessage =
          err?.response?.data?.message ||
          err?.message ||
          "Reset failed. Please try again.";
        alert(errorMessage);
      } finally {
        setResettingId("");
      }
    },
    [selectedDate, currentPage, selectedCategory, sortBy, selectedAgent, fetchRetentionCustomers],
  );

  const downloadRetentionExcel = async () => {
    const exportDates = getDatesInRange(startRange, endRange);
    if (!exportDates.length) {
      alert("Please select a valid start and end date.");
      return;
    }

    try {
      setDownloadingExcel(true);
      const rows = [];

      for (const date of exportDates) {
        let page = 1;
        let pages = 1;

        do {
          const res = await axios.get(`${ADMIN_PATH}/customer-retention`, {
            params: {
              date,
              page,
              limit: 500,
              category: selectedCategory,
              sortBy,
              agent: selectedAgent,
            },
          });
          const payload = res?.data || {};
          const payloadDates = payload.dates?.length
            ? payload.dates
            : getPastThreeDatesPlusToday(date);

          (payload.customers || []).forEach((customer) => {
            const row = {
              Date: date,
              Name: customer.name || "",
              Phone: customer.phone || "",
              Zone: customer.zone || "UNASSIGNED",
              "Delivery Time": formatDeliveryTime(
                customer.deliveryTime || customer.delivery_time || customer.time,
              ),
              "Delivery Agent": customer.deliveryAgent || "-",
            };

            payloadDates.forEach((dateKey) => {
              const label = dateKey === date ? "Today" : dateKey;
              row[label] = getStatusText(
                getStatusFromDelivery(customer?.days?.[dateKey] || null),
              );
            });

            rows.push(row);
          });

          pages = payload.totalPages || 1;
          page += 1;
        } while (page <= pages);
      }

      if (!rows.length) {
        alert("No customer retention data found for the selected range.");
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Customer Retention");
      const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, `customer-retention-${startRange}-to-${endRange}.xlsx`);
    } catch (err) {
      console.error("Retention Excel download failed:", err);
      alert("Unable to download customer retention Excel. Please try again.");
    } finally {
      setDownloadingExcel(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Customer Retention
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Shows 3 past dates plus the selected today date.
          </p>
        </div>
      </div>

      {/* ⭐ OPTIMIZED: Use backend-provided counts directly */}
      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORY_OPTIONS.map((category) => {
          const isActive = selectedCategory === category.value;
          return (
            <button
              key={category.value}
              type="button"
              onClick={() => handleCategoryChange(category.value)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm transition ${isActive
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                }`}
            >
              {category.label} ({counts[category.value] || 0})
            </button>
          );
        })}
      </div>

      <div className="-mx-4 mb-5 overflow-hidden border-y border-slate-200 bg-white px-4 py-4 sm:-mx-6 sm:px-6">
        <div className="grid grid-cols-6 items-end gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="whitespace-nowrap text-xs font-medium text-slate-700">
              Select Delivery Date
            </label>
            <input
              type="date"
              value={selectedDate}
              max={getTodayDate()}
              onChange={handleDateChange}
              className="h-12 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="whitespace-nowrap text-xs font-medium text-slate-700">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={handleSortChange}
              className="h-12 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="whitespace-nowrap text-xs font-medium text-slate-700">
              Delivery Agent
            </label>
            <select
              value={selectedAgent}
              onChange={handleAgentChange}
              className="h-12 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All Delivery Agents</option>
              {deliveryAgentOptions.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="whitespace-nowrap text-xs font-medium text-slate-700">
              Start Date
            </label>
            <input
              type="date"
              value={startRange}
              max={getTodayDate()}
              onChange={(e) => setStartRange(e.target.value)}
              className="h-12 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="whitespace-nowrap text-xs font-medium text-slate-700">
              End Date
            </label>
            <input
              type="date"
              value={endRange}
              max={getTodayDate()}
              onChange={(e) => setEndRange(e.target.value)}
              className="h-12 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <button
            type="button"
            disabled={!startRange || !endRange || downloadingExcel}
            onClick={downloadRetentionExcel}
            className={`h-12 min-w-0 w-full whitespace-nowrap rounded-lg px-3 text-sm font-medium text-white shadow transition ${!startRange || !endRange || downloadingExcel
              ? "cursor-not-allowed bg-slate-400"
              : "bg-blue-600 hover:bg-blue-700"
              }`}
          >
            {downloadingExcel ? "Downloading..." : "Download Excel"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg bg-white shadow">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-100 text-slate-700">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-semibold">Name</th>
              <th className="px-2 py-2 text-left text-xs font-semibold">Phone</th>
              <th className="px-2 py-2 text-left text-xs font-semibold">Zone</th>
              <th className="px-2 py-2 text-left text-xs font-semibold">Delivery Time</th>
              <th className="px-2 py-2 text-left text-xs font-semibold">Delivery Agent</th>
              {dates.map((date, index) => {
                const label = formatDayHeader(date);
                const isTodayColumn = index === dates.length - 1;
                return (
                  <th key={date} className="px-1 py-2 text-center text-xs font-semibold">
                    <div className="font-semibold">
                      {isTodayColumn ? "Today" : label.day}
                    </div>
                    <div className="text-xs text-slate-500">{label.date}</div>
                  </th>
                );
              })}
              <th className="px-2 py-2 text-center text-xs font-semibold">Reset</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5 + dates.length + 1} className="px-4 py-8 text-center text-xs text-slate-500">
                  Loading...
                </td>
              </tr>
            ) : customers.length ? (
              customers.map((customer) => (
                <CustomerRow
                  key={customer.id}
                  customer={customer}
                  dates={dates}
                  onReset={handleReset}
                  resettingId={resettingId}
                />
              ))
            ) : (
              <tr>
                <td colSpan={5 + dates.length + 1} className="px-4 py-8 text-center text-xs text-slate-500">
                  No checked customers found for this date.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* OPTIMIZATION: Pagination controls using backend values */}
      {!loading && totalCustomers > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Showing {(currentPage - 1) * ROWS_PER_PAGE + 1} to{" "}
            {Math.min(currentPage * ROWS_PER_PAGE, totalCustomers)} of{" "}
            {totalCustomers} customers
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Previous
            </button>
            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => {
                  // OPTIMIZATION: Show only nearby pages to avoid too many buttons
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`h-9 w-9 rounded-lg border text-sm font-medium transition ${currentPage === page
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                      >
                        {page}
                      </button>
                    );
                  }
                  if (page === currentPage - 2 || page === currentPage + 2) {
                    return (
                      <span key={page} className="text-slate-400">
                        ...
                      </span>
                    );
                  }
                  return null;
                },
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                setCurrentPage(Math.min(totalPages, currentPage + 1))
              }
              disabled={currentPage === totalPages}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerRetention;
