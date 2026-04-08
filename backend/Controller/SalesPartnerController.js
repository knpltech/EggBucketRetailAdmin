import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

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

export {
  addSalesPerson,
  getSalesPartners,
  updateSalesPartner,
  deleteSalesPartner,
  toggleSalesPerson,
};
