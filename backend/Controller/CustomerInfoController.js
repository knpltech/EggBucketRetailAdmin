import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import cache from "./cache.js";

const normalizeCustomerPriority = (value) => {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!raw) return "P0";

  if (/^P[0-7]$/.test(raw)) return raw;
  if (/^[0-7]$/.test(raw)) return `P${raw}`;

  return "P0";
};

const normalizeCustomerPotential = (value) => {
  const VALID_POTENTIALS = [
    "T 1","T 2","T 3","T 4","T 5","T 6","T 7",
    "T 8","T 9","T 10","T 15","T 20","T 25","T 30",
    "T 50","T 100",
  ];

  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!raw) return "T 1";

  if (VALID_POTENTIALS.includes(raw)) return raw;

  // Handle legacy format without space (T1 -> T 1)
  const withSpace = raw.replace(/T(\d+)/, "T $1");
  if (VALID_POTENTIALS.includes(withSpace)) return withSpace;

  return "T 1";
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

const invalidateCustomerInfoCache = (customerId) => {
  try {
    cache.del("customerInfo:userInfo");
    if (customerId) {
      cache.del(`customer:${customerId}`);
    }
  } catch (error) {
    console.warn("Failed to invalidate customer info cache:", error);
  }
};

// Fetches all customer information
const userInfo = async (req, res) => {
  const cacheKey = "customerInfo:userInfo";

  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const db = getFirestore();
    const customersSnapshot = await db.collection("customers").get();
    const customers = [];

    for (const doc of customersSnapshot.docs) {
      const customerData = doc.data();

      customers.push({
        id: doc.id,
        ...customerData,
        priority: normalizeCustomerPriority(customerData?.priority),
        potential: normalizeCustomerPotential(customerData?.potential),
      });
    }

    cache.set(cacheKey, customers, 120);
    res.status(200).json(customers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ error: "Failed to fetch customer data" });
  }
};

// Gets details for a specific customer by ID
const specificUser = async (req, res) => {
  try {
    const db = getFirestore();
    const userId = req.params.id;

    const cacheKey = `customer:${userId}`;
    const cached = cache.get(cacheKey);
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
      potential: normalizeCustomerPotential(data?.potential),
    };
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
      potential: "T 1",
      remarks: "",
    });
    await counterRef.set({ counter: current + 1 });
    invalidateCustomerInfoCache();
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
