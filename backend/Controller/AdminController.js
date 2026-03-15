import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import axios from "axios";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import cache from "./cache.js";
import { signAuthToken } from "../utils/jwt.js";

// Handles user login with username, password, and role
const login = async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const db = getFirestore();
    const docRef = db.collection("Authentication").doc(role);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ message: "Role not found" });
    }

    const userData = doc.data();

    if (userData.username === username && userData.password === password) {
      const token = signAuthToken({ role, username });
      return res.status(200).json({
        message: "Login successful",
        token,
        role,
      });
    }

    return res.status(401).json({ message: "Invalid username or password" });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// Fetches all customer information
const userInfo = async (req, res) => {
  //   const cacheKey = 'userInfo';
  //   const cached = cache.get(cacheKey);

  //   if (cached) {
  //     return res.status(200).json(cached);
  //   }

  try {
    const db = getFirestore();
    const customersSnapshot = await db.collection("customers").get();
    const customers = [];

    for (const doc of customersSnapshot.docs) {
      const customerData = doc.data();

      customers.push({
        id: doc.id,
        ...customerData,
      });
    }

    // cache.set(cacheKey, customers);
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

    const userDoc = await db.collection("customers").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.status(200).json({ id: userDoc.id, ...userDoc.data() });
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({ error: "Failed to fetch customer data" });
  }
};

// Utility to delete a subcollection (since Firestore doesn't auto-delete subcollections)
const deleteSubcollection = async (parentDocRef, subcollectionName) => {
  const subcollectionSnapshot = await parentDocRef
    .collection(subcollectionName)
    .get();

  const batch = getFirestore().batch();
  subcollectionSnapshot.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();
};

// Deletes a customer document by ID
const deleteCustomer = async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ message: "Customer ID is required" });
  }

  try {
    const db = getFirestore();
    const customerRef = db.collection("customers").doc(id);

    const customerDoc = await customerRef.get();

    if (!customerDoc.exists) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Optionally delete subcollections (like 'deliveries')
    // await deleteSubcollection(customerRef, 'deliveries');

    await customerRef.delete();

    return res.status(200).json({ message: "Customer deleted successfully" });
  } catch (error) {
    console.error("Error deleting customer:", error);
    return res.status(500).json({ message: "Failed to delete customer" });
  }
};

// Updates customer information (name, business, phone)
const updateCustomer = async (req, res) => {
  const { id, name, business, phone } = req.body;
  if (!id || !name || !business || !phone) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const db = getFirestore();
    const customerRef = db.collection("customers").doc(id);

    const customerDoc = await customerRef.get();

    if (!customerDoc.exists) {
      return res.status(404).json({ message: "Customer not found" });
    }

    await customerRef.update({ name, business, phone });

    return res.status(200).json({ message: "Customer updated successfully" });
  } catch (error) {
    console.error("Error updating customer:", error);
    return res.status(500).json({ message: "Failed to update customer" });
  }
};

// Controller to add a new delivery partner
const addDeliveryPartner = async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) {
      return res
        .status(400)
        .json({ message: "Name, phone number, and password are required." });
    }

    const db = getFirestore();
    const email = `${phone}@eggbucketdelivery.in`;

    try {
      await admin.auth().getUserByEmail(email);
      return res.status(400).json({
        message: "A delivery partner with this phone number already exists.",
      });
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        throw error;
      }
    }
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    await db.collection("DeliveryMan").doc(userRecord.uid).set({
      uid: userRecord.uid,
      name,
      phone,
      email,
      password,
      active: true,
    });

    res.status(201).json({ message: "Delivery partner added successfully." });
  } catch (err) {
    console.error("Error adding delivery partner:", err);
    res
      .status(500)
      .json({ message: "Server error while adding delivery partner." });
  }
};

// Controller to add a new salesperson
const addSalesPerson = async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res
        .status(400)
        .json({ message: "Name, phone number, and password are required." });
    }

    const db = getFirestore();
    const email = `${phone}@eggbucketsales.in`;

    // Check if user already exists
    try {
      await admin.auth().getUserByEmail(email);
      return res.status(400).json({
        message: "A salesperson with this phone number already exists.",
      });
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        throw error;
      }
    }

    const docSnap = await db
      .collection("globalcounter")
      .doc("salescounter")
      .get();
    const counterData = docSnap.data();
    const currentCount = counterData?.counter || 0;

    // Create the user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    await db
      .collection("Salesman")
      .doc(userRecord.uid)
      .set({
        uid: userRecord.uid,
        name,
        phone,
        email,
        password,
        sales_id: `S${currentCount + 1}`,
        active: true,
      });

    await db
      .collection("globalcounter")
      .doc("salescounter")
      .update({
        counter: currentCount + 1,
      });

    res.status(201).json({ message: "Salesperson added successfully." });
  } catch (err) {
    console.error("Error adding salesperson:", err);
    res.status(500).json({ message: "Server error while adding salesperson." });
  }
};

// Controller to fetch all delivery partners
const getDeliveryPartners = async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection("DeliveryMan").get();

    const deliveryPartners = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(deliveryPartners);
  } catch (err) {
    console.error("Error fetching delivery partners:", err);
    res.status(500).json({ message: "Failed to fetch delivery partners." });
  }
};

// Controller to fetch all sales partners
const getSalesPartners = async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection("Salesman").get();

    const salesPartners = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(salesPartners);
  } catch (err) {
    console.error("Error fetching sales partners:", err);
    res.status(500).json({ message: "Failed to fetch sales partners." });
  }
};

// Controller to update a delivery partner's details
const updateDeliveryPartner = async (req, res) => {
  try {
    const { uid, name, phone } = req.body;
    if (!uid || !name || !phone) {
      return res
        .status(400)
        .json({ message: "UID, name, and phone number are required." });
    }
    const newEmail = `${phone}@eggbucketdelivery.in`;
    await admin.auth().updateUser(uid, {
      email: newEmail,
      displayName: name,
    });

    const db = getFirestore();
    await db.collection("DeliveryMan").doc(uid).update({
      name,
      phone,
      email: newEmail,
    });

    res.status(200).json({ message: "Delivery partner updated successfully." });
  } catch (err) {
    console.error("Error updating delivery partner:", err);
    res
      .status(500)
      .json({ message: "Server error while updating delivery partner." });
  }
};

// Controller to update a salesperson's details
const updateSalesPartner = async (req, res) => {
  try {
    const { uid, name, phone } = req.body;
    if (!uid || !name || !phone) {
      return res
        .status(400)
        .json({ message: "UID, name, and phone number are required." });
    }
    const newEmail = `${phone}@eggbucketsales.in`;
    await admin.auth().updateUser(uid, {
      email: newEmail,
      displayName: name,
    });

    await getFirestore().collection("Salesman").doc(uid).update({
      name,
      phone,
      email: newEmail,
    });

    res.status(200).json({ message: "Salesperson updated successfully." });
  } catch (err) {
    console.error("Error updating salesperson:", err);
    res
      .status(500)
      .json({ message: "Server error while updating salesperson." });
  }
};

// Controller to delete a delivery partner
const deleteDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.body;
    const db = getFirestore();
    const docRef = db.collection("DeliveryMan").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ message: "Delivery partner not found." });
    }

    const { uid } = docSnap.data();
    await docRef.delete();

    if (uid) {
      await admin.auth().deleteUser(uid);
    }

    res.status(200).json({ message: "Delivery partner deleted successfully." });
  } catch (err) {
    console.error("Error deleting delivery partner:", err);
    res
      .status(500)
      .json({ message: "Server error while deleting delivery partner." });
  }
};

// Controller to delete a sales partner
const deleteSalesPartner = async (req, res) => {
  try {
    const { id } = req.body;
    const db = getFirestore();
    const docRef = db.collection("Salesman").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ message: "Sales partner not found." });
    }
    const { uid } = docSnap.data();
    await docRef.delete();
    if (uid) {
      await admin.auth().deleteUser(uid);
    }

    res.status(200).json({ message: "Sales partner deleted successfully." });
  } catch (err) {
    console.error("Error deleting sales partner:", err);
    res
      .status(500)
      .json({ message: "Server error while deleting sales partner." });
  }
};

// Controller to toggle delivery partner active/inactive status
const toggleDeliveryPerson = async (req, res) => {
  try {
    const { id } = req.params;
    const db = getFirestore();

    const deliveryRef = db.collection("DeliveryMan").doc(id);
    const docSnap = await deliveryRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ message: "Delivery person not found." });
    }

    const currentStatus = docSnap.data().active;
    await deliveryRef.update({ active: !currentStatus });

    res.status(200).json({
      message: `Delivery person status updated to ${!currentStatus ? "active" : "inactive"}.`,
      active: !currentStatus,
    });
  } catch (err) {
    console.error("Error toggling delivery person status:", err);
    res
      .status(500)
      .json({ message: "Server error while toggling delivery person status." });
  }
};

// Controller to toggle salesperson active/inactive status
const toggleSalesPerson = async (req, res) => {
  try {
    const { id } = req.params;
    const db = getFirestore();

    const salesRef = db.collection("Salesman").doc(id);
    const docSnap = await salesRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ message: "Salesperson not found." });
    }

    const currentStatus = docSnap.data().active;
    await salesRef.update({ active: !currentStatus });

    res.status(200).json({
      message: `Salesperson status updated to ${!currentStatus ? "active" : "inactive"}.`,
      active: !currentStatus,
    });
  } catch (err) {
    console.error("Error toggling salesperson status:", err);
    res
      .status(500)
      .json({ message: "Server error while toggling salesperson status." });
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
        checkReason: data.checkReason || "",
        traysDelivered:
          typeof data.traysDelivered === "number" ? data.traysDelivered : null,
        deliveryMan,
      });
    }

    cache.set(cacheKey, deliveries); // ✅ cache it
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
  const date = req.query.date; // from frontend

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

        // FILTER BY DATE - Use doc() when date is provided
        if (date) {
          const deliveryDoc = await deliveriesCollection.doc(date).get();

          if (deliveryDoc.exists) {
            const data = deliveryDoc.data();
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
                deliveryMan,
              },
            ];
          }
        } else {
          // Get all deliveries when no date filter
          const deliveriesSnap = await deliveriesCollection.get();
          deliveries = await Promise.all(
            deliveriesSnap.docs.map(async (d) => {
              const data = d.data();
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
      category: "RETENTION",
      zone: "UNASSIGNED",
      paid: false,
      remarks: "",
    });
    await counterRef.set({ counter: current + 1 });
    res.status(200).json({ message: "Customer added successfully" });
  } catch (error) {
    console.error("Error in addCustomer:", error);
    res.status(500).json({ error: "Internal server error" });
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
    const { id, category, paid, remarks, zone } = req.body;

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

    // ✅ CATEGORY — allow change anytime
    if (category !== undefined) {
      updateData.category = category;
    }

    // ✅ ZONE — allow change anytime
    if (zone !== undefined) {
      updateData.zone = zone;
    }

    // ✅ PAID
    if (paid !== undefined) updateData.paid = paid;

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

const getAnalyticsLast7 = async (req, res) => {
  const cacheKey = "analytics:last7";

  // Cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.status(200).json({ customers: cached });
  }

  try {
    const db = getFirestore();

    // Today 00:00
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 7 days ago
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    // Get customers
    const customersSnap = await db.collection("customers").get();

    if (customersSnap.empty) {
      return res.json({ customers: [] });
    }

    // Parallel
    const customers = await Promise.all(
      customersSnap.docs.map(async (doc) => {
        const c = doc.data();

        // Get only last 7 days deliveries
        const deliveriesSnap = await db
          .collection("customers")
          .doc(doc.id)
          .collection("deliveries")
          .where("timestamp", ">=", sevenDaysAgo)
          .get();

        const deliveries = deliveriesSnap.docs.map((d) => {
          const data = d.data();
          return {
            timestamp: data.timestamp,
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
//  Auto assign category for ONE customer
const autoAssignCategoryForCustomer = async (customerId) => {
  const db = getFirestore();

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  fourteenDaysAgo.setHours(0, 0, 0, 0);

  const customerRef = db.collection("customers").doc(customerId);

  const snap = await customerRef
    .collection("deliveries")
    .where("timestamp", ">=", fourteenDaysAgo)
    .where("type", "==", "delivered")
    .select("timestamp")
    .get();

  const count = snap.size;

  let category = "RETENTION";

  if (count >= 5) {
    category = "REGULAR";
  } else if (count >= 2) {
    category = "FOLLOW-UP";
  }

  await customerRef.update({ category });

  return category;
};
const recalculateAllCategories = async (req, res) => {
  try {
    const db = getFirestore();

    const customersSnap = await db.collection("customers").get();

    if (customersSnap.empty) {
      return res.json({ message: "No customers found" });
    }

    const BATCH_SIZE = 25;
    let updated = 0;

    const docs = customersSnap.docs;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE);

      const results = await Promise.all(
        batch.map((doc) => autoAssignCategoryForCustomer(doc.id)),
      );

      updated += results.filter(Boolean).length;
    }

    return res.status(200).json({
      message: "Recalculation completed",
      updated,
    });
  } catch (err) {
    console.error("Recalculate error:", err);

    return res.status(500).json({
      message: "Failed to recalculate categories",
    });
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

        return {
          id: doc.id,
          ...doc.data(),
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

const getCustomersByDeliveryCount = async (req, res) => {
  try {
    const db = getFirestore();
    const countFilter = Number(req.query.count);

    if (isNaN(countFilter)) {
      return res.status(400).json({ message: "Invalid count value" });
    }

    // Today start
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Yesterday
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    // 7 days before yesterday
    const sevenDaysAgo = new Date(yesterday);
    sevenDaysAgo.setDate(yesterday.getDate() - 6);

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

      // Only count delivered and within range
      if (
        deliveryDate >= sevenDaysAgo &&
        deliveryDate <= yesterday &&
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
        result.push({
          id: customerId,
          ...doc.data(),
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

      // Initialize array
      if (!customerDeliveries[customerId]) {
        customerDeliveries[customerId] = [];
      }

      // Keep only deliveries that have remark data
      if (
        (data.type === "reached" && data.checkReason) ||
        (data.type === "delivered" && typeof data.traysDelivered === "number")
      ) {
        customerDeliveries[customerId].push({
          docId,
          type: data.type,
          checkReason: data.checkReason,
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

      if (latest.type === "reached" && latest.checkReason) {
        remarks[customerId] = latest.checkReason;
      } else if (
        latest.type === "delivered" &&
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
export {
  login,
  userInfo,
  specificUser,
  deleteCustomer,
  updateCustomer,
  addDeliveryPartner,
  addSalesPerson,
  getDeliveryPartners,
  getSalesPartners,
  updateDeliveryPartner,
  updateSalesPartner,
  deleteDeliveryPartner,
  deleteSalesPartner,
  getUserDeliveries,
  getAllCustomerDeliveries,
  toggleDeliveryPerson,
  toggleSalesPerson,
  addCustomer,
  getCustomerMapStatus,
  updateCustomerMeta,
  addZone,
  getZones,
  getAnalyticsLast7,
  recalculateAllCategories,
  autoAssignCategoryForCustomer,
  getAllCustomerDeliveriesRange,
  getCustomersByDeliveryCount,
  saveCheckedReason,
  resetAllCheckedReasons,
  saveDeliveredTrays,
  getLatestRemarks,
};
