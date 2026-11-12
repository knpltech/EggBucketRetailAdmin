import { getFirestore } from "firebase-admin/firestore";
import cache from "../Controller/cache.js";

export const BAD_ROAD_ROUTE = "R001R- Bad Road Customers";
const INDIA_TZ = "Asia/Kolkata";

/**
 * Known R routes for standard parent route groups.
 * R001A,B,C,D -> R001R
 * R002A,B,C,D -> R002R
 * R003A,B,C,D -> R003R
 */
export const KNOWN_R_ROUTES = {
  R001R: "R001R- Bad Road Customers",
  R002R: "R002R- SRR Retention by ACR Agent-After Checked Out Reset & Turn ON",
  R003R: "R003R-SRR checked customers shift after 12PM",
};

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
 * Extracts the 3-digit parent route group from a route string.
 * Format: R (prefix) + 3 digits (e.g. R001, R002, R003).
 * Examples:
 * "R001A" -> "R001"
 * "R001N-Onboarding Customers" -> "R001"
 * "R002D-G8+ (Growth-12PM Reset & Transfer to Agent 2))" -> "R002"
 * "R003B (Regular-12PM Reset & Transfer to Agent 2)" -> "R003"
 */
export const extractRouteGroup = (routeName) => {
  if (!routeName) return "R001";
  const str = String(routeName).trim();
  const match = str.match(/^(?:ROUTE\s*|R)[\s\-_]*(\d+)/i);
  if (match && match[1]) {
    const num = match[1].padStart(3, "0");
    return `R${num}`;
  }
  return "R001";
};

/**
 * Checks whether a customer's current route is already in the target R sub-route.
 */
export const isAlreadyInTargetRRoute = (currentRoute, targetRCode) => {
  if (!currentRoute || !targetRCode) return false;
  const str = String(currentRoute).trim().toUpperCase();
  return str.startsWith(targetRCode.toUpperCase());
};

/**
 * Synchronous resolver for target R route for a customer.
 * Keeps customer within their parent group (R001 -> R001R, R002 -> R002R, R003 -> R003R).
 */
export const resolveTargetRRouteSync = (currentRoute, routesList = []) => {
  const group = extractRouteGroup(currentRoute);
  const targetCode = `${group}R`;

  if (KNOWN_R_ROUTES[targetCode]) {
    return KNOWN_R_ROUTES[targetCode];
  }

  if (Array.isArray(routesList) && routesList.length > 0) {
    const matched = routesList.find((r) => {
      const rName = (typeof r === "string" ? r : r?.name || "").trim().toUpperCase();
      return rName.startsWith(targetCode.toUpperCase());
    });
    if (matched) {
      return typeof matched === "string" ? matched : matched.name;
    }
  }

  return `${targetCode}- Bad Road Customers`;
};

/**
 * Asynchronous resolver for target R route.
 */
export const resolveTargetRRoute = async (currentRoute, db = null) => {
  const group = extractRouteGroup(currentRoute);
  const targetCode = `${group}R`;

  if (KNOWN_R_ROUTES[targetCode]) {
    return KNOWN_R_ROUTES[targetCode];
  }

  try {
    const firestore = db || getFirestore();
    const cacheKey = "routes:list";
    let routes = cache.get(cacheKey);

    if (!routes) {
      const snap = await firestore.collection("routes").get();
      routes = snap.docs.map((d) => d.data()?.name).filter(Boolean);
      cache.set(cacheKey, routes, 1800);
    }

    const matched = routes.find((r) => {
      const rName = (typeof r === "string" ? r : r?.name || "").trim().toUpperCase();
      return rName.startsWith(targetCode.toUpperCase());
    });

    if (matched) {
      return typeof matched === "string" ? matched : matched.name;
    }

    const fallbackName = `${targetCode}- Bad Road Customers`;
    await firestore.collection("routes").add({
      name: fallbackName,
      routeCode: targetCode,
      priorityId: null,
      createdAt: Date.now(),
    });
    cache.del(cacheKey);
    return fallbackName;
  } catch (err) {
    console.warn("Error in resolveTargetRRoute:", err);
    return `${targetCode}- Bad Road Customers`;
  }
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

let unsubscribeCustomerListener = null;

/**
 * Real-time Firestore listener that watches the "customers" collection live.
 * Whenever a delivery agent marks a customer as "reached" (any reason) from the mobile app,
 * this listener immediately updates their route in Firestore to their parent group's R route
 * (e.g. R001 -> R001R, R002 -> R002R, R003 -> R003R) in real time!
 */
export const startLiveCustomerRouteListener = (db = null) => {
  if (unsubscribeCustomerListener) {
    console.log("[badRoadRouteLogic] Live customer route listener is already active.");
    return unsubscribeCustomerListener;
  }

  const firestore = db || getFirestore();
  let isInitialLoad = true;

  console.log("[badRoadRouteLogic] Attaching live real-time Firestore listener for customer route updates...");

  unsubscribeCustomerListener = firestore.collection("customers").onSnapshot(
    async (snapshot) => {
      // Ignore initial snapshot batch on server boot (initial sync is handled by syncBadRoadCustomers)
      if (isInitialLoad) {
        isInitialLoad = false;
        console.log(`[badRoadRouteLogic] Live listener ready (${snapshot.size} customers loaded). Now listening for live updates...`);
        return;
      }

      const todayStr = getDateStringInTimeZone(new Date(), INDIA_TZ);

      for (const change of snapshot.docChanges()) {
        if (change.type === "modified" || change.type === "added") {
          const data = change.doc.data() || {};

          // Check if customer status is reached (for any reason)
          if (isCustomerStatusReached(data, todayStr)) {
            const currentRoute = (data.route || "").trim();
            const group = extractRouteGroup(currentRoute);
            const targetRCode = `${group}R`;

            // If not already in the target R sub-route, update immediately!
            if (!isAlreadyInTargetRRoute(currentRoute, targetRCode)) {
              const targetRoute = resolveTargetRRouteSync(currentRoute);
              console.log(
                `⚡ [LIVE ROUTE SYNC] Customer ${change.doc.id} (${data.name || data.custid || "N/A"}) marked reached -> Updating route from "${currentRoute}" to "${targetRoute}" live!`
              );

              try {
                await change.doc.ref.update({ route: targetRoute });

                // Invalidate customer caches so admin panel sees update immediately
                const keys = typeof cache.keys === "function" ? cache.keys() : [];
                const customerInfoKeys = keys.filter((key) => key.startsWith("customerInfo:userInfo"));
                if (customerInfoKeys.length > 0) cache.del(customerInfoKeys);
              } catch (updErr) {
                console.error(`Error updating route live for customer ${change.doc.id}:`, updErr.message);
              }
            }
          }
        }
      }
    },
    (error) => {
      console.error("[badRoadRouteLogic] Live customer route listener encountered an error:", error.message);
      unsubscribeCustomerListener = null;
      // Automatically attempt reconnection after 5 seconds
      setTimeout(() => {
        console.log("[badRoadRouteLogic] Reconnecting live customer route listener...");
        startLiveCustomerRouteListener(firestore);
      }, 5000);
    }
  );

  return unsubscribeCustomerListener;
};

/**
 * Scans all customers and sets route to their group's R route
 * (e.g., R001 -> R001R, R002 -> R002R, R003 -> R003R)
 * for any customer whose status is reached (any reason).
 */
export const syncBadRoadCustomers = async (db = null) => {
  try {
    const firestore = db || getFirestore();
    await ensureBadRoadRouteExists(firestore);

    const todayStr = getDateStringInTimeZone(new Date(), INDIA_TZ);
    const snap = await firestore.collection("customers").get();

    // Cache the routes list for dynamic lookups
    const routesSnap = await firestore.collection("routes").get();
    const routesList = routesSnap.docs.map((d) => d.data()?.name).filter(Boolean);

    const updates = [];
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (isCustomerStatusReached(data, todayStr)) {
        const currentRoute = (data.route || "").trim();
        const group = extractRouteGroup(currentRoute);
        const targetRCode = `${group}R`;

        if (!isAlreadyInTargetRRoute(currentRoute, targetRCode)) {
          const targetRoute = resolveTargetRRouteSync(currentRoute, routesList);
          updates.push({ ref: doc.ref, id: doc.id, targetRoute });
        }
      }
    });

    if (updates.length > 0) {
      console.log(`[badRoadRouteLogic] Syncing ${updates.length} reached customers to their group R route...`);
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
        cache.del("routes:list");
        cache.del("routes:priority:list");
      } catch (cacheErr) {
        console.warn("Cache invalidate error in syncBadRoadCustomers:", cacheErr);
      }
      console.log(`[badRoadRouteLogic] Successfully synced ${updates.length} customers to their group R route.`);
    }

    return updates.length;
  } catch (err) {
    console.error("Error in syncBadRoadCustomers:", err);
    return 0;
  }
};
