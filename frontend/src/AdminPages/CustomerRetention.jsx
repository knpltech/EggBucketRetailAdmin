import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import axios from "axios";
import { ADMIN_PATH } from "../constant";

const CATEGORY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "stock_available", label: "Stock Available" },
  { value: "price_mismatch", label: "Price Mismatch" },
  { value: "other_vendor", label: "Other Vendor" },
];
const CHECKED_TYPES = [
  "reached",
  "price_mismatch",
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
    return "bg-emerald-600 text-white";
  }
  if (statusKey === "checked") {
    return "bg-orange-500 text-white";
  }
  return "bg-red-600 text-white";
};

const getStatusRemark = (status) => {
  if (status?.key !== "checked") return "";
  if (status.reason) return status.reason;
  if (status.categoryLabel && status.categoryLabel !== "-") {
    return status.categoryLabel;
  }
  return "";
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
      categoryLabel: "-",
      reason: "",
    };
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
  const category = ["stock_available", "price_mismatch", "other_vendor"].includes(type)
    ? type
    : ["stock_available", "price_mismatch", "other_vendor"].includes(normalizedReason)
      ? normalizedReason
      : "";
  const categoryLabel =
    category === "stock_available"
      ? "Stock Available"
      : category === "price_mismatch"
        ? "Price Mismatch"
        : category === "other_vendor"
          ? "Other Vendor"
          : "-";

  if (apiStatus === "delivered" || type === "delivered") {
    return {
      key: "delivered",
      label: "Delivered",
      category: "",
      categoryLabel: "-",
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
    categoryLabel: "-",
    reason: "",
  };
};

const CustomerRow = React.memo(({ customer, dates, onReset, resettingId }) => {
  // Format delivery time safely
  const formatDeliveryTime = (timestamp) => {
    const date = parseTimestamp(timestamp);
    if (!date) return "-";
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <tr className="border-t hover:bg-slate-50">
      <td className="px-4 py-4 font-semibold text-slate-900">{customer.name}</td>
      <td className="px-4 py-4 text-slate-700">{customer.phone}</td>
      <td className="px-4 py-4 text-slate-700">{customer.zone}</td>
      <td className="px-4 py-4 text-slate-700 text-sm">{formatDeliveryTime(customer.deliveryTime)}</td>
      <td className="px-4 py-4 text-slate-700 text-sm">{customer.deliveryAgent}</td>

      {dates.map((date) => {
        const status = customer.days?.[date] || { key: "pending", label: "PENDING" };
        return (
          <td key={date} className="px-4 py-4 text-center">
            <span
              className={`inline-flex min-w-[112px] items-center justify-center rounded-full px-3 py-2 text-xs font-bold tracking-wide ${getStatusClasses(status.key)}`}
            >
              {status.label}
            </span>
            <div className="mt-2 min-h-[18px] text-sm font-medium text-slate-700">
              {getStatusRemark(status)}
            </div>
          </td>
        );
      })}

      <td className="px-4 py-4 text-center">
        <button
          type="button"
          onClick={() => onReset(customer)}
          disabled={resettingId === customer.id}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold uppercase text-white shadow hover:bg-red-700 disabled:opacity-50"
        >
          {resettingId === customer.id ? "..." : "Reset"}
        </button>
      </td>
    </tr>
  );
});

const CustomerRetention = () => {
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [dates, setDates] = useState(() => getPastThreeDatesPlusToday(getTodayDate()));
  const [customers, setCustomers] = useState([]);
  const [counts, setCounts] = useState({
    all: 0,
    stock_available: 0,
    price_mismatch: 0,
    other_vendor: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resettingId, setResettingId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);

  // ⭐ CACHE: Store fetched data per key to avoid repeated API calls
  const cacheRef = useRef({});

  // ⭐ OPTIMIZED: Fetch retention data with backend pagination & caching
  const fetchRetentionCustomers = useCallback(
    async ({ date = selectedDate, page = currentPage, category = selectedCategory, showLoader = true } = {}) => {
      const cacheKey = `retention:${date}:${category}:${page}`;
      const cached = cacheRef.current[cacheKey];

      if (cached && Date.now() - cached.savedAt < RETENTION_CACHE_TTL_MS) {
        setDates(cached.dates || getPastThreeDatesPlusToday(date));
        setCustomers(cached.customers || []);
        setCounts(cached.counts || { all: 0, stock_available: 0, price_mismatch: 0, other_vendor: 0 });
        setTotalPages(cached.totalPages || 1);
        setTotalCustomers(cached.total || 0);
        setError("");
        setLoading(false);
        return;
      }

      if (showLoader) setLoading(true);

      try {
        const res = await axios.get(`${ADMIN_PATH}/customer-retention`, {
          params: { date, page, limit: ROWS_PER_PAGE, category },
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

        const newCounts = payload.counts || { all: 0, stock_available: 0, price_mismatch: 0, other_vendor: 0 };
        const newTotalPages = payload.totalPages || 1;
        const newTotal = payload.total || 0;

        cacheRef.current[cacheKey] = {
          savedAt: Date.now(),
          dates: nextDates,
          customers: nextCustomers,
          counts: newCounts,
          totalPages: newTotalPages,
          total: newTotal,
        };

        setDates(nextDates);
        setCustomers(nextCustomers);
        setCounts(newCounts);
        setTotalPages(newTotalPages);
        setTotalCustomers(newTotal);
        setError("");
      } catch (err) {
        setError(err?.response?.data?.message || `Unable to load customer retention data for ${date}`);
        setCustomers([]);
        setCounts({ all: 0, stock_available: 0, price_mismatch: 0, other_vendor: 0 });
        setTotalPages(1);
        setTotalCustomers(0);
        setDates(getPastThreeDatesPlusToday(date));
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [selectedDate, currentPage, selectedCategory],
  );

  // Load data whenever relevant state changes
  useEffect(() => {
    fetchRetentionCustomers({ date: selectedDate, page: currentPage, category: selectedCategory });
  }, [selectedDate, currentPage, selectedCategory]);

  const handleDateChange = (e) => {
    const nextDate = e.target.value;
    setSelectedDate(nextDate);
    setDates(getPastThreeDatesPlusToday(nextDate));
    setCurrentPage(1);
    setSelectedCategory("all");
  };

  const handleCategoryChange = useCallback((category) => {
    setSelectedCategory(category);
    setCurrentPage(1);
  }, []);

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
    [selectedDate, fetchRetentionCustomers],
  );

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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-sm font-medium text-slate-700">
            Today Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            className="rounded-lg border border-slate-300 px-3 py-2 shadow-sm"
          />
        </div>
      </div>

      {/* ⭐ OPTIMIZED: Use backend-provided counts directly */}
      <div className="mb-5 flex flex-wrap gap-2">
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

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full min-w-[1400px] text-sm">
          <thead className="sticky top-0 bg-slate-100 text-slate-700">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Phone</th>
              <th className="px-4 py-3 text-left">Zone</th>
              <th className="px-4 py-3 text-left">Delivery Time</th>
              <th className="px-4 py-3 text-left">Delivery Agent</th>
              {dates.map((date, index) => {
                const label = formatDayHeader(date);
                const isTodayColumn = index === dates.length - 1;
                return (
                  <th key={date} className="px-4 py-3 text-center">
                    <div className="font-semibold">
                      {isTodayColumn ? "Today" : label.day}
                    </div>
                    <div className="text-xs text-slate-500">{label.date}</div>
                  </th>
                );
              })}
              <th className="px-4 py-3 text-center">Today's Status Reset</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5 + dates.length + 1} className="px-4 py-16 text-center text-slate-500">
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
                <td colSpan={5 + dates.length + 1} className="px-4 py-16 text-center text-slate-500">
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
