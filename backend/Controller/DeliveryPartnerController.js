import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import cache from "./cache.js";

// Controller to add a new delivery partner
const addDeliveryPartner = async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const phone = req.body.phone?.trim();
    const outlet = req.body.outlet?.trim();
    const password = req.body.password;

    if (!name || !phone || !outlet || !password) {
      return res
        .status(400)
        .json({ message: "Name, phone number, outlet, and password are required." });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least six characters." });
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
      outlet,
      email,
      password,
      active: true,
    });

    // ⭐ OPTIMIZATION: Invalidate delivery partners cache on add
    cache.del("allDeliveryPartners:v1");
    cache.del("deliveryPartnerMap:v1");

    res.status(201).json({ message: "Delivery partner added successfully." });
  } catch (err) {
    console.error("Error adding delivery partner:", err);
    res
      .status(500)
      .json({ message: "Server error while adding delivery partner." });
  }
};

// Controller to fetch all delivery partners
const getDeliveryPartners = async (req, res) => {
  try {
    // ⭐ OPTIMIZATION: Cache delivery partners for 5 minutes (300 seconds)
    const cacheKey = "allDeliveryPartners:v1";
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log("[CACHE HIT] Delivery partners served from cache");
      return res.status(200).json(cached);
    }

    console.log("[CACHE MISS] Fetching delivery partners from Firestore");
    const db = getFirestore();
    const snapshot = await db.collection("DeliveryMan").get();

    const deliveryPartners = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Cache for 5 minutes
    cache.set(cacheKey, deliveryPartners, 300);
    res.status(200).json(deliveryPartners);
  } catch (err) {
    console.error("Error fetching delivery partners:", err);
    res.status(500).json({ message: "Failed to fetch delivery partners." });
  }
};

// Controller to update a delivery partner's details
const updateDeliveryPartner = async (req, res) => {
  try {
    const { uid, name, phone, outlet } = req.body;
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
    const updateData = {
      name,
      phone,
      email: newEmail,
    };

    if (outlet !== undefined) {
      updateData.outlet = outlet;
    }

    await db.collection("DeliveryMan").doc(uid).update(updateData);

    // ⭐ OPTIMIZATION: Invalidate delivery partners cache on update
    cache.del("allDeliveryPartners:v1");
    cache.del("deliveryPartnerMap:v1");

    res.status(200).json({ message: "Delivery partner updated successfully." });
  } catch (err) {
    console.error("Error updating delivery partner:", err);
    res
      .status(500)
      .json({ message: "Server error while updating delivery partner." });
  }
};

// Controller to assign route to a delivery partner
const assignRouteToDeliveryPartner = async (req, res) => {
  try {
    const { uid, route } = req.body;
    if (!uid) {
      return res.status(400).json({ message: "UID is required." });
    }
    if (!route) {
      return res.status(400).json({ message: "Route is required." });
    }

    const db = getFirestore();
    const batch = db.batch();
    const snapshot = await db.collection("DeliveryMan").get();

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const currentRoute = data.route || "";

      if (doc.id === uid) {
        let newRouteValue = route;
        if (currentRoute) {
          const routesList = currentRoute.split(",").map((r) => r.trim()).filter(Boolean);
          if (!routesList.includes(route)) {
            routesList.push(route);
          }
          newRouteValue = routesList.join(",");
        }
        batch.update(doc.ref, { route: newRouteValue });
      } else {
        if (currentRoute) {
          const routesList = currentRoute.split(",").map((r) => r.trim()).filter(Boolean);
          if (routesList.includes(route)) {
            const updatedList = routesList.filter((r) => r !== route);
            batch.update(doc.ref, { route: updatedList.join(",") });
          }
        }
      }
    });

    await batch.commit();

    // ⭐ OPTIMIZATION: Invalidate delivery partners cache on update
    cache.del("allDeliveryPartners:v1");
    cache.del("deliveryPartnerMap:v1");

    res.status(200).json({ message: "Route assigned to delivery partner successfully." });
  } catch (err) {
    console.error("Error assigning route to delivery partner:", err);
    res.status(500).json({ message: "Server error while assigning route." });
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

    // ⭐ OPTIMIZATION: Invalidate delivery partners cache on delete
    cache.del("allDeliveryPartners:v1");
    cache.del("deliveryPartnerMap:v1");

    res.status(200).json({ message: "Delivery partner deleted successfully." });
  } catch (err) {
    console.error("Error deleting delivery partner:", err);
    res
      .status(500)
      .json({ message: "Server error while deleting delivery partner." });
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

    // ⭐ OPTIMIZATION: Invalidate delivery partners cache on status change
    cache.del("allDeliveryPartners:v1");
    cache.del("deliveryPartnerMap:v1");

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

export {
  addDeliveryPartner,
  getDeliveryPartners,
  updateDeliveryPartner,
  assignRouteToDeliveryPartner,
  deleteDeliveryPartner,
  toggleDeliveryPerson,
};
