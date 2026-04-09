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

const normalizeCustomerPriority = (priority) => {
  const p = String(priority ?? "")
    .trim()
    .toUpperCase();

  if (!p) return "P0";
  if (/^P[0-7]$/.test(p)) return p;
  if (/^[0-7]$/.test(p)) return `P${p}`;
  return "P0";
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

const getCustomerMapStatus = async (req, res) => {
  try {
    const cacheKey = "customerMapStatus:today";

    //  Cache check
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const db = getFirestore();

    //  TODAY (start of day)
    const targetDate = new Date();
    targetDate.setHours(0, 0, 0, 0);

    const customersSnap = await db.collection("customers").get();
    const result = [];

    for (const doc of customersSnap.docs) {
      const c = doc.data();
      if (!c.location) continue;

      //  Parse lat/lng
      const parts = c.location
        .replace("Lat:", "")
        .replace("Lng:", "")
        .split(",");

      const lat = parseFloat(parts[0]?.trim());
      const lng = parseFloat(parts[1]?.trim());
      if (isNaN(lat) || isNaN(lng)) continue;

      let status = "pending";

      const deliveriesSnap = await db
        .collection("customers")
        .doc(doc.id)
        .collection("deliveries")
        .get();

      deliveriesSnap.forEach((d) => {
        const data = d.data();
        if (!data.timestamp?._seconds) return;

        const deliveryDate = new Date(data.timestamp._seconds * 1000);
        deliveryDate.setHours(0, 0, 0, 0);

        if (deliveryDate.getTime() === targetDate.getTime()) {
          if (data.type === "delivered") status = "delivered";
          else if (data.type === "reached") status = "reached";
        }
      });

      result.push({
        id: doc.id,
        name: c.name,
        business: c.business,
        imageUrl: c.imageUrl || "",
        location: c.location,
        lat,
        lng,
        status,
      });
    }

    // ⏱ Cache for 60 seconds
    cache.set(cacheKey, result, 60);

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

    res.json({ message: "Zone added" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
};

const getZones = async (req, res) => {
  try {
    const db = getFirestore();
    const snap = await db.collection("zones").get();

    const zones = snap.docs.map((d) => d.data().name);
    res.json(zones);
  } catch (e) {
    res.status(500).json({ message: "Error fetching zones" });
  }
};

const getAnalyticsLast8 = async (req, res) => {
  const cacheKey = "analytics:last8:v10";

  // Cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.status(200).json({ customers: cached });
  }

  try {
    const db = getFirestore();

    // Get customers
    const customersSnap = await db.collection("customers").get();

    if (customersSnap.empty) {
      return res.json({ customers: [] });
    }

    // Parallel
    const customers = await Promise.all(
      customersSnap.docs.map(async (doc) => {
        const c = doc.data();

        // Get ALL deliveries - no timestamp filters needed

        const deliveriesSnap = await db
          .collection("customers")
          .doc(doc.id)
          .collection("deliveries")
          .get();

        const deliveries = deliveriesSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id, // Document ID is the date string (YYYY-MM-DD)
            type: data.type,
          };
        });

        return {
          id: doc.id,
          name: c.name,
          custid: c.custid,
          imageUrl: c.imageUrl || "",
          createdAt: c.createdAt,
          zone: c.zone || "UNASSIGNED",
          priority: normalizeCustomerPriority(c.priority),
          todayOverride: c.todayOverride || null,
          deliveries,
        };
      }),
    );

    // Cache 5 minutes
    cache.set(cacheKey, customers, 300);

    return res.status(200).json({ customers });
  } catch (err) {
    console.error("Analytics API error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// Get deliveries between date range (For Excel)
const getAllCustomerDeliveriesRange = async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({
      message: "Start and End date required",
    });
  }

  try {
    const db = getFirestore();

    //  Fetch all delivery boys once
    const deliveryManSnap = await db.collection("DeliveryMan").get();

    const deliveryManMap = {};

    deliveryManSnap.docs.forEach((doc) => {
      const data = doc.data();

      deliveryManMap[doc.id] = {
        name: data.name || "",
        phone: data.phone || "",
      };
    });

    //  Fetch customers
    const customersSnap = await db.collection("customers").get();

    const customersWithDeliveries = await Promise.all(
      customersSnap.docs.map(async (doc) => {
        const deliveriesRef = db
          .collection("customers")
          .doc(doc.id)
          .collection("deliveries");

        //  Fetch deliveries in range
        const snap = await deliveriesRef
          .where(admin.firestore.FieldPath.documentId(), ">=", start)
          .where(admin.firestore.FieldPath.documentId(), "<=", end)
          .get();

        //  Attach delivery boy details
        const deliveries = snap.docs.map((d) => {
          const data = d.data();

          return {
            id: d.id,
            ...data,
            deliveryMan: data.deliveredBy
              ? deliveryManMap[data.deliveredBy] || null
              : null,
          };
        });

        const customerData = doc.data() || {};
        return {
          id: doc.id,
          ...customerData,
          priority: normalizeCustomerPriority(customerData?.priority),
          deliveries,
        };
      }),
    );

    return res.status(200).json({
      customers: customersWithDeliveries,
    });
  } catch (err) {
    console.error("Range API error:", err);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

// Delivery-days segmentation (D0..D7): customers with exactly N delivered-days in last 7 days.
// GET /customer/delivery-days?days=0..7
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

    if (!customerId || !deliveryId || traysDelivered === undefined) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const trays = Number(traysDelivered);
    if (!Number.isInteger(trays) || trays < 1 || trays > 10) {
      return res
        .status(400)
        .json({ message: "Trays must be an integer between 1 and 10" });
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

    cache.del(`userDeliveries:${customerId}`);
    cache.del("latestRemarks");
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

    // Invalidate caches that may serve stale delivery rows.
    cache.del(`userDeliveries:${customerId}`);
    cache.del("allCustomerDeliveries");
    cache.del(`allCustomerDeliveries:${deliveryId}`);
    cache.del("latestRemarks");

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
      const keys = typeof cache.keys === "function" ? cache.keys() : [];
      const analyticsKeys = keys.filter((k) => k.startsWith("analytics:last8"));
      if (analyticsKeys.length) {
        cache.del(analyticsKeys);
      } else {
        cache.del("analytics:last8:v9");
      }
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
  saveSkipConfig,
  toggleTodayDelivery,
  addZone,
  getZones,
  getAnalyticsLast8,
  getAllCustomerDeliveriesRange,
  getCustomersByDeliveryDays,
  getCustomersByDeliveryCount,
  saveCheckedReason,
  resetAllCheckedReasons,
  saveDeliveredTrays,
  getLatestRemarks,
};
