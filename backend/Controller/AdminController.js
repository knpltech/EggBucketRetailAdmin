import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import axios from "axios";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import cache from "./cache.js";

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
      return res.status(200).json({ message: "Login successful" });
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
      return res
        .status(400)
        .json({
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
      return res
        .status(400)
        .json({
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
  const cacheKey = "allCustomerDeliveries";
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.status(200).json({ customers: cached });
  }

  try {
    const db = getFirestore();
    const customersSnapshot = await db.collection("customers").get();

    if (customersSnapshot.empty) {
      return res.status(404).json({ error: "No customers found." });
    }

    const customersWithDeliveries = [];

    for (const customerDoc of customersSnapshot.docs) {
      const customerData = customerDoc.data();
      const customerId = customerDoc.id;

      const deliveriesSnapshot = await db
        .collection("customers")
        .doc(customerId)
        .collection("deliveries")
        .get();

      const deliveries = [];

      for (const deliveryDoc of deliveriesSnapshot.docs) {
        const deliveryData = deliveryDoc.data();
        const deliveredByUID = deliveryData.deliveredBy;

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
          id: deliveryDoc.id,
          ...deliveryData,
          deliveryMan,
        });
      }

      customersWithDeliveries.push({
        id: customerId,
        ...customerData,
        deliveries,
      });
    }

    cache.set(cacheKey, customersWithDeliveries); // ✅ cache it
    res.status(200).json({ customers: customersWithDeliveries });
  } catch (error) {
    console.error("Error fetching customers with deliveries:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching customer deliveries." });
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

    // 🔥 Cache check
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const db = getFirestore();

    // 🎯 TODAY (start of day)
    const targetDate = new Date();
    targetDate.setHours(0, 0, 0, 0);

    const customersSnap = await db.collection("customers").get();
    const result = [];

    for (const doc of customersSnap.docs) {
      const c = doc.data();
      if (!c.location) continue;

      // 📍 Parse lat/lng
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

const resetAllCustomers = async (req, res) => {
  try {
    const db = getFirestore();

    // ================= RESET CUSTOMERS =================
    const customerSnap = await db.collection("customers").get();

    if (!customerSnap.empty) {
      const customerBatch = db.batch();

      customerSnap.docs.forEach((doc) => {
        const ref = db.collection("customers").doc(doc.id);
        customerBatch.update(ref, {
          paid: false,
          category: null,
          remarks: "",
          zone: null, // ✅ RESET ZONE FIELD
        });
      });

      await customerBatch.commit();
    }

    // ================= DELETE ALL ZONES =================
    const zoneSnap = await db.collection("zones").get();

    if (!zoneSnap.empty) {
      const zoneBatch = db.batch();

      zoneSnap.docs.forEach((doc) => {
        const ref = db.collection("zones").doc(doc.id);
        zoneBatch.delete(ref); // ✅ DELETE ZONE DOC
      });

      await zoneBatch.commit();
    }

    return res.status(200).json({
      message: "All customers and zones reset successfully",
      customers: customerSnap.size,
      zones: zoneSnap.size,
    });
  } catch (err) {
    console.error("Reset all error:", err);
    return res.status(500).json({ error: "Failed to reset system" });
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
  resetAllCustomers,
  addZone,
  getZones,
};
