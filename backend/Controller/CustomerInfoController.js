import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import cache from "./cache.js";

const DEFAULT_CUSTOMER_PAGE_SIZE = 25;
const MAX_CUSTOMER_PAGE_SIZE = 50;
const INDIA_TZ = "Asia/Kolkata";

// ── In-memory daily active-count cache ──────────────────────────────────────
// Stores { date: "YYYY-MM-DD", count: N, lastComputed: Timestamp } so we serve activeCount
// from memory, automatically refreshing every 5 minutes to pull updates from field agents.
const _activeCountCache = { date: null, count: 0, lastComputed: 0 };

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
  } catch {
    // fall through
  }

  return new Date().toISOString().slice(0, 10);
};

const normalizeCustomerPotential = (value) => {
  const VALID_POTENTIALS = [
    "T1", "T2", "T3", "T4", "T5", "T6", "T7",
    "T8", "T9", "T10", "T15", "T20", "T25", "T30",
    "T50", "T100",
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

// ─── Prime Customer Helpers ────────────────────────────────────────────────
// These helpers calculate and sync Prime Customer status based on Peak_Potential
const computePeakPotentialNumber = (last8Days = {}) => {
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
};

const getPrimeCustomerType = (peakPotentialNumber = 0) => {
  const num = Number(peakPotentialNumber);
  if (!Number.isFinite(num)) return "REGULAR";
  return num >= 10 ? "PRIME" : "REGULAR";
};

const syncPrimeCustomerStatus = (customerData = {}, customerTypeUpdates = [], docRef = null) => {
  const peakPotential = computePeakPotentialNumber(customerData.last8Days);
  const calculatedType = getPrimeCustomerType(peakPotential);

  const storedType = String(customerData.customerType || "")
    .trim()
    .toUpperCase();
  const normalizedStoredType =
    storedType === "PRIME" || storedType === "REGULAR" ? storedType : null;

  // If customerType needs update, add to batch
  if (normalizedStoredType !== calculatedType && docRef) {
    customerTypeUpdates.push({
      ref: docRef,
      customerType: calculatedType,
    });
  }

  return calculatedType;
};


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

const resolvePeakFrequency = (customerData = {}) => {
  const currentPeak = getCurrentDeliveryFrequency(customerData.last8Days || {});
  const savedPeak = normalizePeakFrequency(
    customerData.Peak_Frequency ||
    customerData.peakFrequency ||
    customerData.peak_frequency,
  );

  return getPeakFrequencyNumber(savedPeak) >= getPeakFrequencyNumber(currentPeak)
    ? savedPeak
    : currentPeak;
};

const buildCustomerInfoPayload = (doc, peakUpdates = [], customerTypeUpdates = []) => {
  const customerData = doc.data();
  const peakFrequency = resolvePeakFrequency(customerData);
  const savedPeakFreq = normalizePeakFrequency(
    customerData?.Peak_Frequency ||
    customerData?.peakFrequency ||
    customerData?.peak_frequency,
  );

  // Compute Peak_Potential from last8Days (max trays delivered)
  const peakPotentialNum = computePeakPotentialNumber(customerData.last8Days);
  const peakPotential = peakPotentialNum > 0 ? `T${peakPotentialNum}` : "T1";
  const savedPeakPotential = String(customerData.Peak_Potential || "").trim();

  // Build update object — only include fields that need saving
  const updateFields = {};
  if (getPeakFrequencyNumber(peakFrequency) > getPeakFrequencyNumber(savedPeakFreq)) {
    updateFields.Peak_Frequency = peakFrequency;
  }
  if (peakPotential !== savedPeakPotential) {
    updateFields.Peak_Potential = peakPotential;
  }
  if (Object.keys(updateFields).length > 0) {
    peakUpdates.push({ ref: doc.ref, ...updateFields });
  }

  // Sync Prime Customer status
  const customerType = syncPrimeCustomerStatus(customerData, customerTypeUpdates, doc.ref);

  return {
    id: doc.id,
    ...customerData,
    Peak_Frequency: peakFrequency,
    Peak_Potential: peakPotential,
    customerType, // Include synced customerType in response
  };
};

const commitPeakUpdates = async (db, peakUpdates = []) => {
  if (!peakUpdates.length) return;

  for (let i = 0; i < peakUpdates.length; i += 500) {
    const batch = db.batch();
    peakUpdates.slice(i, i + 500).forEach(({ ref, ...fields }) => {
      batch.update(ref, fields);
    });
    await batch.commit();
  }
};

const commitCustomerTypeUpdates = async (db, customerTypeUpdates = []) => {
  if (!customerTypeUpdates.length) return;

  for (let i = 0; i < customerTypeUpdates.length; i += 500) {
    const batch = db.batch();
    customerTypeUpdates.slice(i, i + 500).forEach(({ ref, customerType }) => {
      batch.update(ref, { customerType });
    });
    await batch.commit();
  }
};

const getStatusAndReasonFromType = (type, checkReason = "") => {
  const DELIVERY_REASON_MAP = {
    price_mismatch: "Price Mismatch",
    stock_available: "Stock Available",
    other_vendor: "Other Vendor",
  };

  const normalizeReasonLabel = (value = "") => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const normalized = raw.toLowerCase().replace(/\s+/g, "_");

    if (DELIVERY_REASON_MAP[normalized]) {
      return DELIVERY_REASON_MAP[normalized];
    }

    return raw
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  };

  const normalizedType = String(type || "")
    .trim()
    .toLowerCase();

  if (normalizedType === "delivered") {
    return { status: "Delivered", reason: "" };
  }

  if (DELIVERY_REASON_MAP[normalizedType]) {
    return { status: "Checked", reason: DELIVERY_REASON_MAP[normalizedType] };
  }

  if (normalizedType === "reached") {
    return { status: "Checked", reason: normalizeReasonLabel(checkReason) };
  }

  return { status: "Pending", reason: "" };
};

const resolveDeliveryAgent = (entry, fallbackAgent, deliveryManMap) => {
  const entryIsObject = entry && typeof entry === "object";

  const nestedAgent = entryIsObject ? entry.deliveryMan || entry.agent : null;
  if (typeof nestedAgent === "string" && nestedAgent.trim()) {
    return deliveryManMap.get(nestedAgent.trim()) || { name: nestedAgent.trim() };
  }
  if (nestedAgent && typeof nestedAgent === "object") {
    const nestedName =
      String(
        nestedAgent.name ||
        nestedAgent.display_name ||
        nestedAgent.agentName ||
        "",
      ).trim();
    if (nestedName) {
      return { ...nestedAgent, name: nestedName };
    }
  }

  const directAgentName = entryIsObject
    ? String(entry.agentName || "").trim()
    : "";
  if (directAgentName) {
    return { name: directAgentName };
  }

  const agentId =
    (entryIsObject ? (entry.agentId || entry.assignedDeliverymen) : null) ||
    fallbackAgent;

  if (typeof agentId === "string") {
    return deliveryManMap.get(agentId) || { name: agentId };
  }

  if (agentId && typeof agentId === "object") {
    return agentId;
  }

  return null;
};

const parsePageLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CUSTOMER_PAGE_SIZE;
  }

  return Math.min(parsed, MAX_CUSTOMER_PAGE_SIZE);
};

const parsePageNumber = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
};

const normalizeSortBy = (value) => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  return raw === "createdat" ? "createdAt" : "name";
};

const sortCustomers = (customers, sortBy) => {
  const sorted = [...customers];

  if (sortBy === "createdAt") {
    sorted.sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
    return sorted;
  }

  sorted.sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || "")),
  );
  return sorted;
};

const toBase64Url = (base64Value) =>
  String(base64Value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (base64UrlValue) => {
  const normalized = String(base64UrlValue)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const remainder = normalized.length % 4;
  if (remainder === 0) {
    return normalized;
  }

  return `${normalized}${"=".repeat(4 - remainder)}`;
};

const encodeCursor = (payload) => {
  const base64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64",
  );
  return toBase64Url(base64);
};

const decodeCursor = (cursor) => {
  if (!cursor) return null;

  try {
    // 1) Preferred path for URL-safe cursors
    const decoded = Buffer.from(fromBase64Url(cursor), "base64").toString(
      "utf8",
    );
    const parsed = JSON.parse(decoded);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (!parsed.lastId) {
      return null;
    }

    return parsed;
  } catch {
    try {
      // 2) Backward-compatible fallback for legacy base64 cursors
      const decodedLegacy = Buffer.from(String(cursor), "base64").toString(
        "utf8",
      );
      const parsedLegacy = JSON.parse(decodedLegacy);

      if (!parsedLegacy || typeof parsedLegacy !== "object") {
        return null;
      }

      if (!parsedLegacy.lastId) {
        return null;
      }

      return parsedLegacy;
    } catch {
      return null;
    }
  }
};

const invalidateCustomerInfoCache = async (customerId) => {
  try {
    const cacheKeys = await cache.keysAsync("customerInfo:userInfo*");
    if (cacheKeys.length > 0) {
      await cache.delAsync(cacheKeys);
    }

    const aiSuggestionCacheKeys = await cache.keysAsync(
      "customerInfo:aiSuggestions*",
    );
    if (aiSuggestionCacheKeys.length > 0) {
      await cache.delAsync(aiSuggestionCacheKeys);
    }

    if (customerId) {
      await cache.delAsync(`customer:${customerId}`);
    }
  } catch (error) {
    console.warn("Failed to invalidate customer info cache:", error);
  }
};

const invalidateAllCustomerDeliveriesCache = async () => {
  try {
    const cacheKeys = await cache.keysAsync("allCustomerDeliveries*");
    if (cacheKeys.length > 0) {
      await cache.delAsync(cacheKeys);
    }
  } catch (error) {
    console.warn("Failed to invalidate all deliveries cache:", error);
  }
};

const getTotalCustomersCount = async (db) => {
  let totalCustomers = 0;

  try {
    const aggregateSnapshot = await db.collection("customers").count().get();
    const aggregateCount = aggregateSnapshot.data()?.count;
    const parsedCount = Number(aggregateCount);

    if (Number.isFinite(parsedCount) && parsedCount >= 0) {
      totalCustomers = Math.floor(parsedCount);
    } else {
      const snapshot = await db.collection("customers").get();
      totalCustomers = snapshot.size;
    }
  } catch {
    const snapshot = await db.collection("customers").get();
    totalCustomers = snapshot.size;
  }

  return totalCustomers;
};

// Fetches all customer information
const userInfo = async (req, res) => {
  const hasPageParam = req.query.page !== undefined;
  const isPaginatedRequest =
    req.query.limit !== undefined ||
    req.query.cursor !== undefined ||
    hasPageParam;

  const sortBy = normalizeSortBy(req.query.sortBy);
  const limit = parsePageLimit(req.query.limit);
  const requestedPage = parsePageNumber(req.query.page);

  try {
    const db = getFirestore();

    if (isPaginatedRequest) {
      const cacheKey = `customerInfo:userInfo:page:${sortBy}:${limit}:${requestedPage}:${req.query.cursor || ""}`;
      const cachedPayload = await cache.getAsync(cacheKey);
      if (cachedPayload) {
        return res.status(200).json(cachedPayload);
      }

      const totalCustomers = await getTotalCustomersCount(db);
      const totalPages = Math.max(
        1,
        Math.ceil(Number(totalCustomers || 0) / limit),
      );

      // Prefer direct page-number based navigation for random access (e.g., jump to page 5).
      if (hasPageParam) {
        const currentPage = Math.min(requestedPage, totalPages);
        const offset = (currentPage - 1) * limit;

        let query = db.collection("customers");

        if (sortBy === "createdAt") {
          query = query.orderBy("createdAt", "desc");
        } else {
          query = query.orderBy("name", "asc");
        }

        const snapshot = await query.offset(offset).limit(limit).get();

        const peakUpdates = [];
        const customerTypeUpdates = [];
        const customers = snapshot.docs.map((doc) =>
          buildCustomerInfoPayload(doc, peakUpdates, customerTypeUpdates),
        );
        await commitPeakUpdates(db, peakUpdates);
        await commitCustomerTypeUpdates(db, customerTypeUpdates);

        const payload = {
          customers,
          pagination: {
            limit,
            totalCustomers,
            totalPages,
            currentPage,
            hasNextPage: currentPage < totalPages,
            hasPrevPage: currentPage > 1,
            nextCursor: null,
            sortBy,
            sortDirection: "asc",
          },
        };

        await cache.setAsync(cacheKey, payload, 300);
        return res.status(200).json(payload);
      }

      const cursor = decodeCursor(req.query.cursor);

      let query = db.collection("customers");

      if (sortBy === "createdAt") {
        query = query.orderBy("createdAt", "desc");
      } else {
        query = query.orderBy("name", "asc");
      }

      query = query.limit(limit + 1);

      if (cursor) {
        const cursorDoc = await db
          .collection("customers")
          .doc(cursor.lastId)
          .get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      const snapshot = await query.get();
      const docs = snapshot.docs;
      const hasNextPage = docs.length > limit;
      const pageDocs = hasNextPage ? docs.slice(0, limit) : docs;

      const peakUpdates = [];
      const customerTypeUpdates = [];
      const customers = pageDocs.map((doc) =>
        buildCustomerInfoPayload(doc, peakUpdates, customerTypeUpdates),
      );
      await commitPeakUpdates(db, peakUpdates);
      await commitCustomerTypeUpdates(db, customerTypeUpdates);

      let nextCursor = null;
      if (hasNextPage && pageDocs.length > 0) {
        const lastDoc = pageDocs[pageDocs.length - 1];

        nextCursor = encodeCursor({
          lastId: lastDoc.id,
        });
      }

      const payload = {
        customers,
        pagination: {
          limit,
          totalCustomers,
          totalPages,
          currentPage: 1,
          hasNextPage,
          hasPrevPage: false,
          nextCursor,
          sortBy,
          sortDirection: "asc",
        },
      };

      await cache.setAsync(cacheKey, payload, 300);
      return res.status(200).json(payload);
    }

    const cacheKey = `customerInfo:userInfo:all:${sortBy}`;
    const cachedCustomers = await cache.getAsync(cacheKey);
    if (cachedCustomers) {
      return res.status(200).json(cachedCustomers);
    }

    const customersSnapshot = await db.collection("customers").get();
    const peakUpdates = [];
    const customerTypeUpdates = [];
    const customers = customersSnapshot.docs.map((doc) =>
      buildCustomerInfoPayload(doc, peakUpdates, customerTypeUpdates),
    );
    await commitPeakUpdates(db, peakUpdates);
    await commitCustomerTypeUpdates(db, customerTypeUpdates);

    const sortedCustomers = sortCustomers(customers, sortBy);

    await cache.setAsync(cacheKey, sortedCustomers, 300);
    return res.status(200).json(sortedCustomers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    return res.status(500).json({ error: "Failed to fetch customer data" });
  }
};

const getAISuggestionCandidates = async (req, res) => {
  try {
    const cacheKey = "customerInfo:aiSuggestions:d1d3:v1";
    const cachedCustomers = await cache.getAsync(cacheKey);
    if (cachedCustomers) {
      return res.status(200).json(cachedCustomers);
    }

    const db = getFirestore();
    const customersSnapshot = await db
      .collection("customers")
      .where("category", "in", ["D1", "D2", "D3"])
      .get();

    const customers = customersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    await cache.setAsync(cacheKey, customers, 300);
    return res.status(200).json(customers);
  } catch (error) {
    console.error("Error fetching AI suggestion candidates:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch AI suggestion candidates" });
  }
};

// Gets details for a specific customer by ID
const specificUser = async (req, res) => {
  try {
    const db = getFirestore();
    const userId = req.params.id;

    const cacheKey = `customer:${userId}`;
    const cached = await cache.getAsync(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const userDoc = await db.collection("customers").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const data = userDoc.data() || {};
    const payload = {
      id: userDoc.id,
      ...data,
    };

    await cache.setAsync(cacheKey, payload, 120);
    res.status(200).json(payload);
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({ error: "Failed to fetch customer data" });
  }
};

// Controller to get all deliveries for a specific user
const getUserDeliveries = async (req, res) => {
  const userId = req.params.id;
  const cacheKey = `userDeliveries:${userId}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.status(200).json({ deliveries: cached });
  }

  try {
    const db = getFirestore();
    const deliveriesSnapshot = await db
      .collection("customers")
      .doc(userId)
      .collection("deliveries")
      .get();

    if (deliveriesSnapshot.empty) {
      return res.status(200).json({ deliveries: [] });
    }

    const deliveries = [];

    for (const doc of deliveriesSnapshot.docs) {
      const data = doc.data();
      const deliveredByUID = data.assignedDeliverymen || data.deliveredBy;
      const { status, reason } = getStatusAndReasonFromType(
        data.type,
        data.checkReason,
      );

      let deliveryMan = null;

      if (deliveredByUID) {
        const deliveryManDoc = await db
          .collection("DeliveryMan")
          .doc(deliveredByUID)
          .get();
        if (deliveryManDoc.exists) {
          const manData = deliveryManDoc.data();
          deliveryMan = {
            name: manData.name || "",
            phone: manData.phone || "",
          };
        }
      }

      deliveries.push({
        id: doc.id,
        assignedDeliverymen: deliveredByUID,
        timestamp: data.timestamp,
        type: data.type,
        status,
        reason,
        checkReason: data.checkReason || "",
        traysDelivered:
          typeof data.traysDelivered === "number" ? data.traysDelivered : null,
        deliveryMan,
      });
    }

    cache.set(cacheKey, deliveries);
    res.status(200).json({ deliveries });
  } catch (error) {
    console.error("Error fetching customer deliveries:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching customer deliveries." });
  }
};

// ⭐ Cache for delivery partners with 24-hour TTL (they rarely change)
const getDeliveryPartnerMapCached = async () => {
  const cacheKey = "deliveryPartnerMap:v1";
  let cached = cache.get(cacheKey);
  if (cached) {
    console.log("[CACHE HIT] Delivery partner map served from cache");
    return cached;
  }

  console.log("[CACHE MISS] Fetching delivery partners from Firestore");
  const db = getFirestore();
  const deliveryManSnap = await db.collection("DeliveryMan").get();
  const deliveryManMap = new Map();
  deliveryManSnap.docs.forEach(doc => {
    const d = doc.data();
    deliveryManMap.set(doc.id, { name: d.name || d.display_name || "", phone: d.phone || "" });
  });

  // Cache for 24 hours (86400 seconds)
  cache.set(cacheKey, deliveryManMap, 86400);
  return deliveryManMap;
};

// Controller to get all customers along with their deliveries
// Controller to get all customers along with their deliveries
const getAllCustomerDeliveries = async (req, res) => {
  const date = req.query.date;

  // ✅ OPTIMIZATION: Separate cache keys and increased TTL (5 mins)
  const cacheKey = date
    ? `allCustomerDeliveries:${date}:v6`
    : "allCustomerDeliveries:v6";

  const cached = cache.get(cacheKey);
  if (cached) {
    return res.status(200).json({ customers: cached });
  }

  try {
    const db = getFirestore();

    // 1. Fetch all customers
    const customersSnap = await db.collection("customers").get();

    // 2. ⭐ OPTIMIZATION: Use cached delivery partner map (24-hour TTL)
    const deliveryManMap = await getDeliveryPartnerMapCached();

    const customersWithDeliveries = [];
    const autoFlipQueries = [];

    // Date Calculations for Hybrid Approach
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // We use Promise.all to handle potential subcollection fetches in parallel
    await Promise.all(customersSnap.docs.map(async (doc) => {
      const customerData = doc.data() || {};
      const last8Days = customerData.last8Days || {};
      let deliveries = [];
      const shouldHydrateFromSubcollection = (entry) => {
        if (!entry || typeof entry !== "object") return true;

        const hasStatus = Boolean(String(entry.status || "").trim());
        const hasTimestamp = Boolean(entry.timestamp);
        const hasAgent = Boolean(
          entry.agentName ||
          entry.agentId ||
          entry.assignedDeliverymen ||
          entry.deliveryMan,
        );
        const hasReason = entry.reason !== undefined;
        const hasTrays = entry.traysDelivered !== undefined;

        return !(hasStatus && hasTimestamp && hasAgent && hasReason && hasTrays);
      };

      if (date) {
        // First preference: use denormalized last8Days entry (cheaper).
        const entry = last8Days[date];
        if (entry) {
          const entryStatus = typeof entry === "string" ? entry : entry?.status || "";
          const entryReason = typeof entry === "object" ? entry?.reason : "";
          let subData = null;

          if (shouldHydrateFromSubcollection(entry)) {
            const deliveryDoc = await doc.ref.collection("deliveries").doc(date).get();
            if (deliveryDoc.exists) {
              subData = deliveryDoc.data() || {};
            }
          }

          const resolvedAgent =
            resolveDeliveryAgent(
              entry,
              customerData.assignedDeliverymen || customerData.deliveredBy || customerData.deliveryMan,
              deliveryManMap,
            ) ||
            resolveDeliveryAgent(
              subData,
              customerData.assignedDeliverymen || customerData.deliveredBy || customerData.deliveryMan,
              deliveryManMap,
            );

          const mergedStatus =
            entryStatus ||
            String(subData?.status || subData?.type || "")
              .trim()
              .toLowerCase();
          const subReason = subData?.checkReason || subData?.reason || "";

          deliveries = [{
            id: date,
            timestamp:
              (typeof entry === "object" ? entry?.timestamp || null : null) ||
              subData?.timestamp ||
              null,
            type: mergedStatus,
            status: mergedStatus,
            checkReason: entryReason || subReason || customerData.checkReason || "",
            traysDelivered:
              (typeof entry === "object" ? entry?.traysDelivered : null) ??
              subData?.traysDelivered ??
              customerData.traysDelivered ??
              null,
            deliveryMan: resolvedAgent,
          }];
        } else {
          // Fallback: if date entry is not in last8Days, read historical subcollection doc.
          const deliveryDoc = await doc.ref.collection("deliveries").doc(date).get();
          if (deliveryDoc.exists) {
            const d = deliveryDoc.data();
            const { status, reason } = getStatusAndReasonFromType(d.type, d.checkReason);

            const resolvedAgent = resolveDeliveryAgent(
              d,
              customerData.assignedDeliverymen || customerData.deliveredBy || customerData.deliveryMan,
              deliveryManMap,
            );

            deliveries = [{
              id: deliveryDoc.id,
              timestamp: d.timestamp || null,
              type: d.type || "",
              status: status,
              checkReason: d.checkReason || reason || "",
              traysDelivered: d.traysDelivered ?? null,
              deliveryMan: resolvedAgent,
            }];
          }
        }
      } else {
        // No specific date -> Return all recent activity from Map
        deliveries = await Promise.all(Object.entries(last8Days).map(async ([d, entry]) => {
          const entryStatus = typeof entry === "string" ? entry : entry?.status || "";
          const entryReason = typeof entry === "object" ? entry?.reason : "";
          let subData = null;

          if (shouldHydrateFromSubcollection(entry)) {
            const deliveryDoc = await doc.ref.collection("deliveries").doc(d).get();
            if (deliveryDoc.exists) {
              subData = deliveryDoc.data() || {};
            }
          }

          const resolvedAgent =
            resolveDeliveryAgent(
              entry,
              customerData.assignedDeliverymen || customerData.deliveredBy || customerData.deliveryMan,
              deliveryManMap,
            ) ||
            resolveDeliveryAgent(
              subData,
              customerData.assignedDeliverymen || customerData.deliveredBy || customerData.deliveryMan,
              deliveryManMap,
            );

          const mergedStatus =
            entryStatus ||
            String(subData?.status || subData?.type || "")
              .trim()
              .toLowerCase();
          const subReason = subData?.checkReason || subData?.reason || "";

          return {
            id: d,
            timestamp:
              (typeof entry === "object" ? entry?.timestamp || null : null) ||
              subData?.timestamp ||
              null,
            type: mergedStatus,
            status: mergedStatus,
            checkReason: entryReason || subReason || customerData.checkReason || "",
            traysDelivered:
              (typeof entry === "object" ? entry?.traysDelivered : null) ??
              subData?.traysDelivered ??
              customerData.traysDelivered ??
              null,
            deliveryMan: resolvedAgent,
          };
        }));
      }

      if (deliveries.length > 0) {
        const customerPayload = {
          id: doc.id,
          custid: customerData.custid || "",
          name: customerData.name || "",
          phone: customerData.phone || "",
          zone: customerData.zone || "UNASSIGNED",
          createdAt: customerData.createdAt || null,
          deliveries,
        };
        customersWithDeliveries.push(customerPayload);

        // ✅ AUTO-FLIP LOGIC: (Only if current date matches today)
        const todayEntry = last8Days[todayStr];
        const isDeliveredToday = (typeof todayEntry === "string" ? todayEntry : todayEntry?.status) === "delivered";

        if (isDeliveredToday && customerData.todayOverride?.status === "ON") {
          autoFlipQueries.push(
            doc.ref.update({
              "todayOverride.status": "OFF",
              "todayOverride.date": todayStr,
              "todayOverride.type": "DELIVERED"
            })
          );
        }
      }
    }));

    // Run auto-flips in background
    if (autoFlipQueries.length > 0) {
      Promise.all(autoFlipQueries).catch(err => console.error("Auto-flip error:", err));
    }

    cache.set(cacheKey, customersWithDeliveries, 300); // 5 min cache
    res.json({ customers: customersWithDeliveries });
  } catch (err) {
    console.error("getAllCustomerDeliveries Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// Controller to add a new customer with location and image
const addCustomer = async (req, res) => {
  try {
    const { name, phone, business, createdby, sales_id, lat, lng } = req.body;
    const db = getFirestore();
    const bucket = getStorage().bucket();
    const location = `Lat: ${lat}, Lng: ${lng}`;

    // Global counter
    const counterRef = db.collection("globalcounter").doc("customercounter");
    const counterDoc = await counterRef.get();
    const current = counterDoc.exists ? counterDoc.data().counter : 0;
    const custid = `${sales_id}C${current + 1}`;

    // Handle image
    const imageFile = req.file;
    if (!imageFile) {
      return res.status(400).json({ error: "Image file missing" });
    }

    const imageName = `Customer/${uuidv4()}${path.extname(imageFile.originalname)}`;
    const file = bucket.file(imageName);

    await file.save(imageFile.buffer, {
      metadata: {
        contentType: imageFile.mimetype,
      },
    });

    const [imageUrl] = await file.getSignedUrl({
      action: "read",
      expires: "03-01-2500",
    });

    const newDocRef = db.collection("customers").doc();

    await newDocRef.set({
      name,
      phone,
      business,
      imageUrl,
      createdAt: Date.now(),
      createdby,
      custid,
      location,
      zone: "UNASSIGNED",
      potential: "T1",
      remarks: "",
    });
    await counterRef.set({ counter: current + 1 });
    await invalidateCustomerInfoCache();
    await invalidateAllCustomerDeliveriesCache();
    await invalidateActiveCountCache();
    res.status(200).json({ message: "Customer added successfully" });
  } catch (error) {
    console.error("Error in addCustomer:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Invalidation helper: clears memory cache and deletes Firestore doc ────────
const invalidateActiveCountCache = async () => {
  _activeCountCache.date = null;
  _activeCountCache.count = 0;
  _activeCountCache.lastComputed = 0;
  try {
    const db = getFirestore();
    await db.collection("globalcounter").doc("dailyStats").delete();
    console.log("[CACHE INVALIDATION] Cleared daily stats activeCount cache and document");
  } catch (err) {
    console.warn("invalidateActiveCountCache failed to delete Firestore doc:", err);
  }
};

// ── Computes activeCount for today by scanning all customers (runs as 5 min sliding cache) ─
const _computeAndCacheActiveCount = async (db, todayStr) => {
  const DAILY_STATS_REF = db.collection("globalcounter").doc("dailyStats");
  const now = Date.now();

  // 1. Try stored value first (1 read)
  try {
    const statsDoc = await DAILY_STATS_REF.get();
    if (statsDoc.exists) {
      const data = statsDoc.data() || {};
      const updatedAt = data.updatedAt || 0;
      // If it is today's date AND fresh (updated within last 5 minutes), use it!
      if (
        data.date === todayStr &&
        typeof data.activeCount === "number" &&
        (now - updatedAt) < 5 * 60 * 1000
      ) {
        _activeCountCache.date = todayStr;
        _activeCountCache.count = data.activeCount;
        _activeCountCache.lastComputed = updatedAt;
        console.log(`[CACHE HIT] Active count loaded from fresh Firestore doc: ${data.activeCount}`);
        return data.activeCount;
      }
    }
  } catch (err) {
    console.warn("Error reading dailyStats from Firestore:", err);
  }

  // 2. Full scan – happens once every 5 minutes across all instances
  console.log(`[CACHE MISS] Re-scanning Firestore to compute fresh activeCount for ${todayStr}...`);
  let activeCount = 0;
  try {
    const snap = await db.collection("customers").get();
    snap.docs.forEach((doc) => {
      const d = doc.data() || {};
      const last8Days = d.last8Days || {};
      const entry = last8Days[todayStr];
      const status = typeof entry === "string" ? entry : entry?.status;

      // Delivered today → OFF regardless of override
      if (String(status || "").toLowerCase() === "delivered") return;

      // Check manual override
      const override = d.todayOverride;
      if (override) {
        const overrideDate = override.date ? String(override.date).slice(0, 10) : null;
        if (overrideDate === todayStr && String(override.status || "").toUpperCase() === "OFF") {
          return; // explicitly OFF
        }
      }

      activeCount += 1;
    });

    // Persist for future server restarts and other instances (1 write)
    await DAILY_STATS_REF.set(
      { date: todayStr, activeCount, updatedAt: now },
      { merge: true }
    );
  } catch (err) {
    console.warn("_computeAndCacheActiveCount scan failed:", err);
  }

  _activeCountCache.date = todayStr;
  _activeCountCache.count = activeCount;
  _activeCountCache.lastComputed = now;
  return activeCount;
};

// ── Public helper: called to adjust the count (e.g. during a manual toggle)
// delta = +1 (became active) or -1 (became inactive)
const adjustActiveCount = async (todayStr, delta) => {
  try {
    const db = getFirestore();
    const DAILY_STATS_REF = db.collection("globalcounter").doc("dailyStats");
    const now = Date.now();

    let currentCount = null;
    if (_activeCountCache.date === todayStr) {
      currentCount = _activeCountCache.count;
    } else {
      // Warm up cache from Firestore
      const statsDoc = await DAILY_STATS_REF.get();
      if (statsDoc.exists) {
        const data = statsDoc.data() || {};
        if (data.date === todayStr && typeof data.activeCount === "number") {
          currentCount = data.activeCount;
        }
      }
    }

    if (currentCount !== null) {
      const nextCount = Math.max(0, currentCount + delta);
      _activeCountCache.date = todayStr;
      _activeCountCache.count = nextCount;
      _activeCountCache.lastComputed = now;
      await DAILY_STATS_REF.set(
        { date: todayStr, activeCount: nextCount, updatedAt: now },
        { merge: true }
      );
      console.log(`[CACHE ADJUST] Adjusted activeCount to ${nextCount} (delta: ${delta})`);
    } else {
      // Memory and Firestore are both cold/stale. Invalidate completely
      // so that the next read will perform a full scan.
      _activeCountCache.date = null;
      await DAILY_STATS_REF.delete();
      console.log("[CACHE INVALIDATION] Both cache and doc were cold; deleted stats doc to force full scan");
    }
  } catch (err) {
    console.warn("adjustActiveCount error:", err);
  }
};

// ── GET /user-info/stats ─────────────────────────────────────────────────────
// Returns { totalCustomers, totalActive } with minimal reads:
//   • totalCustomers : count() aggregation → 1 Firestore read
//   • totalActive    : in-memory cache (fresh within 5 mins) OR 1 doc read + 1 full scan (stale/cold)
const getUserInfoStats = async (req, res) => {
  try {
    const db = getFirestore();
    const todayStr = getDateStringInTimeZone(new Date(), INDIA_TZ);

    // 1. Total customers via aggregation (1 read)
    const totalCustomers = await getTotalCustomersCount(db);

    // 2. Active count – serve from memory if already computed today and fresh
    let totalActive;
    const cacheAge = Date.now() - _activeCountCache.lastComputed;
    if (_activeCountCache.date === todayStr && cacheAge < 5 * 60 * 1000) {
      totalActive = _activeCountCache.count;
    } else {
      totalActive = await _computeAndCacheActiveCount(db, todayStr);
    }

    return res.status(200).json({ totalCustomers, totalActive });
  } catch (error) {
    console.error("getUserInfoStats error:", error);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
};

// ── GET /category-peak-potentials ──────────────────────────────────────────
const getCategoryPeakPotentials = async (req, res) => {
  try {
    const db = getFirestore();
    const INDIA_TZ = "Asia/Kolkata";

    // Get today's weekday name in IST
    const now = new Date();
    const dayIndex = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: INDIA_TZ,
    }).format(now);

    const WEEKDAY_NAMES = [
      "Sunday", "Monday", "Tuesday", "Wednesday",
      "Thursday", "Friday", "Saturday",
    ];
    const shortToIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekdayName = WEEKDAY_NAMES[shortToIndex[dayIndex] ?? now.getDay()];

    const docRef = db.collection("categoryPeakPotentials").doc(weekdayName);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(200).json({});
    }

    return res.status(200).json(docSnap.data());
  } catch (error) {
    console.error("getCategoryPeakPotentials error:", error);
    return res.status(500).json({ error: "Failed to fetch category peak potentials" });
  }
};

export {
  userInfo,
  getAISuggestionCandidates,
  specificUser,
  getUserDeliveries,
  getAllCustomerDeliveries,
  addCustomer,
  getUserInfoStats,
  getCategoryPeakPotentials,
  adjustActiveCount,
  invalidateActiveCountCache,
};
