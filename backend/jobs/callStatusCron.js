import { getFirestore } from "firebase-admin/firestore";
import cache from "../Controller/cache.js";

const INDIA_TZ = "Asia/Kolkata";

export const runCallStatusResetJobOnce = async (customersSnap, isMidnightCron = true) => {
  if (!isMidnightCron) {
    console.log("[callStatusCron] Skipping reset because isMidnightCron=false");
    return;
  }
  
  try {
    const db = getFirestore();
    
    // If not provided, fetch them (fallback)
    if (!customersSnap) {
      customersSnap = await db.collection("customers").get();
    }
    
    if (customersSnap.empty) return;
    
    let processed = 0;
    let updated = 0;
    
    let batch = db.batch();
    let batchCount = 0;
    
    const commitBatchIfNeeded = async (force = false) => {
      if (!force && batchCount < 450) return;
      if (batchCount === 0) return;
      
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    };
    
    for (const doc of customersSnap.docs) {
      const data = doc.data() || {};
      
      if (data.callStatus !== "To Call") {
        batch.update(doc.ref, { callStatus: "To Call" });
        batchCount += 1;
        updated += 1;
      }
      
      processed += 1;
      await commitBatchIfNeeded(false);
    }
    
    await commitBatchIfNeeded(true);
    
    if (updated > 0) {
      // invalidate customer info caches
      try {
        const keys = typeof cache.keys === "function" ? cache.keys() : [];
        const customerInfoKeys = keys.filter((key) =>
          key.startsWith("customerInfo:userInfo"),
        );
        if (customerInfoKeys.length > 0) {
          cache.del(customerInfoKeys);
        }
      } catch (cacheErr) {
        console.error("Cache clearing error in callStatusCron:", cacheErr);
      }
    }
    
    console.log(`[callStatusCron] Reset callStatus to 'To Call': processed=${processed}, updated=${updated}`);
  } catch (err) {
    console.error("[callStatusCron] Error:", err);
  }
};
