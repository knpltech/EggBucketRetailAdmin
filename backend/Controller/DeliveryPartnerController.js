import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

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

export {
  addDeliveryPartner,
  getDeliveryPartners,
  updateDeliveryPartner,
  deleteDeliveryPartner,
  toggleDeliveryPerson,
};
