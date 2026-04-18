import { FieldPath, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import cache from "./cache.js";

const DEFAULT_CUSTOMER_PAGE_SIZE = 15;
const MAX_CUSTOMER_PAGE_SIZE = 50;
const USER_INFO_CACHE_VERSION = "v2";
const TOTAL_CUSTOMERS_CACHE_KEY = `customerInfo:userInfo:${USER_INFO_CACHE_VERSION}:totalCustomers`;

const normalizeCustomerPriority = (value) => {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!raw) return "P0";

  if (/^P[0-7]$/.test(raw)) return raw;
  if (/^[0-7]$/.test(raw)) return `P${raw}`;

  return "P0";
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
  const raw = String(value || "").trim().toLowerCase();
  return raw === "createdAt" ? "createdAt" : "name";
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

    await cache.delAsync(TOTAL_CUSTOMERS_CACHE_KEY);

    if (customerId) {
      await cache.delAsync(`customer:${customerId}`);
    }
  } catch (error) {
    console.warn("Failed to invalidate customer info cache:", error);
  }
};

const getTotalCustomersCount = async (db) => {
  const cachedTotal = await cache.getAsync(TOTAL_CUSTOMERS_CACHE_KEY);
  if (typeof cachedTotal === "number") {
    return cachedTotal;
  }

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

  await cache.setAsync(TOTAL_CUSTOMERS_CACHE_KEY, totalCustomers, 120);
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

  const pagingKey = hasPageParam
    ? `page:${requestedPage}`
    : `cursor:${req.query.cursor || "start"}`;

  const cacheKey = isPaginatedRequest
    ? `customerInfo:userInfo:${USER_INFO_CACHE_VERSION}:limit:${limit}:sort:${sortBy}:${pagingKey}`
    : "customerInfo:userInfo";

  try {
    const cached = await cache.getAsync(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const db = getFirestore();

    if (isPaginatedRequest) {
      const totalCustomers = await getTotalCustomersCount(db);
      const totalPages = Math.max(
        1,
        Math.ceil(Number(totalCustomers || 0) / limit),
      );

      // Prefer direct page-number based navigation for random access (e.g., jump to page 5).
      if (hasPageParam) {
        const currentPage = Math.min(requestedPage, totalPages);
        const offset = (currentPage - 1) * limit;

        const snapshot = await db
          .collection("customers")
          .orderBy(FieldPath.documentId(), "asc")
          .offset(offset)
          .limit(limit)
          .get();

        const customers = snapshot.docs.map((doc) => {
          const customerData = doc.data();
          return {
            id: doc.id,
            ...customerData,
            priority: normalizeCustomerPriority(customerData?.priority),
          };
        });

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

        await cache.setAsync(cacheKey, payload, 120);
        return res.status(200).json(payload);
      }

      const cursor = decodeCursor(req.query.cursor);

      let query = db
        .collection("customers")
        .orderBy(FieldPath.documentId(), "asc")
        .limit(limit + 1);

      if (cursor) {
        const cursorDoc = await db.collection("customers").doc(cursor.lastId).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      const snapshot = await query.get();
      const docs = snapshot.docs;
      const hasNextPage = docs.length > limit;
      const pageDocs = hasNextPage ? docs.slice(0, limit) : docs;

      const customers = pageDocs.map((doc) => {
        const customerData = doc.data();
        return {
          id: doc.id,
          ...customerData,
          priority: normalizeCustomerPriority(customerData?.priority),
        };
      });

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

      await cache.setAsync(cacheKey, payload, 120);
      return res.status(200).json(payload);
    }

    const customersSnapshot = await db.collection("customers").get();
    const customers = customersSnapshot.docs.map((doc) => {
      const customerData = doc.data();
      return {
        id: doc.id,
        ...customerData,
        priority: normalizeCustomerPriority(customerData?.priority),
      };
    });

    await cache.setAsync(cacheKey, customers, 120);
    return res.status(200).json(customers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    return res.status(500).json({ error: "Failed to fetch customer data" });
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
      priority: normalizeCustomerPriority(data?.priority),
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
      const deliveredByUID = data.deliveredBy;
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
        deliveredBy: deliveredByUID,
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

// Controller to get all customers along with their deliveries
const getAllCustomerDeliveries = async (req, res) => {
  const date = req.query.date;

  const cacheKey = date
    ? `allCustomerDeliveries:${date}`
    : "allCustomerDeliveries";

  const cached = cache.get(cacheKey);

  if (cached) {
    return res.status(200).json({ customers: cached });
  }

  try {
    const db = getFirestore();

    const customersSnap = await db.collection("customers").get();

    const customersWithDeliveries = await Promise.all(
      customersSnap.docs.map(async (doc) => {
        const deliveriesCollection = db
          .collection("customers")
          .doc(doc.id)
          .collection("deliveries");

        let deliveries = [];

        if (date) {
          const deliveryDoc = await deliveriesCollection.doc(date).get();

          if (deliveryDoc.exists) {
            const data = deliveryDoc.data();
            const { status, reason } = getStatusAndReasonFromType(
              data.type,
              data.checkReason,
            );
            let deliveryMan = null;

            if (data.deliveredBy) {
              const manDoc = await db
                .collection("DeliveryMan")
                .doc(data.deliveredBy)
                .get();

              if (manDoc.exists) {
                const manData = manDoc.data();
                deliveryMan = {
                  name: manData.name || "",
                  phone: manData.phone || "",
                };
              }
            }

            deliveries = [
              {
                id: deliveryDoc.id,
                ...data,
                status,
                reason,
                deliveryMan,
              },
            ];
          }
        } else {
          const deliveriesSnap = await deliveriesCollection.get();
          deliveries = await Promise.all(
            deliveriesSnap.docs.map(async (d) => {
              const data = d.data();
              const { status, reason } = getStatusAndReasonFromType(
                data.type,
                data.checkReason,
              );
              let deliveryMan = null;

              if (data.deliveredBy) {
                const manDoc = await db
                  .collection("DeliveryMan")
                  .doc(data.deliveredBy)
                  .get();

                if (manDoc.exists) {
                  const manData = manDoc.data();
                  deliveryMan = {
                    name: manData.name || "",
                    phone: manData.phone || "",
                  };
                }
              }

              return {
                id: d.id,
                ...data,
                status,
                reason,
                deliveryMan,
              };
            }),
          );
        }

        return {
          id: doc.id,
          ...doc.data(),
          deliveries,
        };
      }),
    );

    // ✅ Auto-flip todayOverride to OFF when delivery is marked DELIVERED (if currently ON)
    const getDateStringInTimeZone = (
      dateObj = new Date(),
      timeZone = "Asia/Kolkata",
    ) => {
      try {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(dateObj);

        const year = parts.find((p) => p.type === "year")?.value;
        const month = parts.find((p) => p.type === "month")?.value;
        const day = parts.find((p) => p.type === "day")?.value;

        if (year && month && day) return `${year}-${month}-${day}`;
      } catch (e) {
        // fall through
      }

      return new Date().toISOString().slice(0, 10);
    };

    const todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata");
    const queries = [];

    for (const customer of customersWithDeliveries) {
      const deliveries = customer.deliveries || [];

      const todayDelivered = deliveries.some(
        (d) => d.id === todayDate && d.type === "delivered",
      );

      if (todayDelivered) {
        const currentOverride = customer.todayOverride || {};
        const currentStatus = String(
          currentOverride.status || "",
        ).toUpperCase();

        if (currentStatus === "ON") {
          const customerRef = db.collection("customers").doc(customer.id);
          queries.push(
            customerRef.update({
              todayOverride: {
                date: todayDate,
                status: "OFF",
              },
            }),
          );
        }
      }
    }

    if (queries.length > 0) {
      await Promise.all(queries);
      cache.del(cacheKey);
      if (date) {
        cache.del("allCustomerDeliveries");
      }
    }

    cache.set(cacheKey, customersWithDeliveries, 300);

    res.json({ customers: customersWithDeliveries });
  } catch (err) {
    console.error("API Error:", err);
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
      priority: "P0",
      remarks: "",
    });
    await counterRef.set({ counter: current + 1 });
    await invalidateCustomerInfoCache();
    res.status(200).json({ message: "Customer added successfully" });
  } catch (error) {
    console.error("Error in addCustomer:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export {
  userInfo,
  specificUser,
  getUserDeliveries,
  getAllCustomerDeliveries,
  addCustomer,
};
