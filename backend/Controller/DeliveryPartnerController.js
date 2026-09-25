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

// Controller to assign route to a delivery partner (supports multiple agents per route)
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
    const docRef = db.collection("DeliveryMan").doc(uid);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ message: "Delivery partner not found." });
    }

    const data = docSnap.data();
    const currentRoute = data.route || "";
    const routesList = currentRoute ? currentRoute.split(",").map((r) => r.trim()).filter(Boolean) : [];

    if (!routesList.includes(route)) {
      routesList.push(route);
      await docRef.update({ route: routesList.join(",") });
    }

    // ⭐ OPTIMIZATION: Invalidate delivery partners cache on update
    cache.del("allDeliveryPartners:v1");
    cache.del("deliveryPartnerMap:v1");

    res.status(200).json({ message: "Route assigned to delivery partner successfully." });
  } catch (err) {
    console.error("Error assigning route to delivery partner:", err);
    res.status(500).json({ message: "Server error while assigning route." });
  }
};

// Controller to unassign/remove a route from a delivery partner
const unassignRouteFromDeliveryPartner = async (req, res) => {
  try {
    const { uid, route } = req.body;
    if (!uid || !route) {
      return res.status(400).json({ message: "UID and Route are required." });
    }

    const db = getFirestore();
    let docRef = db.collection("DeliveryMan").doc(uid);
    let docSnap = await docRef.get();

    if (!docSnap.exists) {
      const querySnap = await db.collection("DeliveryMan").where("uid", "==", uid).get();
      if (!querySnap.empty) {
        docRef = querySnap.docs[0].ref;
        docSnap = querySnap.docs[0];
      } else {
        const queryName = await db.collection("DeliveryMan").where("name", "==", uid).get();
        if (!queryName.empty) {
          docRef = queryName.docs[0].ref;
          docSnap = queryName.docs[0];
        } else {
          return res.status(404).json({ message: "Delivery partner not found." });
        }
      }
    }

    const data = docSnap.data();
    const currentRoute = data.route || "";
    const routesList = currentRoute ? currentRoute.split(",").map((r) => r.trim()).filter(Boolean) : [];
    const updatedList = routesList.filter((r) => r !== route);

    await docRef.update({ route: updatedList.join(",") });

    // Also unassign customers in that route that are assigned to this deliveryman
    const custSnap = await db.collection("customers").where("route", "==", route).get();
    if (!custSnap.empty) {
      const batch = db.batch();
      let hasCustomerUpdates = false;
      custSnap.forEach((cDoc) => {
        const cData = cDoc.data();
        if (
          cData.assignedDeliverymen === uid ||
          cData.assignedDeliverymen === data.name ||
          cData.assignedDeliverymen === data.uid ||
          cData.deliveredBy === uid ||
          cData.deliveredBy === data.name ||
          cData.deliveredBy === data.uid
        ) {
          batch.update(cDoc.ref, {
            assignedDeliverymen: "",
            deliveredBy: "",
          });
          hasCustomerUpdates = true;
        }
      });
      if (hasCustomerUpdates) {
        await batch.commit();
      }
    }

    // ⭐ OPTIMIZATION: Invalidate delivery partners cache on update
    cache.del("allDeliveryPartners:v1");
    cache.del("deliveryPartnerMap:v1");

    res.status(200).json({ message: "Route unassigned from delivery partner successfully." });
  } catch (err) {
    console.error("Error unassigning route from delivery partner:", err);
    res.status(500).json({ message: "Server error while unassigning route." });
  }
};

// Controller to reset routes for all agents or a specific agent
const resetDeliveryPartnerRoutes = async (req, res) => {
  try {
    const { agentId } = req.body; // if agentId is "ALL" or empty, resets all agents
    const db = getFirestore();
    const batch = db.batch();

    const isAll = !agentId || agentId === "ALL" || agentId === "all";

    const deliverySnap = await db.collection("DeliveryMan").get();
    const targetAgentIds = new Set();
    const targetAgentNames = new Set();

    deliverySnap.docs.forEach((doc) => {
      const data = doc.data();
      if (isAll || doc.id === agentId || data.uid === agentId || data.name === agentId) {
        batch.update(doc.ref, { route: "" });
        targetAgentIds.add(doc.id);
        if (data.uid) targetAgentIds.add(data.uid);
        if (data.name) targetAgentNames.add(data.name);
      }
    });

    await batch.commit();

    // Also clear customer assignedDeliverymen for targeted agents
    const customersSnap = await db.collection("customers").get();
    if (!customersSnap.empty) {
      const customerDocs = customersSnap.docs;
      const chunkSize = 450;
      for (let i = 0; i < customerDocs.length; i += chunkSize) {
        const chunk = customerDocs.slice(i, i + chunkSize);
        const cBatch = db.batch();
        let chunkHasUpdates = false;

        chunk.forEach((cDoc) => {
          const cData = cDoc.data();
          const currAgent = cData.assignedDeliverymen || cData.deliveredBy;
          if (
            currAgent &&
            (isAll || targetAgentIds.has(currAgent) || targetAgentNames.has(currAgent))
          ) {
            cBatch.update(cDoc.ref, {
              assignedDeliverymen: "",
              deliveredBy: "",
            });
            chunkHasUpdates = true;
          }
        });

        if (chunkHasUpdates) {
          await cBatch.commit();
        }
      }
    }

    cache.del("allDeliveryPartners:v1");
    cache.del("deliveryPartnerMap:v1");

    res.status(200).json({
      message: isAll
        ? "Routes reset for all agents successfully."
        : "Routes reset for the selected agent successfully.",
    });
  } catch (err) {
    console.error("Error resetting routes:", err);
    res.status(500).json({ message: "Server error while resetting routes." });
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

// Controller to set the exact list of assigned agents for given route(s)
const setRouteAgents = async (req, res) => {
  try {
    const { route, routes, agentIds = [], assignToCustomers = true } = req.body;
    const targetRoutes = Array.isArray(routes) && routes.length > 0 ? routes : route ? [route] : [];

    if (targetRoutes.length === 0) {
      return res.status(400).json({ message: "At least one route is required." });
    }

    const db = getFirestore();
    const batch = db.batch();
    const deliverySnap = await db.collection("DeliveryMan").get();

    const selectedAgentIdSet = new Set(agentIds);
    const assignedAgentNames = new Set();
    const assignedAgentIds = new Set();

    deliverySnap.docs.forEach((doc) => {
      const data = doc.data();
      const currentRoute = data.route || "";
      const routesList = currentRoute ? currentRoute.split(",").map((r) => r.trim()).filter(Boolean) : [];

      const isSelected =
        selectedAgentIdSet.has(doc.id) ||
        (data.uid && selectedAgentIdSet.has(data.uid)) ||
        (data.name && selectedAgentIdSet.has(data.name));

      let updatedList = [...routesList];

      if (isSelected) {
        targetRoutes.forEach((rName) => {
          if (!updatedList.includes(rName)) {
            updatedList.push(rName);
          }
        });
        assignedAgentIds.add(doc.id);
        if (data.uid) assignedAgentIds.add(data.uid);
        if (data.name) assignedAgentNames.add(data.name);
      } else {
        // Unassign targetRoutes from this agent
        updatedList = updatedList.filter((r) => !targetRoutes.includes(r));
      }

      batch.update(doc.ref, { route: updatedList.join(",") });
    });

    await batch.commit();

    // If assignToCustomers is requested, update customers in target routes
    if (assignToCustomers) {
      for (const rName of targetRoutes) {
        const custSnap = await db.collection("customers").where("route", "==", rName).get();
        if (!custSnap.empty) {
          const custDocs = custSnap.docs;
          const chunkSize = 450;
          for (let i = 0; i < custDocs.length; i += chunkSize) {
            const chunk = custDocs.slice(i, i + chunkSize);
            const cBatch = db.batch();

            chunk.forEach((cDoc) => {
              const cData = cDoc.data();
              const currAgent = cData.assignedDeliverymen || cData.deliveredBy || "";

              if (agentIds.length === 0) {
                // All unassigned
                cBatch.update(cDoc.ref, { assignedDeliverymen: "", deliveredBy: "" });
              } else if (agentIds.length === 1) {
                // Exactly 1 agent selected: assign that 1 agent to all customers in this route
                const primaryAgent = agentIds[0];
                cBatch.update(cDoc.ref, { assignedDeliverymen: primaryAgent, deliveredBy: primaryAgent });
              } else {
                // Multiple agents: if customer already belongs to one of the selected agents, keep them! Otherwise assign to primary (first)
                const isAlreadySelected =
                  assignedAgentIds.has(currAgent) || assignedAgentNames.has(currAgent);
                if (!isAlreadySelected) {
                  const primaryAgent = agentIds[0];
                  cBatch.update(cDoc.ref, { assignedDeliverymen: primaryAgent, deliveredBy: primaryAgent });
                }
              }
            });

            await cBatch.commit();
          }
        }
      }
    }

    cache.del("allDeliveryPartners:v1");
    cache.del("deliveryPartnerMap:v1");

    res.status(200).json({
      message: `Successfully updated agents for ${targetRoutes.length} route(s).`,
      assignedCount: agentIds.length,
    });
  } catch (err) {
    console.error("Error setting route agents:", err);
    res.status(500).json({ message: "Server error while updating route agents." });
  }
};

export {
  addDeliveryPartner,
  getDeliveryPartners,
  updateDeliveryPartner,
  assignRouteToDeliveryPartner,
  unassignRouteFromDeliveryPartner,
  resetDeliveryPartnerRoutes,
  setRouteAgents,
  deleteDeliveryPartner,
  toggleDeliveryPerson,
};
