import { getFirestore } from "firebase-admin/firestore";
import cache from "../Controller/cache.js";

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
 * Extracts group and sub-code from route string.
 * Examples:
 * "R002A-Parap..." -> { group: "R002", subCode: "A" }
 * "R002B (Regular..." -> { group: "R002", subCode: "B" }
 * "R002R- SRR..." -> { group: "R002", subCode: "R" }
 * "R001N-Onboarding..." -> { group: "R001", subCode: "N" }
 */
export const getRouteGroupAndSubCode = (routeName) => {
  if (!routeName) return { group: "R001", subCode: null };
  const str = String(routeName).trim();
  const match = str.match(/^(?:ROUTE\s*|R)[\s\-_]*(\d+)\s*([A-Za-z])?/i);
  if (match && match[1]) {
    const num = match[1].padStart(3, "0");
    const group = `R${num}`;
    const subCode = match[2] ? match[2].toUpperCase() : null;
    return { group, subCode };
  }
  return { group: "R001", subCode: null };
};

export const extractRouteGroup = (routeName) => {
  return getRouteGroupAndSubCode(routeName).group;
};

/**
 * Checks whether a customer's route belongs to sub-routes A, B, C, or D.
 */
export const isRouteInABCD = (routeName) => {
  const { subCode } = getRouteGroupAndSubCode(routeName);
  return ["A", "B", "C", "D"].includes(subCode);
};

/**
 * Checks whether a customer's route belongs to sub-route R (e.g., R002R, R003R).
 */
export const isRouteInR = (routeName) => {
  const { subCode } = getRouteGroupAndSubCode(routeName);
  return subCode === "R";
};

/**
 * Checks whether a customer's current route is already in the target sub-route prefix.
 */
export const isAlreadyInTargetPrefix = (currentRoute, targetPrefix) => {
  if (!currentRoute || !targetPrefix) return false;
  const str = String(currentRoute).trim().toUpperCase();
  return str.startsWith(targetPrefix.toUpperCase());
};

export const isAlreadyInTargetRRoute = (currentRoute, targetRCode) => {
  return isAlreadyInTargetPrefix(currentRoute, targetRCode);
};

/**
 * Dynamically resolves target route from the DB routes list.
 * e.g., currentRoute "R002B...", targetSubCode "R" -> "R002R- SRR Retention by ARC Agent..."
 * currentRoute "R002R...", targetSubCode "A" -> "R002A-Parap-Choodasandra-Haralur..."
 */
export const resolveTargetSubRouteSync = (currentRoute, targetSubCode, routesList = []) => {
  const { group } = getRouteGroupAndSubCode(currentRoute);
  const targetPrefix = `${group}${targetSubCode}`.toUpperCase();

  if (Array.isArray(routesList) && routesList.length > 0) {
    const matched = routesList.find((r) => {
      const rName = (typeof r === "string" ? r : r?.name || "").trim().toUpperCase();
      return rName.startsWith(targetPrefix);
    });
    if (matched) {
      const name = typeof matched === "string" ? matched : matched.name;
      // Strip any UI agent label like " (3 agents)"
      return name.replace(/\s*\(\d+\s*agents?\)$/i, "").trim();
    }
  }

  // Fallback defaults if routesList is empty
  const FALLBACKS = {
    R002R: "R002R- SRR Retention by ARC Agent-After Checked Out Reset & Turn ON",
    R003R: "R003R-SRR checked customers shift after 12PM",
    R002A: "R002A-Parap-Choodasandra-Haralur(Regular-12PM Reset & Transfer to Agent 2)",
    R003A: "R003A-Bandepalya-Kudlu Gate-Singasandra (Regular-12PM Reset & Transfer to Agent 2)",
  };
  return FALLBACKS[targetPrefix] || targetPrefix;
};

export const resolveTargetRRouteSync = (currentRoute, routesList = []) => {
  return resolveTargetSubRouteSync(currentRoute, "R", routesList);
};

export const resolveTargetARouteSync = (currentRoute, routesList = []) => {
  return resolveTargetSubRouteSync(currentRoute, "A", routesList);
};

/**
 * Checks whether a customer's delivery status TODAY is "reached" / "checked" (for any reason).
 * Evaluates ONLY today's record in last8Days.
 * Customers who are Pending (no entry today) or Delivered today return false.
 */
export const isCustomerStatusReached = (customerData, todayStr = null) => {
  if (!customerData?.last8Days || typeof customerData.last8Days !== "object") {
    return false;
  }

  const effectiveToday = todayStr || getDateStringInTimeZone(new Date(), INDIA_TZ);
  const todayEntry = customerData.last8Days[effectiveToday];

  if (!todayEntry) {
    return false;
  }

  const isLegacy = typeof todayEntry === "string";
  const status = isLegacy
    ? todayEntry.trim().toLowerCase()
    : String(todayEntry.status || todayEntry.type || "").trim().toLowerCase();

  // If delivered today -> NOT reached
  if (status === "delivered") {
    return false;
  }

  // Reached or checked
  if (status === "reached" || status === "checked") {
    return true;
  }

  // Reason present while status is not delivered
  if (!isLegacy && (todayEntry.reason || todayEntry.checkReason)) {
    return true;
  }

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
  if (reasonStatuses.includes(status)) {
    return true;
  }

  return false;
};

/**
 * AUTO RETENTION (Auto Retain):
 * ONLY moves customers:
 * 1. Whose route ending is in (A, B, C, D)
 * 2. AND whose status TODAY is reached/checked (and not delivered)
 * Moves them to their respective R00XR route (e.g. R002 -> R002R, R003 -> R003R).
 * NEVER creates new route documents!
 */
export const syncBadRoadCustomers = async (db = null) => {
  try {
    const firestore = db || getFirestore();

    const todayStr = getDateStringInTimeZone(new Date(), INDIA_TZ);
    const snap = await firestore.collection("customers").get();

    // Cache the routes list for dynamic lookups
    const routesSnap = await firestore.collection("routes").get();
    const routesList = routesSnap.docs.map((d) => d.data()?.name).filter(Boolean);

    const updates = [];
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const currentRoute = (data.route || "").trim();

      // ⭐ ONLY customers whose route ending is in (A, B, C, D)
      if (!isRouteInABCD(currentRoute)) {
        return;
      }

      // ⭐ ONLY if status TODAY is reached / checked (not delivered, not pending)
      if (isCustomerStatusReached(data, todayStr)) {
        const { group } = getRouteGroupAndSubCode(currentRoute);
        const targetRCode = `${group}R`;

        if (!isAlreadyInTargetPrefix(currentRoute, targetRCode)) {
          const targetRoute = resolveTargetRRouteSync(currentRoute, routesList);
          updates.push({ ref: doc.ref, id: doc.id, targetRoute });
        }
      }
    });

    if (updates.length > 0) {
      console.log(`[badRoadRouteLogic] Auto Retention: Moving ${updates.length} reached (A,B,C,D) customers to their group R route...`);
      for (let i = 0; i < updates.length; i += 500) {
        const batch = firestore.batch();
        updates.slice(i, i + 500).forEach(({ ref, targetRoute }) => {
          batch.update(ref, { route: targetRoute });
        });
        await batch.commit();
      }

      try {
        const keys = typeof cache.keys === "function" ? cache.keys() : [];
        const customerInfoKeys = keys.filter((key) => key.startsWith("customerInfo:userInfo"));
        if (customerInfoKeys.length > 0) cache.del(customerInfoKeys);
        const retentionKeys = keys.filter((key) => key.startsWith("customerRetention:"));
        if (retentionKeys.length > 0) cache.del(retentionKeys);
        cache.del("routes:list");
        cache.del("routes:priority:list");
      } catch (cacheErr) {
        console.warn("Cache invalidate error in syncBadRoadCustomers:", cacheErr);
      }
      console.log(`[badRoadRouteLogic] Auto Retention: Successfully moved ${updates.length} customers.`);
    }

    return updates.length;
  } catch (err) {
    console.error("Error in syncBadRoadCustomers:", err);
    throw err;
  }
};

/**
 * AUTO DETAIN:
 * Transfers customers whose route ends in R (e.g. R002R, R003R)
 * back to their respective R00XA route (e.g. R002A, R003A).
 * NEVER creates new route documents!
 */
export const autoDetainCustomers = async (db = null) => {
  try {
    const firestore = db || getFirestore();

    const snap = await firestore.collection("customers").get();

    // Cache the routes list for dynamic lookups
    const routesSnap = await firestore.collection("routes").get();
    const routesList = routesSnap.docs.map((d) => d.data()?.name).filter(Boolean);

    const updates = [];
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      const currentRoute = (data.route || "").trim();

      // ⭐ ONLY customers whose route ends in R
      if (!isRouteInR(currentRoute)) {
        return;
      }

      const targetARoute = resolveTargetARouteSync(currentRoute, routesList);
      if (targetARoute && targetARoute !== currentRoute) {
        updates.push({ ref: doc.ref, id: doc.id, targetRoute: targetARoute });
      }
    });

    if (updates.length > 0) {
      console.log(`[badRoadRouteLogic] Auto Detain: Transferring ${updates.length} customers in R routes to their respective R00XA route...`);
      for (let i = 0; i < updates.length; i += 500) {
        const batch = firestore.batch();
        updates.slice(i, i + 500).forEach(({ ref, targetRoute }) => {
          batch.update(ref, { route: targetRoute });
        });
        await batch.commit();
      }

      try {
        const keys = typeof cache.keys === "function" ? cache.keys() : [];
        const customerInfoKeys = keys.filter((key) => key.startsWith("customerInfo:userInfo"));
        if (customerInfoKeys.length > 0) cache.del(customerInfoKeys);
        const retentionKeys = keys.filter((key) => key.startsWith("customerRetention:"));
        if (retentionKeys.length > 0) cache.del(retentionKeys);
        cache.del("routes:list");
        cache.del("routes:priority:list");
      } catch (cacheErr) {
        console.warn("Cache invalidate error in autoDetainCustomers:", cacheErr);
      }
      console.log(`[badRoadRouteLogic] Auto Detain: Successfully transferred ${updates.length} customers to their R00XA routes.`);
    }

    return updates.length;
  } catch (err) {
    console.error("Error in autoDetainCustomers:", err);
    throw err;
  }
};
