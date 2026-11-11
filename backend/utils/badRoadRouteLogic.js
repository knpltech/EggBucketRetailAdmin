import { getFirestore } from "firebase-admin/firestore";
import cache from "../Controller/cache.js";

export const BAD_ROAD_ROUTE = "R001R- Bad Road Customers";
const INDIA_TZ = "Asia/Kolkata";

export const getDateStringInTimeZone = (date = new Date(), timeZone = INDIA_TZ) => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;

    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // fall through
  }
  return new Date().toISOString().slice(0, 10);
};

/**
 * Checks whether a customer's delivery status is "reached" (for any reason).
 * Evaluates today's record in last8Days, or the latest recorded visit in last8Days.
 */
export const isCustomerStatusReached = (customerData, todayStr = null) => {
  if (!customerData?.last8Days || typeof customerData.last8Days !== "object") {
    return false;
  }

  const checkEntryIsReached = (entry) => {
    if (!entry) return false;
    const isLegacy = typeof entry === "string";
    const status = isLegacy
      ? entry.trim().toLowerCase()
      : String(entry.status || entry.type || "").trim().toLowerCase();

    // Reached or checked
    if (status === "reached" || status === "checked") return true;

    // Reason present while status is not delivered
    if (!isLegacy && (entry.reason || entry.checkReason) && status !== "delivered") {
      return true;
    }

    // Specific known reasons
    const reasonStatuses = [
      "price_mismatch",
      "price_issue",
      "shop_closed",
      "stock_available",
      "other_vendor",
      "confirmed_tomorrow",
      "confirmed_for_tomorrow",
      "need_credit",
      "quality_issue",
      "owner_not_available",
    ];
    if (reasonStatuses.includes(status)) return true;

    return false;
  };

  const effectiveToday = todayStr || getDateStringInTimeZone(new Date(), INDIA_TZ);

  // 1. Check today's date if present
  if (customerData.last8Days[effectiveToday]) {
    const todayEntry = customerData.last8Days[effectiveToday];
    const todayStatus = String(
      typeof todayEntry === "string" ? todayEntry : todayEntry?.status || todayEntry?.type || ""
    ).trim().toLowerCase();

    if (todayStatus === "delivered") {
      return false;
    }

    if (checkEntryIsReached(todayEntry)) {
      return true;
    }
  }

  // 2. Check the most recent date key in last8Days
  const dateKeys = Object.keys(customerData.last8Days)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();

  if (dateKeys.length > 0) {
    const latestDateKey = dateKeys[dateKeys.length - 1];
    const latestEntry = customerData.last8Days[latestDateKey];
    const latestStatus = String(
      typeof latestEntry === "string" ? latestEntry : latestEntry?.status || latestEntry?.type || ""
    ).trim().toLowerCase();

    if (latestStatus === "delivered") {
      return false;
    }

    if (checkEntryIsReached(latestEntry)) {
      return true;
    }
  }

  return false;
};

/**
 * Ensures "R001R- Bad Road Customers" route document exists in "routes" collection.
 */
export const ensureBadRoadRouteExists = async (db) => {
  try {
    const snap = await db.collection("routes").where("name", "==", BAD_ROAD_ROUTE).limit(1).get();
    if (snap.empty) {
      await db.collection("routes").add({
        name: BAD_ROAD_ROUTE,
        routeCode: "R001R",
        priorityId: null,
        createdAt: Date.now(),
      });
      cache.del("routes:list");
      cache.del("routes:priority:list");
    }
  } catch (err) {
    console.warn("ensureBadRoadRouteExists error:", err.message);
  }
};

/**
 * Scans all customers and sets route to "R001R- Bad Road Customers"
 * for any customer whose status is reached (any reason).
 */
export const syncBadRoadCustomers = async (db = null) => {
  try {
    const firestore = db || getFirestore();
    await ensureBadRoadRouteExists(firestore);

    const todayStr = getDateStringInTimeZone(new Date(), INDIA_TZ);
    const snap = await firestore.collection("customers").get();

    const updates = [];
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (isCustomerStatusReached(data, todayStr)) {
        const currentRoute = (data.route || "").trim();
        if (currentRoute !== BAD_ROAD_ROUTE) {
          updates.push({ ref: doc.ref, id: doc.id });
        }
      }
    });

    if (updates.length > 0) {
      console.log(`[badRoadRouteLogic] Syncing ${updates.length} reached customers to route "${BAD_ROAD_ROUTE}"...`);
      for (let i = 0; i < updates.length; i += 500) {
        const batch = firestore.batch();
        updates.slice(i, i + 500).forEach(({ ref }) => {
          batch.update(ref, { route: BAD_ROAD_ROUTE });
        });
        await batch.commit();
      }

      try {
        const keys = typeof cache.keys === "function" ? cache.keys() : [];
        const customerInfoKeys = keys.filter((key) => key.startsWith("customerInfo:userInfo"));
        if (customerInfoKeys.length > 0) cache.del(customerInfoKeys);
        cache.del("routes:list");
        cache.del("routes:priority:list");
      } catch (cacheErr) {
        console.warn("Cache invalidate error in syncBadRoadCustomers:", cacheErr);
      }
      console.log(`[badRoadRouteLogic] Successfully synced ${updates.length} customers to "${BAD_ROAD_ROUTE}".`);
    }

    return updates.length;
  } catch (err) {
    console.error("Error in syncBadRoadCustomers:", err);
    return 0;
  }
};
