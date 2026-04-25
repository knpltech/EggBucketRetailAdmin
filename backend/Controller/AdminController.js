import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import axios from "axios";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import cache from "./cache.js";
import { signAuthToken } from "../utils/jwt.js";

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
      ["reached", "price_mismatch", "stock_available", "other_vendor"].includes(
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

    // Update customer document
    await customerRef.update({
      last8Days,
      last8DaysUpdatedAt: Date.now(),
    });

    // Invalidate analytics cache
    try {
      const keys = typeof cache.keys === "function" ? cache.keys() : [];
      const analyticsKeys = keys.filter((k) => k.startsWith("analytics:last8"));
      if (analyticsKeys.length) {
        cache.del(analyticsKeys);
      }
    } catch (cacheErr) {
      // Silently fail if cache delete fails
    }
  } catch (err) {
    console.error("updateLast8Days error:", err);
  }
};

const normalizeCustomerPriority = (priority) => {
  const p = String(priority ?? "")
    .trim()
    .toUpperCase();

  if (!p) return "P0";
  if (/^P[0-7]$/.test(p)) return p;
  if (/^[0-7]$/.test(p)) return `P${p}`;
  return "P0";
};

const normalizeCustomerPotential = (value) => {
  const VALID_POTENTIALS = [
    "T1","T2","T3","T4","T5","T6","T7","T8","T9",
    "T10","T15","T20","T25","T30","T50","T100",
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
  if (category === "stock_available") return "Stock Available";
  if (category === "price_mismatch") return "Price Mismatch";
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

  if (type === "delivered") {
    return {
      key: "delivered",
      label: "Delivered",
      category: "",
      categoryLabel: "-",
      reason: "",
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

    const dates = getPastThreeDatesPlusToday(selectedDate);
    if (!dates) {
      return res.status(400).json({ message: "Invalid date" });
    }

    const todayKey = dates[dates.length - 1];
    const previousDates = dates.slice(0, -1);
    
    // ⭐ AGGRESSIVE CACHING: Include page and category in cache key
    const cacheKey = `customerRetention:v12:${todayKey}:${categoryFilter}:${page}:${limit}`;
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

    // ⭐ OPTIMIZATION: Query customers who have a "checked" status today
    // We do two queries to handle BOTH new object format and legacy string format in last8Days
    const customersRef = db.collection("customers");
    const statuses = ["reached", "price_mismatch", "stock_available", "other_vendor"];
    
    const q1 = customersRef.where(`last8Days.${todayKey}.status`, "in", statuses).get();
    const q2 = customersRef.where(`last8Days.${todayKey}`, "in", statuses).get();
    
    const [snap1, snap2] = await Promise.all([q1, q2]);

    let allMatchedCustomers = [];
    const seen = new Set();
    [...(snap1.docs || []), ...(snap2.docs || [])].forEach((doc) => {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        allMatchedCustomers.push({ id: doc.id, ...doc.data() });
      }
    });
    
    console.log(`Checking ${allMatchedCustomers.length} customers for ${todayKey} deliveries`);

    const counts = {
      all: 0,
      stock_available: 0,
      price_mismatch: 0,
      other_vendor: 0,
    };

    const todayDeliveriesMap = {};
    const customerCategories = {};

    // ⭐ ZERO SUBCOLLECTION READS: Compute exact categories/counts directly from last8Days!
    for (const customer of allMatchedCustomers) {
      try {
        const todayEntry = customer.last8Days?.[todayKey];
        if (!todayEntry) {
          customerCategories[customer.id] = "ignored";
          continue;
        }

        // Normalize legacy string format to object format
        const entryObj = typeof todayEntry === 'string' ? { status: todayEntry } : todayEntry;
        
        // Construct faux delivery doc to pass to getRetentionStatus
        const todayDeliveryData = {
          type: entryObj.status,
          checkReason: entryObj.reason || "",
          status: entryObj.status,
          time: entryObj.time || null,
          deliveredBy: entryObj.agentId || null
        };

        const todayStatus = getRetentionStatus(todayDeliveryData);

        if (todayStatus.key === "checked") {
          todayDeliveriesMap[customer.id] = { status: todayStatus, data: todayDeliveryData };
          customerCategories[customer.id] = todayStatus.category;

          counts.all += 1;
          if (counts[todayStatus.category] !== undefined) {
            counts[todayStatus.category] += 1;
          }
        } else {
           customerCategories[customer.id] = "ignored";
        }
      } catch (err) {
        console.error(`Error processing today delivery for ${customer.id}:`, err);
        customerCategories[customer.id] = "ignored";
      }
    }

    // Filter out ignored ones and apply category filter
    let filteredCustomers = allMatchedCustomers.filter(c => customerCategories[c.id] !== "ignored");
    if (categoryFilter !== "all") {
      filteredCustomers = filteredCustomers.filter(
        (c) => customerCategories[c.id] === categoryFilter
      );
    }

    filteredCustomers.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

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
              status: entryObj.status
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

        const deliveryAgentId = todayDeliveryData.deliveredBy || null;
        let deliveryAgent = "-";
        
        if (deliveryAgentId) {
          if (typeof deliveryAgentId === "string") {
            deliveryAgent = deliveryPartnerMap.get(deliveryAgentId) || deliveryAgentId;
          } else if (typeof deliveryAgentId === "object" && (deliveryAgentId.name || deliveryAgentId.display_name)) {
            deliveryAgent = deliveryAgentId.name || deliveryAgentId.display_name || "-";
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
          deliveryAgent: deliveryAgent,
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
        { value: "price_mismatch", label: "Price Mismatch" },
        { value: "other_vendor", label: "Other Vendor" },
      ],
      counts,
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
  const cacheKey = "zones:list";

  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const db = getFirestore();
    const snap = await db.collection("zones").get();

    const zones = snap.docs.map((d) => d.data().name);
    cache.set(cacheKey, zones, 300);
    res.json(zones);
  } catch (e) {
    res.status(500).json({ message: "Error fetching zones" });
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
        priority: normalizeCustomerPriority(c.priority),
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
const getAllCustomerDeliveriesRange = async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ message: "Start and End date required" });
  }

  try {
    const db = getFirestore();

    // 1. Fetch all delivery boys once
    const deliveryManSnap = await db.collection("DeliveryMan").get();
    const deliveryManMap = new Map();
    deliveryManSnap.docs.forEach((doc) => {
      const data = doc.data();
      deliveryManMap.set(doc.id, {
        name: data.name || "",
        phone: data.phone || "",
      });
    });

    const customersSnap = await db.collection("customers").get();

    // ⭐ OPTIMIZATION: Use last8Days map for range queries. 
    // This avoids fetching subcollections for every customer.
    const customersWithDeliveries = customersSnap.docs.map((doc) => {
      const c = doc.data() || {};
      const last8Days = c.last8Days || {};

      // Filter dates that fall within the range [start, end]
      const deliveries = Object.entries(last8Days)
        .filter(([dateKey]) => dateKey >= start && dateKey <= end)
        .map(([dateKey, entry]) => {
          const status = typeof entry === "string" ? entry : entry?.status || "";
          
          // Resolve Delivery Agent
          const resolvedAgent = resolveDeliveryAgent(
            entry,
            c.deliveredBy || c.deliveryMan,
            deliveryManMap,
          );

          return {
            id: dateKey,
            type: status,
            status: status,
            checkReason: (typeof entry === "object" ? entry?.reason : "") || c.checkReason || "",
            traysDelivered:
              (typeof entry === "object" ? entry?.traysDelivered : null) ??
              c.traysDelivered ??
              null,
            deliveryMan: resolvedAgent,
          };
        });

      return {
        id: doc.id,
        ...c,
        priority: normalizeCustomerPriority(c.priority),
        deliveries,
      };
    }).filter(c => c.deliveries.length > 0);

    return res.status(200).json({ customers: customersWithDeliveries });
  } catch (err) {
    console.error("Range API error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

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
        priority: normalizeCustomerPriority(data?.priority),
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
          priority: normalizeCustomerPriority(data?.priority),
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

//  for storing the Checked Reasonn and Delivery Quantity

const saveDeliveredTrays = async (req, res) => {
  try {
    const { customerId, deliveryId, traysDelivered } = req.body;
    const allowedTrayValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100];

    if (!customerId || !deliveryId || traysDelivered === undefined) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const trays = Number(traysDelivered);
    if (!Number.isInteger(trays) || !allowedTrayValues.includes(trays)) {
      return res
        .status(400)
        .json({ message: "Invalid trays value selected" });
    }

    const db = getFirestore();
    const deliveryRef = db
      .collection("customers")
      .doc(customerId)
      .collection("deliveries")
      .doc(deliveryId);

    const deliverySnap = await deliveryRef.get();
    if (!deliverySnap.exists) {
      return res.status(404).json({ message: "Delivery not found" });
    }

    const deliveryData = deliverySnap.data();
    if (deliveryData.type !== "delivered") {
      return res
        .status(400)
        .json({ message: "Trays can only be added for DELIVERED entries" });
    }

    await deliveryRef.update({ traysDelivered: trays });

    // 🔄 Update denormalized last8Days
    const deliveryDate = new Date(deliveryId);
    await updateLast8Days(db, customerId, deliveryDate, "delivered", {
      time: Date.now(),
      traysDelivered: trays,
    });

    // ⭐ Denormalize to customer document with actual tray count & sync todayOverride
    const todayDate = getTodayDateString();
    const deliveryDateStr = getDateStringInTimeZone(deliveryDate, INDIA_TZ);

    const trayLabel = trays === 1 ? "1 tray" : `${trays} trays`;
    const updateData = {
      latestRemark: trayLabel,
    };

    // ✅ If marking TODAY's delivery, also update todayOverride to OFF
    if (deliveryDateStr === todayDate) {
      updateData.todayOverride = {
        date: todayDate,
        status: "OFF",
      };
    }

    await db.collection("customers").doc(customerId).update(updateData);

    cache.del(`userDeliveries:${customerId}`);
    cache.del("latestRemarks");
    cache.del("userInfo"); // ⭐ Invalidate main cache
    const allDeliveriesKeys = cache
      .keys()
      .filter((key) => key.startsWith("allCustomerDeliveries"));
    if (allDeliveriesKeys.length > 0) {
      cache.del(allDeliveriesKeys);
    }

    return res.status(200).json({
      message: "Trays saved successfully",
      traysDelivered: trays,
    });
  } catch (err) {
    console.error("saveDeliveredTrays error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const saveCheckedReason = async (req, res) => {
  try {
    const { customerId, deliveryId, reason } = req.body;

    const allowedReasons = [
      "PRICE MISMATCH",
      "STOCK AVAILABLE",
      "OTHER VENDOR",
    ];

    if (!customerId || !deliveryId || !reason) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!allowedReasons.includes(reason)) {
      return res.status(400).json({ message: "Invalid reason selected" });
    }

    const db = getFirestore();
    const deliveryRef = db
      .collection("customers")
      .doc(customerId)
      .collection("deliveries")
      .doc(deliveryId);

    const deliverySnap = await deliveryRef.get();

    if (!deliverySnap.exists) {
      return res.status(404).json({ message: "Delivery not found" });
    }

    const deliveryData = deliverySnap.data();

    if (deliveryData.type !== "reached") {
      return res
        .status(400)
        .json({ message: "Reason can only be added for CHECKED deliveries" });
    }

    const previousReason = deliveryData.checkReason || "";

    // Editing should be idempotent: if same value is selected, return success.
    if (previousReason === reason) {
      return res.status(200).json({
        message: "Reason already up to date",
        checkReason: previousReason,
      });
    }

    await deliveryRef.update({
      checkReason: reason,
      checkReasonAt: Date.now(),
    });

    // 🔄 Update denormalized last8Days
    await updateLast8Days(db, customerId, deliveryId, "reached", { reason, time: Date.now() });

    // ⭐ Denormalize to customer document
    await db.collection("customers").doc(customerId).update({
      latestRemark: reason,
    });

    // Invalidate caches that may serve stale delivery rows.
    cache.del(`userDeliveries:${customerId}`);
    cache.del("allCustomerDeliveries");
    cache.del(`allCustomerDeliveries:${deliveryId}`);
    cache.del("latestRemarks");
    cache.del("userInfo"); // ⭐ Invalidate main cache

    return res.status(200).json({
      message: previousReason
        ? "Reason updated successfully"
        : "Reason saved successfully",
      checkReason: reason,
    });
  } catch (err) {
    console.error("saveCheckedReason error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const resetAllCheckedReasons = async (req, res) => {
  try {
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    const db = getFirestore();
    const deliveriesRef = db
      .collection("customers")
      .doc(customerId)
      .collection("deliveries");

    const deliveriesSnap = await deliveriesRef.get();

    if (deliveriesSnap.empty) {
      return res.status(200).json({
        message: "No deliveries found",
        resetCount: 0,
      });
    }

    const batch = db.batch();
    let resetCount = 0;

    deliveriesSnap.forEach((doc) => {
      const data = doc.data();
      const hasCheckedReason =
        data.type === "reached" && (data.checkReason || data.checkReasonAt);
      const hasTrays =
        data.type === "delivered" && data.traysDelivered !== undefined;

      if (!hasCheckedReason && !hasTrays) {
        return;
      }

      const updatePayload = {};
      if (hasCheckedReason) {
        updatePayload.checkReason = admin.firestore.FieldValue.delete();
        updatePayload.checkReasonAt = admin.firestore.FieldValue.delete();
      }
      if (hasTrays) {
        updatePayload.traysDelivered = admin.firestore.FieldValue.delete();
      }

      batch.update(doc.ref, updatePayload);
      resetCount += 1;
    });

    if (resetCount > 0) {
      await batch.commit();
    }

    cache.del(`userDeliveries:${customerId}`);
    cache.del("latestRemarks");
    const allDeliveriesKeys = cache
      .keys()
      .filter((key) => key.startsWith("allCustomerDeliveries"));
    if (allDeliveriesKeys.length > 0) {
      cache.del(allDeliveriesKeys);
    }

    return res.status(200).json({
      message: "Checked reasons and trays reset successfully",
      resetCount,
    });
  } catch (err) {
    console.error("resetAllCheckedReasons error:", err);
    return res.status(500).json({ message: "Server error" });
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

const updateCustomerPriority = async (req, res) => {
  try {
    const { id, priority } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    if (priority === undefined || priority === null) {
      return res.status(400).json({ message: "Priority is required" });
    }

    const raw = String(priority ?? "")
      .trim()
      .toUpperCase();

    // Only accept new priority system.
    const normalizedPriority = /^P[0-7]$/.test(raw)
      ? raw
      : /^[0-7]$/.test(raw)
        ? `P${raw}`
        : null;

    if (!normalizedPriority) {
      return res.status(400).json({ message: "Invalid priority value" });
    }

    const db = getFirestore();
    const customerRef = db.collection("customers").doc(id);
    const customerSnap = await customerRef.get();

    if (!customerSnap.exists) {
      return res.status(404).json({ message: "Customer not found" });
    }

    await customerRef.update({ priority: normalizedPriority });

    try {
      cache.del("analytics:last8:v1");
    } catch (cacheErr) {
      console.warn("Failed to clear analytics cache:", cacheErr);
    }

    return res.status(200).json({
      message: "Priority updated successfully",
      priority: normalizedPriority,
    });
  } catch (err) {
    console.error("updateCustomerPriority error:", err);
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
    const customerSnap = await customerRef.get();

    if (!customerSnap.exists) {
      return res.status(404).json({ message: "Customer not found" });
    }

    await customerRef.update({ skipConfig });

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
    } catch (cacheErr) {
      console.warn("skip-config cache invalidation error:", cacheErr);
    }

    return res.status(200).json({
      message: "Skip config saved",
      skipConfig,
    });
  } catch (err) {
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
    const customerSnap = await customerRef.get();

    if (!customerSnap.exists) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const todayOverride = {
      date: getTodayDateString(),
      status: normalizedStatus,
    };

    await customerRef.update({ todayOverride });

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
    console.error("toggleTodayDelivery error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
export {
  getCustomerMapStatus,
  updateCustomerMeta,
  updateCustomerPriority,
  updateCustomerPotential,
  saveSkipConfig,
  toggleTodayDelivery,
  addZone,
  getZones,
  getAnalyticsLast8,
  getAllCustomerDeliveriesRange,
  getCustomersByDeliveryDays,
  getCustomersByDeliveryCount,
  saveCheckedReason,
  getRetentionCustomers,
  resetRetentionCustomer,
  resetAllCheckedReasons,
  saveDeliveredTrays,
  getLatestRemarks,
};
