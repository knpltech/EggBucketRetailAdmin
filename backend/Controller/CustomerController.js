import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import cache from "./cache.js";
import { invalidateActiveCountCache } from "./CustomerInfoController.js";

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
      await invalidateActiveCountCache();
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

// Assigns an agent to a customer
const assignAgent = async (req, res) => {
  const { id, assignedDeliverymen, deliveredBy } = req.body;
  const agentId = assignedDeliverymen || deliveredBy;
  if (!id) {
    return res.status(400).json({ message: "Customer ID is required" });
  }
  if (!agentId) {
    return res.status(400).json({ message: "Agent ID is required" });
  }

  try {
    const db = getFirestore();
    const customerRef = db.collection("customers").doc(id);

    const customerDoc = await customerRef.get();

    if (!customerDoc.exists) {
      return res.status(404).json({ message: "Customer not found" });
    }

    await customerRef.update({ assignedDeliverymen: agentId });

    try {
      await invalidateUserInfoCache();
      await cache.delAsync(`customer:${id}`);
      await invalidateAllCustomerDeliveriesCache();
    } catch (cacheError) {
      console.warn("Failed to invalidate customer caches:", cacheError);
    }

    return res.status(200).json({ message: "Agent assigned successfully" });
  } catch (error) {
    console.error("Error assigning agent:", error);
    return res.status(500).json({ message: "Failed to assign agent" });
  }
};

// Updates customer profile image in Firebase Storage and customers collection
const updateCustomerImage = async (req, res) => {
  const { id, custid } = req.body;
  const imageFile = req.file;

  if (!id && !custid) {
    return res.status(400).json({ message: "Customer ID is required" });
  }

  if (!imageFile) {
    return res.status(400).json({ message: "Image file is required" });
  }

  try {
    const db = getFirestore();
    let targetRef = null;
    let targetDoc = null;

    if (id) {
      const docRef = db.collection("customers").doc(String(id).trim());
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        targetRef = docRef;
        targetDoc = docSnap;
      }
    }

    if (!targetRef && (custid || id)) {
      const queryId = String(custid || id).trim();
      const querySnap = await db
        .collection("customers")
        .where("custid", "==", queryId)
        .limit(1)
        .get();
      if (!querySnap.empty) {
        targetRef = querySnap.docs[0].ref;
        targetDoc = querySnap.docs[0];
      }
    }

    if (!targetRef && id) {
      const altRef = db.collection("customer").doc(String(id).trim());
      const altSnap = await altRef.get();
      if (altSnap.exists) {
        targetRef = altRef;
        targetDoc = altSnap;
      }
    }

    if (!targetRef) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const bucket = getStorage().bucket();
    const ext = path.extname(imageFile.originalname) || ".jpg";
    const imageName = `Customer/${uuidv4()}${ext}`;
    const file = bucket.file(imageName);
    const downloadToken = uuidv4();

    await file.save(imageFile.buffer, {
      metadata: {
        contentType: imageFile.mimetype || "image/jpeg",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    try {
      await file.makePublic();
    } catch {
      // Ignore if bucket uniform access doesn't permit makePublic
    }

    const bucketName =
      bucket.name ||
      (process.env.STORAGE_BUCKET
        ? process.env.STORAGE_BUCKET.replace("gs://", "")
        : "eggbucket-retail.firebasestorage.app");

    const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(imageName)}?alt=media&token=${downloadToken}`;

    await targetRef.update({ imageUrl });

    try {
      await invalidateUserInfoCache();
      await cache.delAsync(`customer:${targetDoc.id}`);
      if (id) await cache.delAsync(`customer:${id}`);
      await invalidateAllCustomerDeliveriesCache();
    } catch (cacheError) {
      console.warn("Failed to invalidate customer caches:", cacheError);
    }

    return res.status(200).json({
      success: true,
      message: "Customer image updated successfully",
      imageUrl,
    });
  } catch (error) {
    console.error("Error updating customer image:", error);
    return res.status(500).json({ message: "Failed to update customer image" });
  }
};

export {
  deleteCustomer,
  updateCustomer,
  assignAgent,
  deleteSubcollection,
  updateCustomerImage,
};
