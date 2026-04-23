import { getFirestore } from "firebase-admin/firestore";
import cache from "./cache.js";

const invalidateUserInfoCache = async () => {
  const keys = await cache.keysAsync("customerInfo:userInfo*");
  if (keys.length > 0) {
    await cache.delAsync(keys);
  }
};

const invalidateAllCustomerDeliveriesCache = async () => {
  const keys = await cache.keysAsync("allCustomerDeliveries*");
  if (keys.length > 0) {
    await cache.delAsync(keys);
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

    try {
      await invalidateUserInfoCache();
      await cache.delAsync(`customer:${id}`);
      await cache.delAsync(`userDeliveries:${id}`);
      await invalidateAllCustomerDeliveriesCache();
    } catch (cacheError) {
      console.warn("Failed to invalidate customer caches:", cacheError);
    }

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

    try {
      await invalidateUserInfoCache();
      await cache.delAsync(`customer:${id}`);
      await invalidateAllCustomerDeliveriesCache();
    } catch (cacheError) {
      console.warn("Failed to invalidate customer caches:", cacheError);
    }

    return res.status(200).json({ message: "Customer updated successfully" });
  } catch (error) {
    console.error("Error updating customer:", error);
    return res.status(500).json({ message: "Failed to update customer" });
  }
};

export { deleteCustomer, updateCustomer, deleteSubcollection };
