import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import axios from "axios";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import cache from "./cache.js";
import { signAuthToken } from "../utils/jwt.js";
import { adjustActiveCount, invalidateActiveCountCache } from "./CustomerInfoController.js";

const INDIA_TZ = "Asia/Kolkata";

const getDateStringInTimeZone = (date = new Date(), timeZone = INDIA_TZ) => {
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
  } catch (e) {
    // fall through
  }

  // Fallback: keep legacy behavior (UTC) if Intl/timeZone formatting is unavailable.
  return new Date().toISOString().slice(0, 10);
};

const getTodayDateString = () => getDateStringInTimeZone(new Date(), INDIA_TZ);

const normalizePeakFrequency = (value) => {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (/^D[0-7]$/.test(raw)) return raw;
  if (/^[0-7]$/.test(raw)) return `D${raw}`;

  return "";
};

const getPeakFrequencyNumber = (value) => {
  const peak = normalizePeakFrequency(value);
  const n = Number(peak.slice(1));
  return Number.isFinite(n) && n >= 0 && n <= 7 ? n : -1;
};

const getCurrentDeliveryFrequency = (last8Days = {}) => {
  let count = 0;
  const today = new Date();

  for (let i = 0; i <= 6; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateKey = getDateStringInTimeZone(date, INDIA_TZ);
    const entry = last8Days[dateKey];
    const status = typeof entry === "string" ? entry : entry?.status;

    if (String(status || "").toLowerCase() === "delivered") {
      count += 1;
    }
  }

  return `D${count}`;
};

const resolvePeakFrequency = (customerData = {}, last8Days = {}) => {
  const currentPeak = getCurrentDeliveryFrequency(last8Days);
  const savedPeak = normalizePeakFrequency(
    customerData.Peak_Frequency ||
    customerData.peakFrequency ||
    customerData.peak_frequency,
  );

  return getPeakFrequencyNumber(savedPeak) >= getPeakFrequencyNumber(currentPeak)
    ? savedPeak
    : currentPeak;
};

// HELPER: Maintain denormalized last8Days field in customer doc

const updateLast8Days = async (db, customerId, deliveryDate, type, extraData = {}) => {
  try {
    if (!customerId || !deliveryDate || !type) return;

    const today = getTodayDateString();
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 7);
    eightDaysAgo.setHours(0, 0, 0, 0);
    const cutoffDateStr = getDateStringInTimeZone(eightDaysAgo, INDIA_TZ);

    const customerRef = db.collection("customers").doc(customerId);
    const customerSnap = await customerRef.get();

    if (!customerSnap.exists) return;

    const customerData = customerSnap.data();
    let last8Days = customerData.last8Days || {};

    // Normalize type to status
    const normalizedType = String(type || "")
      .trim()
      .toLowerCase();
    let status = "pending";
    if (normalizedType === "delivered") {
      status = "delivered";
    } else if (
      ["reached", "price_mismatch", "shop_closed", "stock_available", "other_vendor"].includes(
        normalizedType,
      )
    ) {
      status = "reached";
    }

    // Update the specific date entry
    const dateStr =
      deliveryDate instanceof Date
        ? getDateStringInTimeZone(deliveryDate, INDIA_TZ)
        : String(deliveryDate);

    // ⭐ OPTIMIZED: Preserve existing object structure and append new data
    const existingEntry = last8Days[dateStr] || {};
    const newEntry = typeof existingEntry === 'object' ? { ...existingEntry } : { status: existingEntry };

    newEntry.status = status;
    newEntry.time = extraData.time || Date.now();
    if (extraData.agentId) newEntry.agentId = extraData.agentId;
    if (extraData.agentName) newEntry.agentName = extraData.agentName;
    if (extraData.reason) newEntry.reason = extraData.reason;
    if (extraData.traysDelivered !== undefined) {
      newEntry.traysDelivered = extraData.traysDelivered;
    }

    last8Days[dateStr] = newEntry;

    // Remove entries older than 8 days
    Object.keys(last8Days).forEach((key) => {
      if (key < cutoffDateStr) {
        delete last8Days[key];
      }
    });

    const peakFrequency = resolvePeakFrequency(customerData, last8Days);
    const savedPeak = normalizePeakFrequency(
      customerData.Peak_Frequency ||
      customerData.peakFrequency ||
      customerData.peak_frequency,
    );

    const updateData = {
      last8Days,
      last8DaysUpdatedAt: Date.now(),
    };

    if (getPeakFrequencyNumber(peakFrequency) > getPeakFrequencyNumber(savedPeak)) {
      updateData.Peak_Frequency = peakFrequency;
    }

    // Update customer document
    await customerRef.update(updateData);

    // Invalidate analytics cache
    try {
      const keys = typeof cache.keys === "function" ? cache.keys() : [];
      const staleKeys = keys.filter(
        (k) =>
          k.startsWith("analytics:last8") ||
          k.startsWith("customerInfo:userInfo") ||
          k === `customer:${customerId}`,
      );
      if (staleKeys.length) {
        cache.del(staleKeys);
      }
    } catch (cacheErr) {
      // Silently fail if cache delete fails
    }
  } catch (err) {
    console.error("updateLast8Days error:", err);
  }
};

const normalizeCustomerPotential = (value) => {
  const VALID_POTENTIALS = [
    "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9",
    "T10", "T15", "T20", "T25", "T30", "T50", "T100",
  ];

  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!raw) return "T1";

  if (VALID_POTENTIALS.includes(raw)) return raw;

  // Handle legacy format with space (T 1 -> T1)
  const withoutSpace = raw.replace(/T\s+(\d+)/, "T$1");
  if (VALID_POTENTIALS.includes(withoutSpace)) return withoutSpace;

  return "T1";
};

const resolveLast8DaysDeliveryType = (entry) => {
  if (typeof entry === "string" && entry.trim()) {
    return entry;
  }

  if (
    entry &&
    typeof entry === "object" &&
    typeof entry.status === "string" &&
    entry.status.trim()
  ) {
    return entry.status;
  }

  return "pending";
};

const resolveDeliveryAgent = (entry, fallbackAgent, deliveryManMap = null) => {
  const entryIsObject = entry && typeof entry === "object";

  const directAgentName = entryIsObject
    ? String(entry.agentName || "").trim()
    : "";
  if (directAgentName) {
    return { name: directAgentName };
  }

  const agentId =
    (entryIsObject ? (entry.agentId || entry.deliveredBy) : null) ||
    fallbackAgent;

  if (typeof agentId === "string") {
    return deliveryManMap?.get(agentId) || { name: agentId };
  }

  if (agentId && typeof agentId === "object") {
    return agentId;
  }

  return null;
};

const getStatusAndReasonFromType = (type, checkReason) => {
  const normalizedType = String(type || "")
    .trim()
    .toLowerCase();

  if (normalizedType === "delivered") {
    return { status: "Delivered", reason: null };
  } else if (
    normalizedType === "reached" ||
    normalizedType === "price_mismatch" ||
    normalizedType === "shop_closed" ||
    normalizedType === "stock_available" ||
    normalizedType === "other_vendor"
  ) {
    return { status: "Checked", reason: checkReason || null };
  } else {
    return { status: "Pending", reason: null };
  }
};

const RETENTION_CATEGORIES = [
  "stock_available",
  "price_mismatch",
  "shop_closed",
  "other_vendor",
];

const normalizeRetentionCategory = (value) => {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (RETENTION_CATEGORIES.includes(raw)) {
    return raw;
  }

  return "all";
};

const getRetentionCategoryFromDelivery = (delivery = {}) => {
  const type = String(delivery.type || "")
    .trim()
    .toLowerCase();

  if (RETENTION_CATEGORIES.includes(type)) {
    return type;
  }

  const reason = String(delivery.checkReason || delivery.reason || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (RETENTION_CATEGORIES.includes(reason)) {
    return reason;
  }

  return "";
};

const getRetentionCategoryLabel = (category) => {
  if (category === "price_mismatch" || category === "shop_closed") return "Shop Closed";
  if (category === "stock_available") return "Stock Available";
  if (category === "other_vendor") return "Other Vendor";
  return "-";
};

const getRetentionStatus = (delivery = null) => {
  if (!delivery) {
    return {
      key: "pending",
      label: "Pending",
      category: "",
      categoryLabel: "-",
      reason: "",
    };
  }

  const type = String(delivery.type || "")
    .trim()
    .toLowerCase();
  const category = getRetentionCategoryFromDelivery(delivery);
  const traysDelivered =
    delivery.traysDelivered ??
    delivery.trays ??
    delivery.quantity ??
    delivery.trayCount ??
    null;

  if (type === "delivered") {
    return {
      key: "delivered",
      label: "Delivered",
      category: "",
      categoryLabel: "-",
      reason: "",
      traysDelivered,
    };
  }

  if (type === "reached" || RETENTION_CATEGORIES.includes(type)) {
    return {
      key: "checked",
      label: "Checked",
      category,
      categoryLabel: getRetentionCategoryLabel(category),
      reason: delivery.checkReason || delivery.reason || getRetentionCategoryLabel(type),
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

const getPastThreeDatesPlusToday = (dateString) => {
  const endDate = dateString ? new Date(`${dateString}T00:00:00`) : new Date();
  if (Number.isNaN(endDate.getTime())) {
    return null;
  }

  const dates = [];
  for (let offset = 3; offset >= 0; offset -= 1) {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - offset);
    dates.push(getDateStringInTimeZone(date, INDIA_TZ));
  }

  return dates;
};

const runInBatches = async (items, batchSize, handler) => {
  const results = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map(handler));
    results.push(...batchResults);
  }

  return results;
};

const getRetentionCustomers = async (req, res) => {
  try {
    const selectedDate =
      req.query.date || getDateStringInTimeZone(new Date(), INDIA_TZ);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const categoryFilter = req.query.category || "all";
    const agentFilter = req.query.agent || "all";
    const allowedSorts = new Set(["name", "zone", "deliveryTime", "deliveryAgent"]);
    const sortBy = allowedSorts.has(req.query.sortBy)
      ? req.query.sortBy
      : "name";

    const dates = getPastThreeDatesPlusToday(selectedDate);
    if (!dates) {
      return res.status(400).json({ message: "Invalid date" });
    }

    const todayKey = dates[dates.length - 1];
    const previousDates = dates.slice(0, -1);

    // ⭐ AGGRESSIVE CACHING: Include page, category and sort in cache key
    const cacheKey = `customerRetention:v16:${todayKey}:${categoryFilter}:${agentFilter}:${sortBy}:${page}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[CACHE HIT] Retention data for ${todayKey} page ${page} category ${categoryFilter} served from cache`);
      return res.status(200).json(cached);
    }

    console.log(`[CACHE MISS] Fetching retention data for ${todayKey} from Firestore`);

    const db = getFirestore();

    // ⭐ OPTIMIZATION: Fetch delivery partners once to lookup names
    const deliveryPartnerSnap = await db.collection("DeliveryMan").get();
    const deliveryPartnerMap = new Map();
    deliveryPartnerSnap.forEach((doc) => {
      const data = doc.data();
      deliveryPartnerMap.set(doc.id, data.name || data.display_name || doc.id);
    });

    const getRetentionAgentName = (customer) => {
      const entry = customer.last8Days?.[todayKey];
      const entryObj = typeof entry === "string" ? { status: entry } : (entry || {});
      
      // 1. Check nested agent object or string (deliveryMan or agent)
      const nestedAgent = entryObj.deliveryMan || entryObj.agent || null;
      if (nestedAgent) {
        if (typeof nestedAgent === "string" && nestedAgent.trim()) {
          const mapped = deliveryPartnerMap.get(nestedAgent.trim());
          if (mapped) return mapped;
          return nestedAgent.trim();
        }
        if (typeof nestedAgent === "object") {
          const nestedName = String(nestedAgent.name || nestedAgent.display_name || nestedAgent.agentName || "").trim();
          if (nestedName) return nestedName;
        }
      }

      // 2. Check direct agent name
      const directAgentName = String(entryObj.agentName || "").trim();
      if (directAgentName) {
        return directAgentName;
      }

      // 3. Check agentId or deliveredBy
      const agentId = entryObj.agentId || entryObj.deliveredBy || "";
      if (agentId) {
        return deliveryPartnerMap.get(agentId) || agentId;
      }

      // 4. Fallback to default assigned delivery partner
      const defaultAgentId = customer.deliveredBy || customer.deliveryMan || "";
      if (defaultAgentId) {
        if (typeof defaultAgentId === "string") {
          return deliveryPartnerMap.get(defaultAgentId) || defaultAgentId;
        } else if (typeof defaultAgentId === "object") {
          return defaultAgentId.name || defaultAgentId.display_name || "";
        }
      }

      return "";
    };

    const getCustomerStatus = (customer) => {
      const entry = customer.last8Days?.[todayKey];
      const entryObj = typeof entry === "string" ? { status: entry } : (entry || {});
      const status = String(entryObj.status || "").trim().toLowerCase();

      if (status === "delivered") {
        return "delivered";
      }

      const checkedStatuses = ["checked", "reached", "price_mismatch", "shop_closed", "stock_available", "other_vendor"];
      if (checkedStatuses.includes(status)) {
        return "checked";
      }

      return "pending";
    };

    // Fetch all customers from Firestore to compute exact statistics
    const customersSnap = await db.collection("customers").get();
    const allCustomers = customersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const agentStatsMap = {};
    // Pre-populate with all delivery partners from collection
    deliveryPartnerMap.forEach((agentName) => {
      agentStatsMap[agentName] = { name: agentName, checked: 0, delivered: 0, pending: 0, total: 0 };
    });

    allCustomers.forEach((customer) => {
      const agentName = getRetentionAgentName(customer);
      if (!agentName) return;

      if (!agentStatsMap[agentName]) {
        agentStatsMap[agentName] = { name: agentName, checked: 0, delivered: 0, pending: 0, total: 0 };
      }

      const status = getCustomerStatus(customer);
      if (status === "checked") {
        agentStatsMap[agentName].checked += 1;
      } else if (status === "delivered") {
        agentStatsMap[agentName].delivered += 1;
      } else if (status === "pending") {
        agentStatsMap[agentName].pending += 1;
      }
      agentStatsMap[agentName].total += 1;
    });

    const agentStats = Object.values(agentStatsMap).sort((a, b) => a.name.localeCompare(b.name));
    const overallStats = { checked: 0, delivered: 0, pending: 0, total: 0 };
    agentStats.forEach((stats) => {
      overallStats.checked += stats.checked;
      overallStats.delivered += stats.delivered;
      overallStats.pending += stats.pending;
      overallStats.total += stats.total;
    });

    // Populate allMatchedCustomers with only those who have "checked" status today
    let allMatchedCustomers = [];
    const counts = {
      all: 0,
      stock_available: 0,
      price_mismatch: 0,
      shop_closed: 0,
      other_vendor: 0,
    };
    const todayDeliveriesMap = {};
    const customerCategories = {};

    allCustomers.forEach((customer) => {
      const todayEntry = customer.last8Days?.[todayKey];
      if (!todayEntry) return;

      const entryObj = typeof todayEntry === 'string' ? { status: todayEntry } : todayEntry;
      const todayDeliveryData = {
        type: entryObj.status,
        checkReason: entryObj.reason || "",
        status: entryObj.status,
        time: entryObj.time || null,
        deliveredBy: entryObj.agentId || null,
        traysDelivered:
          entryObj.quantity ??
          entryObj.trays ??
          entryObj.traysDelivered ??
          0,
      };

      const todayStatus = getRetentionStatus(todayDeliveryData);

      if (todayStatus.key === "checked") {
        todayDeliveriesMap[customer.id] = { status: todayStatus, data: todayDeliveryData };
        customerCategories[customer.id] = todayStatus.category;
        allMatchedCustomers.push(customer);

        counts.all += 1;
        if (counts[todayStatus.category] !== undefined) {
          counts[todayStatus.category] += 1;
        }
      }
    });

    // Filter out ignored ones and apply category filter
    let filteredCustomers = allMatchedCustomers;
    if (categoryFilter !== "all") {
      filteredCustomers = filteredCustomers.filter(
        (c) => customerCategories[c.id] === categoryFilter
      );
    }

    const deliveryAgentOptions = [
      ...new Set(filteredCustomers.map(getRetentionAgentName).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));

    if (agentFilter !== "all") {
      filteredCustomers = filteredCustomers.filter(
        (customer) => getRetentionAgentName(customer) === agentFilter,
      );
    }

    const parseSortableTime = (value) => {
      if (!value) return null;
      if (value instanceof Date) return value.getTime();
      if (typeof value?.toDate === "function") return value.toDate().getTime();
      if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
      if (typeof value === "string") {
        const parsed = new Date(value).getTime();
        return Number.isNaN(parsed) ? null : parsed;
      }
      if (typeof value === "object") {
        const seconds = value.seconds ?? value._seconds;
        const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;
        if (typeof seconds === "number") {
          return seconds * 1000 + Math.floor(nanoseconds / 1e6);
        }
      }
      return null;
    };

    filteredCustomers.sort((a, b) => {
      if (sortBy === "deliveryTime") {
        const aEntry = a.last8Days?.[todayKey];
        const bEntry = b.last8Days?.[todayKey];
        const aEntryObj = typeof aEntry === "string" ? { status: aEntry } : (aEntry || {});
        const bEntryObj = typeof bEntry === "string" ? { status: bEntry } : (bEntry || {});
        const aTime = parseSortableTime(aEntryObj.time || aEntryObj.timestamp || a.last8DaysUpdatedAt);
        const bTime = parseSortableTime(bEntryObj.time || bEntryObj.timestamp || b.last8DaysUpdatedAt);

        if (aTime == null && bTime == null) return 0;
        if (aTime == null) return 1;
        if (bTime == null) return -1;

        return aTime - bTime;
      }

      if (sortBy === "zone") {
        return (a.zone || "UNASSIGNED").localeCompare(b.zone || "UNASSIGNED");
      }

      if (sortBy === "deliveryAgent") {
        return getRetentionAgentName(a).localeCompare(getRetentionAgentName(b));
      }

      return (a.name || "").localeCompare(b.name || "");
    });

    const total = filteredCustomers.length;
    const totalPages = Math.ceil(total / limit) || 1;

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + limit);

    const rows = [];

    // ⭐ Fetch today's delivery doc for the paginated customers to get the EXACT timestamp!
    const paginatedDeliveryRefs = paginatedCustomers.map(c =>
      db.collection("customers").doc(c.id).collection("deliveries").doc(todayKey).get()
    );
    const paginatedDeliverySnaps = await Promise.all(paginatedDeliveryRefs);

    for (let i = 0; i < paginatedCustomers.length; i++) {
      const customer = paginatedCustomers[i];
      const todayDeliverySnap = paginatedDeliverySnaps[i];
      const actualTodayDeliveryData = todayDeliverySnap.exists ? todayDeliverySnap.data() : null;
      try {
        const todayData = todayDeliveriesMap[customer.id];
        const todayStatus = todayData.status;
        const todayDeliveryData = todayData.data;

        const dayStatuses = {};
        previousDates.forEach((dateKey) => {
          const entry = customer.last8Days?.[dateKey];
          const entryObj = typeof entry === 'string' ? { status: entry } : (entry || null);

          let previousDeliveryData = null;
          if (entryObj) {
            previousDeliveryData = {
              type: entryObj.status,
              checkReason: entryObj.reason || "",
              status: entryObj.status,
              traysDelivered: entryObj.traysDelivered,
              trays: entryObj.trays,
              quantity: entryObj.quantity,
            };
          }

          dayStatuses[dateKey] = getRetentionStatus(previousDeliveryData);
        });

        dayStatuses[todayKey] = todayStatus;

        // Process delivery time into ISO string
        // We extract the exact timestamp from the actual delivery document
        let deliveryTime = actualTodayDeliveryData?.timestamp || actualTodayDeliveryData?.deliveryTime || actualTodayDeliveryData?.checkReasonAt || todayDeliveryData.time || null;

        // Add TEMP fallback for old data as explicitly requested
        if (!deliveryTime && customer.last8DaysUpdatedAt) {
          deliveryTime = customer.last8DaysUpdatedAt;
        }
        if (deliveryTime) {
          if (typeof deliveryTime.toDate === "function") {
            deliveryTime = deliveryTime.toDate().toISOString();
          } else if (deliveryTime && typeof deliveryTime === "object" && deliveryTime._seconds !== undefined) {
            deliveryTime = new Date(deliveryTime._seconds * 1000).toISOString();
          } else if (typeof deliveryTime === "number") {
            const ms = deliveryTime < 1e12 ? deliveryTime * 1000 : deliveryTime;
            deliveryTime = new Date(ms).toISOString();
          } else if (typeof deliveryTime === "string") {
            const parsedDate = new Date(deliveryTime);
            if (!Number.isNaN(parsedDate.getTime())) {
              deliveryTime = parsedDate.toISOString();
            }
          }
        }

        rows.push({
          id: customer.id,
          custid: customer.custid || "",
          name: customer.name || "",
          phone: customer.phone || "",
          zone: customer.zone || "UNASSIGNED",
          todayCategory: todayStatus.category,
          todayCategoryLabel: todayStatus.categoryLabel,
          todayReason: todayStatus.reason,
          deliveryTime: deliveryTime,
          deliveryAgent: getRetentionAgentName(customer) || "-",
          days: dayStatuses,
        });
      } catch (err) {
        console.error(`Error processing paginated customer ${customer.id}:`, err);
      }
    }

    // Ensure ordering matches the sorted slice
    const orderedRows = paginatedCustomers.map((c) => rows.find((r) => r.id === c.id)).filter(Boolean);

    const payload = {
      date: todayKey,
      dates,
      categories: [
        { value: "all", label: "All" },
        { value: "stock_available", label: "Stock Available" },
        { value: "price_mismatch", label: "Shop Closed" },
        { value: "shop_closed", label: "Shop Closed" },
        { value: "other_vendor", label: "Other Vendor" },
      ],
      counts,
      deliveryAgentOptions,
      agentStats,
      overallStats,
      total,
      totalPages,
      currentPage: page,
      customers: orderedRows,
    };

    cache.set(cacheKey, payload, 3600);
    return res.status(200).json(payload);
  } catch (err) {
    console.error("getRetentionCustomers error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const resetRetentionCustomer = async (req, res) => {
  try {
    const { customerId, date } = req.body || {};

    console.log("Reset request received:", { customerId, date });

    if (!customerId || !date) {
      return res
        .status(400)
        .json({ message: "Customer ID and date are required" });
    }

    const db = getFirestore();
    const customerRef = db.collection("customers").doc(customerId);
    const deliveryRef = customerRef.collection("deliveries").doc(date);

    // First verify the customer exists
    const customerSnapshot = await customerRef.get();
    if (!customerSnapshot.exists) {
      console.error(`Customer ${customerId} not found`);
      return res.status(404).json({ message: "Customer not found" });
    }

    console.log(`Resetting customer ${customerId} for date ${date}`);

    // Delete the delivery record and update customer's last8Days
    await db.runTransaction(async (transaction) => {
      const customerSnap = await transaction.get(customerRef);

      if (!customerSnap.exists) {
        throw new Error("Customer not found during transaction");
      }

      // Delete the delivery document if it exists
      const deliverySnap = await transaction.get(deliveryRef);
      if (deliverySnap.exists) {
        transaction.delete(deliveryRef);
        console.log(`Deleted delivery record for ${customerId} on ${date}`);
      }

      // Update customer to remove from last8Days
      transaction.update(customerRef, {
        [`last8Days.${date}`]: admin.firestore.FieldValue.delete(),
        last8DaysUpdatedAt: Date.now(),
      });

      console.log(`Updated customer ${customerId} last8Days for ${date}`);
    });

    // Invalidate relevant caches
    try {
      const keys = typeof cache.keys === "function" ? cache.keys() : [];
      const staleKeys = keys.filter(
        (key) =>
          key.startsWith("allCustomerDeliveries") ||
          key.startsWith("customer-retention:v2") ||
          key.startsWith("customerRetention:v3") ||
          key.startsWith("customerRetention:v4") ||
          key.startsWith("customerRetention:v5") ||
          key.startsWith("customerRetention:v6") ||
          key.startsWith("customerRetention:v7") ||
          key.startsWith("customerRetention:v8") ||
          key.startsWith("customerRetention:v9") ||
          key.startsWith("customerRetention:v10") ||
          key.startsWith("customerRetention:v11") ||
          key.startsWith("customerRetention:v12") ||
          key.startsWith("customerRetention:v13") ||
          key.startsWith("customerRetention:v14") ||
          key.startsWith("customerRetention:v15") ||
          key.startsWith("customerRetention:v16") ||
          key.startsWith("retention:") ||
          key.startsWith("analytics:last8"),
      );
      if (staleKeys.length > 0) {
        cache.del(staleKeys);
        console.log(`Invalidated ${staleKeys.length} cache keys`);
      }
      cache.del(`userDeliveries:${customerId}`);
      cache.del("customerMapStatus:today");
      cache.del("latestRemarks");
      await invalidateActiveCountCache();
    } catch (cacheErr) {
      console.warn("retention reset cache invalidation error:", cacheErr);
    }

    console.log(`Reset completed successfully for customer ${customerId}`);
    return res.status(200).json({
      message: "Customer reset to pending successfully",
      customerId,
      date,
    });
  } catch (err) {
    console.error("resetRetentionCustomer error:", err);

    const message = err.message === "Customer not found"
      ? "Customer not found"
      : err.message || "Failed to reset customer. Please try again.";
    const statusCode = err.message === "Customer not found" ? 404 : 500;

    return res.status(statusCode).json({ message });
  }
};

const getCustomerMapStatus = async (req, res) => {
  try {
    const cacheKey = "customerMapStatus:today:v2";
    const cached = cache.get(cacheKey);
    if (cached) return res.status(200).json(cached);

    const db = getFirestore();
    const todayStr = new Date().toISOString().split("T")[0]; // Use ISO string to match last8Days keys

    // ⭐ OPTIMIZATION: ONE read for all customers. Status is derived from last8Days map.
    const customersSnap = await db.collection("customers").get();
    const result = [];

    customersSnap.forEach((doc) => {
      const c = doc.data();
      if (!c.location) return;

      const parts = c.location.replace("Lat:", "").replace("Lng:", "").split(",");
      const lat = parseFloat(parts[0]?.trim());
      const lng = parseFloat(parts[1]?.trim());
      if (isNaN(lat) || isNaN(lng)) return;

      // Check today's status in last8Days map
      const entry = c.last8Days?.[todayStr];
      const todayStatus = (typeof entry === "string" ? entry : entry?.status || "pending").toLowerCase();

      result.push({
        id: doc.id,
        name: c.name,
        business: c.business,
        imageUrl: c.imageUrl || "",
        location: c.location,
        lat,
        lng,
        status: todayStatus,
      });
    });

    cache.set(cacheKey, result, 300);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Customer map status error:", err);
    return res.status(500).json({ error: "Failed to load map data" });
  }
};

const updateCustomerMeta = async (req, res) => {
  try {
    const { id, remarks, zone } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    const db = getFirestore();
    const customerRef = db.collection("customers").doc(id);

    const docSnap = await customerRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const updateData = {};

    // ✅ ZONE — allow change anytime
    if (zone !== undefined) {
      updateData.zone = zone;
    }

    // ✅ REMARKS
    if (remarks !== undefined) updateData.remarks = remarks;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    await customerRef.update(updateData);

    try {
      const keys = typeof cache.keys === "function" ? cache.keys() : [];
      const customerInfoKeys = keys.filter((key) =>
        key.startsWith("customerInfo:userInfo"),
      );
      if (customerInfoKeys.length > 0) {
        cache.del(customerInfoKeys);
      }
      const allDeliveriesKeys = keys.filter((key) =>
        key.startsWith("allCustomerDeliveries"),
      );
      if (allDeliveriesKeys.length > 0) {
        cache.del(allDeliveriesKeys);
      }
      cache.del(`customer:${id}`);
    } catch (cacheError) {
      console.warn("Failed to invalidate customer caches:", cacheError);
    }

    return res.status(200).json({
      message: "Customer updated successfully",
      updated: updateData,
    });
  } catch (err) {
    console.error("updateCustomerMeta error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const addZone = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Zone name required" });

    const db = getFirestore();

    // Check duplicate
    const snap = await db.collection("zones").where("name", "==", name).get();
    if (!snap.empty) {
      return res.status(400).json({ message: "Zone already exists" });
    }

    await db.collection("zones").add({ name });
    cache.del("zones:list");

    res.json({ message: "Zone added" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
};

const getZones = async (req, res) => {
  try {
    const cacheKey = "zones:list";
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const db = getFirestore();
    const snap = await db.collection("zones").get();
    const zones = snap.docs.map((doc) => doc.data().name).filter(Boolean);

    // Sort alphabetically
    zones.sort((a, b) => a.localeCompare(b));

    cache.set(cacheKey, zones, 3600); // Cache for 1 hour
    res.json(zones);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
};


const getAnalyticsLast8 = async (req, res) => {
  const cacheKey = "analytics:last8:v2";

  // CHECK CACHE FIRST (avoid Firestore read)
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return res.status(200).json({ customers: cachedData });
  }

  try {
    const db = getFirestore();

    // ONLY 1 READ: Fetch all customers
    const customersSnap = await db.collection("customers").get();

    if (customersSnap.empty) {
      return res.status(200).json({ customers: [] });
    }

    // TRANSFORM: Use denormalized last8Days (no subcollection reads!)
    const customers = customersSnap.docs.map((doc) => {
      const c = doc.data();
      const customerId = doc.id;

      // SAFE DEFAULT: {} is valid (means 0 deliveries in last 8 days)
      const last8Days = c.last8Days || {};

      // Convert to deliveries array for frontend compatibility
      // Handle BOTH old format (string) and new format (object with status field)
      const deliveries = Object.entries(last8Days).map(([date, entry]) => ({
        id: date,
        type: resolveLast8DaysDeliveryType(entry),
      }));

      return {
        id: customerId,
        name: c.name,
        custid: c.custid,
        imageUrl: c.imageUrl || "",
        createdAt: c.createdAt,
        zone: c.zone || "UNASSIGNED",
        todayOverride: c.todayOverride || null,
        deliveries,
      };
    });

    // CACHE for 30 minutes
    cache.set(cacheKey, customers, 1800);

    return res.status(200).json({ customers });
  } catch (err) {
    console.error("Analytics API error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
// Get deliveries between date range (For Excel)
// NOTE: Moved to frontend - no longer needed

const getCustomersByDeliveryDays = async (req, res) => {
  try {
    const db = getFirestore();

    const days = Number(req.query.days);
    if (!Number.isFinite(days) || days < 0 || days > 7) {
      return res.status(400).json({ message: "days must be 0..7" });
    }

    const rangeEnd = new Date();
    const rangeStart = new Date(rangeEnd);
    rangeStart.setDate(rangeEnd.getDate() - 6);
    rangeStart.setHours(0, 0, 0, 0);

    const customersSnap = await db.collection("customers").get();
    if (customersSnap.empty) {
      return res.status(200).json([]);
    }

    const deliveriesSnap = await db.collectionGroup("deliveries").get();

    const deliveredDaysByCustomer = new Map();

    deliveriesSnap.forEach((doc) => {
      const data = doc.data() || {};
      if (
        String(data.type || "")
          .trim()
          .toLowerCase() !== "delivered"
      ) {
        return;
      }

      const deliveryDate = data.timestamp?.toDate
        ? data.timestamp.toDate()
        : new Date(data.timestamp);

      if (
        !(deliveryDate instanceof Date) ||
        Number.isNaN(deliveryDate.getTime()) ||
        deliveryDate < rangeStart ||
        deliveryDate > rangeEnd
      ) {
        return;
      }

      const customerId = doc.ref.parent.parent.id;
      const dayKey = deliveryDate.toISOString().slice(0, 10);

      let set = deliveredDaysByCustomer.get(customerId);
      if (!set) {
        set = new Set();
        deliveredDaysByCustomer.set(customerId, set);
      }

      set.add(dayKey);
    });

    const result = [];

    customersSnap.forEach((doc) => {
      const customerId = doc.id;
      const set = deliveredDaysByCustomer.get(customerId);
      const deliveryCount = set ? set.size : 0;
      if (deliveryCount !== days) return;

      const data = doc.data() || {};
      result.push({
        id: customerId,
        ...data,
        deliveryCount,
      });
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("getCustomersByDeliveryDays error:", error);
    return res.status(500).json({ message: "Failed to fetch customers" });
  }
};

const getCustomersByDeliveryCount = async (req, res) => {
  try {
    const db = getFirestore();
    const countFilter = Number(req.query.count);

    if (isNaN(countFilter)) {
      return res.status(400).json({ message: "Invalid count value" });
    }

    // Last 7 days (including today): from start of day 6 days ago -> now.
    const rangeEnd = new Date();
    const rangeStart = new Date(rangeEnd);
    rangeStart.setDate(rangeEnd.getDate() - 6);
    rangeStart.setHours(0, 0, 0, 0);

    //  Get all customers
    const customersSnap = await db.collection("customers").get();

    if (customersSnap.empty) {
      return res.status(200).json([]);
    }

    // Get all deliveries (no firestore filter → no index needed)
    const deliveriesSnap = await db.collectionGroup("deliveries").get();

    const deliveryMap = {};

    deliveriesSnap.forEach((doc) => {
      const data = doc.data();
      const customerId = doc.ref.parent.parent.id;

      const deliveryDate = data.timestamp?.toDate
        ? data.timestamp.toDate()
        : new Date(data.timestamp);

      if (
        !(deliveryDate instanceof Date) ||
        Number.isNaN(deliveryDate.getTime())
      ) {
        return;
      }

      // Only count delivered and within range
      if (
        deliveryDate >= rangeStart &&
        deliveryDate <= rangeEnd &&
        data.type === "delivered"
      ) {
        if (!deliveryMap[customerId]) {
          deliveryMap[customerId] = new Set();
        }

        // prevent duplicate same-day deliveries
        const dayKey = deliveryDate.toDateString();
        deliveryMap[customerId].add(dayKey);
      }
    });

    //  Filter customers based on delivery count
    const result = [];

    customersSnap.forEach((doc) => {
      const customerId = doc.id;

      const deliveryCount = deliveryMap[customerId]
        ? deliveryMap[customerId].size
        : 0;

      let shouldInclude = false;

      if (countFilter >= 0 && countFilter <= 3) {
        shouldInclude = deliveryCount === countFilter;
      }

      if (countFilter === 4) {
        shouldInclude = deliveryCount >= 4;
      }

      if (shouldInclude) {
        const data = doc.data() || {};
        result.push({
          id: customerId,
          ...data,
          deliveryCount,
        });
      }
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("getCustomersByDeliveryCount error:", error);

    return res.status(500).json({
      message: "Failed to fetch customers",
    });
  }
};


//  returns only the latest delivery remark per customer
const getLatestRemarks = async (req, res) => {
  try {
    const db = getFirestore();

    // Fetch ALL deliveries across all customers
    const allDeliveriesSnap = await db.collectionGroup("deliveries").get();

    const customerDeliveries = {};

    allDeliveriesSnap.forEach((doc) => {
      const customerId = doc.ref.parent.parent.id;
      const data = doc.data();
      const docId = doc.id; // date string like "2026-03-10"
      const { status, reason } = getStatusAndReasonFromType(
        data.type,
        data.checkReason,
      );

      // Initialize array
      if (!customerDeliveries[customerId]) {
        customerDeliveries[customerId] = [];
      }

      // Keep only deliveries that have remark data
      if (
        (status === "Checked" && reason) ||
        (status === "Delivered" && typeof data.traysDelivered === "number")
      ) {
        customerDeliveries[customerId].push({
          docId,
          status,
          reason,
          traysDelivered: data.traysDelivered,
        });
      }
    });

    const remarks = {};

    // Find latest remark for each customer
    for (const [customerId, deliveries] of Object.entries(customerDeliveries)) {
      // Sort by date (latest first)
      deliveries.sort((a, b) => b.docId.localeCompare(a.docId));

      const latest = deliveries[0];

      if (!latest) {
        remarks[customerId] = "-";
        continue;
      }

      if (latest.status === "Checked" && latest.reason) {
        remarks[customerId] = latest.reason;
      } else if (
        latest.status === "Delivered" &&
        typeof latest.traysDelivered === "number"
      ) {
        remarks[customerId] = `${latest.traysDelivered} trays`;
      } else {
        remarks[customerId] = "-";
      }
    }

    return res.status(200).json(remarks);
  } catch (err) {
    console.error("getLatestRemarks error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const updateCustomerPotential = async (req, res) => {
  try {
    const { id, potential } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    if (potential === undefined || potential === null) {
      return res.status(400).json({ message: "Potential is required" });
    }

    const normalizedPotential = normalizeCustomerPotential(potential);

    const db = getFirestore();
    const customerRef = db.collection("customers").doc(id);

    await customerRef.update({ potential: normalizedPotential });

    try {
      cache.del("userInfo");
    } catch (cacheErr) {
      console.warn("Failed to clear userInfo cache:", cacheErr);
    }

    return res.status(200).json({
      message: "Potential updated successfully",
      potential: normalizedPotential,
    });
  } catch (err) {
    console.error("updateCustomerPotential error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// Save skip delivery config per customer
// POST /customer/skip-config
// Body: { id, type: "MANUAL"|"AUTO", days: number, startDate: "YYYY-MM-DD"|null }
// Note: For AUTO, startDate is always set to "today" (Asia/Kolkata) on the server.
const saveSkipConfig = async (req, res) => {
  try {
    const { id, type, days } = req.body || {};

    const customerId = String(id || "").trim();
    if (!customerId) {
      return res.status(400).json({ message: "Customer id is required" });
    }

    const normalizedType = String(type || "")
      .trim()
      .toUpperCase();
    if (!["MANUAL", "AUTO"].includes(normalizedType)) {
      return res.status(400).json({
        message: "Invalid type. Expected MANUAL or AUTO",
      });
    }

    let normalizedDays = Number(days);
    if (!Number.isFinite(normalizedDays)) normalizedDays = 0;
    normalizedDays = Math.floor(normalizedDays);
    if (normalizedDays < 0) normalizedDays = 0;
    if (normalizedDays > 6) normalizedDays = 6;

    const skipConfig =
      normalizedType === "MANUAL"
        ? { type: "MANUAL", days: 0, startDate: null }
        : {
          type: "AUTO",
          days: normalizedDays,
          startDate: getTodayDateString(),
        };

    const db = getFirestore();
    const customerRef = db.collection("customers").doc(customerId);

    await customerRef.update({ skipConfig });

    // Keep cached customer lists fresh without re-reading all customers.
    try {
      const keys = typeof cache.keys === "function" ? cache.keys() : [];
      const customerInfoKeys = keys.filter((key) =>
        key.startsWith("customerInfo:userInfo"),
      );

      customerInfoKeys.forEach((key) => {
        const cachedPayload = cache.get(key);
        const patchRows = (rows) =>
          Array.isArray(rows)
            ? rows.map((row) =>
                row.id === customerId ? { ...row, skipConfig } : row,
              )
            : rows;

        if (Array.isArray(cachedPayload)) {
          cache.set(key, patchRows(cachedPayload), 300);
          return;
        }

        if (cachedPayload && Array.isArray(cachedPayload.customers)) {
          cache.set(
            key,
            { ...cachedPayload, customers: patchRows(cachedPayload.customers) },
            300,
          );
        }
      });

      cache.del(`customer:${customerId}`);
    } catch (cacheErr) {
      console.warn("saveSkipConfig customerInfo cache patch failed:", cacheErr);
    }

    // Invalidate caches that depend on customer meta.
    try {
      cache.del("analytics:last8:v10");
      cache.del("customerMapStatus:today");
      const allDeliveriesKeys = cache
        .keys()
        .filter((key) => key.startsWith("allCustomerDeliveries"));
      if (allDeliveriesKeys.length > 0) {
        cache.del(allDeliveriesKeys);
      }
      await invalidateActiveCountCache();
    } catch (cacheErr) {
      console.warn("skip-config cache invalidation error:", cacheErr);
    }

    return res.status(200).json({
      message: "Skip config saved",
      skipConfig,
    });
  } catch (err) {
    if (err?.code === 5 || err?.details?.includes("NOT_FOUND")) {
      return res.status(404).json({ message: "Customer not found" });
    }

    console.error("saveSkipConfig error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const toggleTodayDelivery = async (req, res) => {
  try {
    const { id, status } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    const normalizedStatus = String(status || "")
      .trim()
      .toUpperCase();
    const allowed = ["ON", "OFF"];

    if (!allowed.includes(normalizedStatus)) {
      return res.status(400).json({ message: "Status must be ON or OFF" });
    }

    const db = getFirestore();
    const customerRef = db.collection("customers").doc(id);

    const todayOverride = {
      date: getTodayDateString(),
      status: normalizedStatus,
      type: "MANUAL",
    };

    await customerRef.update({ todayOverride });

    // Keep cached customer lists fresh without re-reading all customers.
    try {
      const keys = typeof cache.keys === "function" ? cache.keys() : [];
      const customerInfoKeys = keys.filter((key) =>
        key.startsWith("customerInfo:userInfo"),
      );

      customerInfoKeys.forEach((key) => {
        const cachedPayload = cache.get(key);
        const patchRows = (rows) =>
          Array.isArray(rows)
            ? rows.map((row) =>
                row.id === id ? { ...row, todayOverride } : row,
              )
            : rows;

        if (Array.isArray(cachedPayload)) {
          cache.set(key, patchRows(cachedPayload), 300);
          return;
        }

        if (cachedPayload && Array.isArray(cachedPayload.customers)) {
          cache.set(
            key,
            { ...cachedPayload, customers: patchRows(cachedPayload.customers) },
            300,
          );
        }
      });

      cache.del(`customer:${id}`);
    } catch (cacheErr) {
      console.warn("toggleTodayDelivery cache patch failed:", cacheErr);
    }

    // Keep the in-memory active-count accurate (no extra Firestore reads).
    // ON → customer became active (+1), OFF → became inactive (-1).
    try {
      const delta = normalizedStatus === "ON" ? 1 : -1;
      adjustActiveCount(todayOverride.date, delta);
    } catch (adjustErr) {
      console.warn("adjustActiveCount failed:", adjustErr);
    }

    // Analytics endpoint is cached; clear it so UI reflects persisted state.
    try {
      const keys = typeof cache.keys === "function" ? cache.keys() : [];
      const analyticsKeys = keys.filter((k) => k.startsWith("analytics:last8"));
      if (analyticsKeys.length) {
        cache.del(analyticsKeys);
      } else {
        cache.del("analytics:last8:v10");
      }
    } catch (cacheErr) {
      console.warn("Failed to clear analytics cache:", cacheErr);
    }

    return res.status(200).json({
      message: "Today delivery status updated",
      todayOverride,
    });
  } catch (err) {
    if (err?.code === 5 || err?.details?.includes("NOT_FOUND")) {
      return res.status(404).json({ message: "Customer not found" });
    }

    console.error("toggleTodayDelivery error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
// ⭐ NEW: Get Collection Summary for today's deliveries with extreme Firestore optimization
const getCollectionSummary = async (req, res) => {
  try {
    const cacheKey = "collectionSummary:today";

    // CHECK CACHE FIRST (avoid Firestore read)
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log("[CACHE HIT] Collection summary served from cache");
      return res.status(200).json(cachedData);
    }

    console.log("[CACHE MISS] Fetching collection summary from Firestore");

    const db = getFirestore();
    const todayDate = getTodayDateString();

    // ⭐ OPTIMIZATION: ONE Firestore query only - fetch all customers
    const customersSnap = await db.collection("customers").get();

    if (customersSnap.empty) {
      const emptyResponse = {
        success: true,
        totals: {
          totalTrays: 0,
          totalCash: 0,
          totalUpi: 0,
          totalAmount: 0,
        },
        customers: [],
      };
      cache.set(cacheKey, emptyResponse, 600);
      return res.status(200).json(emptyResponse);
    }

    let totalTrays = 0;
    let totalCash = 0;
    let totalUpi = 0;
    let totalAmount = 0;

    const customers = [];

    // Process each customer - read from denormalized last8Days only
    customersSnap.forEach((doc) => {
      const customerData = doc.data();
      const customerId = doc.id;

      // Get today's entry from last8Days
      const todayEntry = customerData.last8Days?.[todayDate];

      // Skip if no entry for today
      if (!todayEntry) return;

      // Normalize entry (handle both string format and object format)
      const entryObj =
        typeof todayEntry === "string" ? { status: todayEntry } : todayEntry;

      // Skip if not delivered
      if (entryObj.status !== "delivered") return;

      // Extract fields
      const custid = customerData.id || customerData.custid || customerId;
      const customerName = customerData.name || "N/A";
      const quantity = entryObj.trays || 0;
      const paymentMethod = entryObj.paymentMethod || "UNKNOWN";
      const amount = entryObj.amount || 0;

      // Determine cash vs UPI split
      let cashAmount = "-";
      let upiAmount = "-";

      if (paymentMethod === "CASH" && amount > 0) {
        cashAmount = amount;
        totalCash += amount;
      } else if (paymentMethod === "UPI" && amount > 0) {
        upiAmount = amount;
        totalUpi += amount;
      }

      // Accumulate totals
      if (quantity > 0) {
        totalTrays += quantity;
      }
      if (amount > 0) {
        totalAmount += amount;
      }

      customers.push({
        customerId: custid,
        customerName,
        quantity: quantity || "-",
        paymentMethod,
        cash: cashAmount,
        upi: upiAmount,
        amount: amount || "-",
      });
    });

    const response = {
      success: true,
      totals: {
        totalTrays,
        totalCash,
        totalUpi,
        totalAmount,
      },
      customers: customers.sort((a, b) =>
        String(a.customerName).localeCompare(String(b.customerName)),
      ),
    };

    // CACHE for 10 minutes
    cache.set(cacheKey, response, 600);

    return res.status(200).json(response);
  } catch (err) {
    console.error("getCollectionSummary error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const recalculateCollectionData = async (req, res) => {
  try {
    const { customers } = req.body;

    if (!Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid customers data",
      });
    }

    const db = getFirestore();
    const batch = db.batch();
    let updatedCount = 0;

    // Update only received customers with cleaned last8Days (keeping latest 30 days)
    customers.forEach((customerData) => {
      const { id, last8Days } = customerData;
      if (!id || !last8Days) return;

      const customerRef = db.collection("customers").doc(id);
      batch.update(customerRef, {
        last8Days: last8Days,
        updatedAt: new Date(),
      });
      updatedCount++;
    });

    await batch.commit();

    // Clear cache after recalculation
    cache.del("collectionSummary:today");

    return res.status(200).json({
      success: true,
      message: `Updated ${updatedCount} customers with cleaned last8Days data (kept latest 30 days)`,
      updatedCount,
    });
  } catch (err) {
    console.error("recalculateCollectionData error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Update customer payment information for a specific date

const updateCustomerPayment = async (req, res) => {
  try {
    const { docId, date, quantity, cashAmount, upiAmount, totalAmount } = req.body;
    if (!docId || !date) {
      return res.status(400).json({
        success: false,
        message: "docId and date are required",
      });
    }
    const db = getFirestore();
    const customerRef = db.collection("customers").doc(docId);

    // Prepare update object with dynamic field paths
    const updateData = {
      updatedAt: new Date(),
    };

    // updateing the fields here
    if (quantity !== undefined && quantity !== null) {
      updateData[`last8Days.${date}.quantity`] = Number(quantity);
    }
    if (cashAmount !== undefined && cashAmount !== null) {
      updateData[`last8Days.${date}.cashAmount`] = Number(cashAmount);
    }
    if (upiAmount !== undefined && upiAmount !== null) {
      updateData[`last8Days.${date}.upiAmount`] = Number(upiAmount);
    }
    if (totalAmount !== undefined && totalAmount !== null) {
      updateData[`last8Days.${date}.totalAmount`] = Number(totalAmount);
    }

    // update happen
    await customerRef.update(updateData);

    // Clear relevant caches
    cache.del("collectionSummary:today");
    const cacheKeys = await cache.keysAsync("customerInfo:userInfo*");
    if (cacheKeys.length > 0) {
      await cache.delAsync(cacheKeys);
    }
    return res.status(200).json({
      success: true,
      message: "Customer payment updated successfully",
      updatedFields: {
        date,
        quantity: quantity !== undefined ? Number(quantity) : undefined,
        cashAmount: cashAmount !== undefined ? Number(cashAmount) : undefined,
        upiAmount: upiAmount !== undefined ? Number(upiAmount) : undefined,
        totalAmount: totalAmount !== undefined ? Number(totalAmount) : undefined,
      },
    });
  } catch (err) {
    console.error("updateCustomerPayment error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error updating customer payment",
      error: err.message,
    });
  }
};
export {
  getCustomerMapStatus,
  updateCustomerMeta,
  updateCustomerPotential,
  saveSkipConfig,
  toggleTodayDelivery,
  addZone,
  getZones,
  getAnalyticsLast8,
  getCustomersByDeliveryDays,
  getCustomersByDeliveryCount,
  getRetentionCustomers,
  resetRetentionCustomer,
  getLatestRemarks,
  getCollectionSummary,
  recalculateCollectionData,
  updateCustomerPayment,
};
