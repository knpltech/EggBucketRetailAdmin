import { getFirestore } from "firebase-admin/firestore";

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

export { deleteCustomer, updateCustomer, deleteSubcollection };
