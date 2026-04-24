import React, { useEffect, useState } from "react";
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
const RETENTION_CACHE_TTL_MS = 60 * 1000;

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

const getStatusClasses = (statusKey, isToday) => {
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

const fetchDeliveriesForDate = async (dateKey) => {
  const cacheKey = `customer-retention:v2:all-deliveries:${dateKey}`;
  const cached = sessionStorage.getItem(cacheKey);

  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (
        parsed?.savedAt &&
        Date.now() - parsed.savedAt < RETENTION_CACHE_TTL_MS &&
        Array.isArray(parsed.customers)
      ) {
        return parsed.customers;
      }
    } catch {
      sessionStorage.removeItem(cacheKey);
    }
  }

  const res = await axios.get(`${ADMIN_PATH}/all-deliveries`, {
    params: { date: dateKey },
  });
  const customers = Array.isArray(res.data?.customers) ? res.data.customers : [];

  sessionStorage.setItem(
    cacheKey,
    JSON.stringify({
      savedAt: Date.now(),
      customers,
    }),
  );

  return customers;
};

const CustomerRetention = () => {
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [dates, setDates] = useState(() =>
    getPastThreeDatesPlusToday(getTodayDate()),
  );
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

  const fetchRetentionCustomers = async ({
    date = selectedDate,
    category = selectedCategory,
    showLoader = true,
  } = {}) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const expectedDates = getPastThreeDatesPlusToday(date);
      const responses = await Promise.all(
        expectedDates.map((dateKey) => fetchDeliveriesForDate(dateKey)),
      );

      const customerMap = new Map();

      expectedDates.forEach((dateKey, index) => {
        const dayCustomers = responses[index] || [];

        dayCustomers.forEach((customer) => {
          const existing = customerMap.get(customer.id) || {
            id: customer.id,
            custid: customer.custid || "",
            name: customer.name || "",
            phone: customer.phone || "",
            zone: customer.zone || "UNASSIGNED",
            todayCategory: "",
            todayCategoryLabel: "-",
            todayReason: "",
            days: {},
          };
          const delivery = customer.deliveries?.[0] || null;
          const status = getStatusFromDelivery(delivery);

          existing.days[dateKey] = status;

          if (dateKey === date) {
            existing.todayCategory = status.category;
            existing.todayCategoryLabel = status.categoryLabel;
            existing.todayReason = status.reason;
          }

          customerMap.set(customer.id, existing);
        });
      });

      const allRows = [...customerMap.values()].filter(
        (customer) => customer.days?.[date]?.key === "checked",
      );
      const nextCounts = {
        all: allRows.length,
        stock_available: 0,
        price_mismatch: 0,
        other_vendor: 0,
      };

      allRows.forEach((customer) => {
        if (nextCounts[customer.todayCategory] !== undefined) {
          nextCounts[customer.todayCategory] += 1;
        }
      });

      const filteredRows =
        category === "all"
          ? allRows
          : allRows.filter((customer) => customer.todayCategory === category);

      filteredRows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      setDates(expectedDates);
      setCustomers(filteredRows);
      setCounts(nextCounts);
      setError("");
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          `Unable to load customer retention data for ${date}`,
      );
      setCustomers([]);
      setCounts({
        all: 0,
        stock_available: 0,
        price_mismatch: 0,
        other_vendor: 0,
      });
      setDates(getPastThreeDatesPlusToday(date));
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchRetentionCustomers();
  }, []);

  const handleDateChange = async (e) => {
    const nextDate = e.target.value;
    setSelectedDate(nextDate);
    setDates(getPastThreeDatesPlusToday(nextDate));
    await fetchRetentionCustomers({
      date: nextDate,
      category: selectedCategory,
    });
  };

  const handleCategoryChange = async (category) => {
    setSelectedCategory(category);
    await fetchRetentionCustomers({
      date: selectedDate,
      category,
    });
  };

  const handleReset = async (customer) => {
    const confirmed = window.confirm(
      `Reset ${customer.name} to pending for ${selectedDate}?`,
    );
    if (!confirmed) return;

    try {
      setResettingId(customer.id);
      const resetPayload = {
        customerId: customer.id,
        date: selectedDate,
      };

      try {
        await axios.post(`${ADMIN_PATH}/customer-retention/reset`, resetPayload);
      } catch (requestError) {
        if (requestError?.response?.status !== 404) {
          throw requestError;
        }

        await axios.post(`${ADMIN_PATH}/customer/retention/reset`, resetPayload);
      }

      dates.forEach((dateKey) => {
        sessionStorage.removeItem(`customer-retention:all-deliveries:${dateKey}`);
      });
      setCustomers((prev) => prev.filter((item) => item.id !== customer.id));
    } catch (err) {
      alert(err?.response?.data?.message || "Reset failed");
    } finally {
      setResettingId("");
    }
  };

  const todayKey = dates[dates.length - 1] || selectedDate;

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

      <div className="mb-5 flex flex-wrap gap-2">
        {CATEGORY_OPTIONS.map((category) => {
          const isActive = selectedCategory === category.value;
          return (
            <button
              key={category.value}
              type="button"
              onClick={() => handleCategoryChange(category.value)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm transition ${
                isActive
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
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Phone</th>
              <th className="px-4 py-3 text-left">Zone</th>
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
                <td colSpan={8} className="px-4 py-16 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            ) : customers.length ? (
              customers.map((customer) => (
                <tr key={customer.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-4 font-semibold text-slate-900">
                    {customer.name}
                  </td>
                  <td className="px-4 py-4 text-slate-700">{customer.phone}</td>
                  <td className="px-4 py-4 text-slate-700">{customer.zone}</td>

                  {dates.map((date) => {
                    const status = customer.days?.[date] || {
                      key: "pending",
                      label: "PENDING",
                    };
                    const isToday = date === todayKey;

                    return (
                      <td key={date} className="px-4 py-4 text-center">
                        <span
                          className={`inline-flex min-w-[112px] items-center justify-center rounded-full px-3 py-2 text-xs font-bold tracking-wide ${getStatusClasses(
                            status.key,
                            isToday,
                          )}`}
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
                      onClick={() => handleReset(customer)}
                      disabled={resettingId === customer.id}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold uppercase text-white shadow hover:bg-red-700 disabled:opacity-50"
                    >
                      {resettingId === customer.id ? "..." : "Reset"}
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-slate-500">
                  No checked customers found for this date.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CustomerRetention;
