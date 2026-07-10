import cron from "node-cron";
import { getFirestore } from "firebase-admin/firestore";

const INDIA_TZ = "Asia/Kolkata";

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

const getDateStringInTimeZone = (date = new Date(), timeZone = INDIA_TZ) => {
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
 * Get the weekday name for a given date in IST (e.g., "Friday")
 */
const getWeekdayName = (dateObj = new Date()) => {
  const dayIndex = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: INDIA_TZ,
  }).format(dateObj);

  // Map short name to index and return full name
  const shortToIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return WEEKDAY_NAMES[shortToIndex[dayIndex] ?? dateObj.getDay()];
};

/**
 * Count delivered days in last 7 days (yesterday through 7 days ago) for a customer.
 * Returns a number 0-7.
 */
const getDeliveredCountFromLast8Days = (last8Days = {}, referenceDateStr) => {
  let count = 0;
  // If referenceDateStr is provided, use it. Otherwise default to today.
  const refDate = referenceDateStr ? new Date(referenceDateStr + "T00:00:00") : new Date();

  for (let i = 1; i <= 7; i++) {
    const d = new Date(refDate);
    d.setDate(refDate.getDate() - i);
    const dateStr = getDateStringInTimeZone(d, INDIA_TZ);
    const entry = last8Days[dateStr];
    const status = typeof entry === "string" ? entry : entry?.status;
    if (String(status || "").toLowerCase() === "delivered") {
      count++;
    }
  }

  return count;
};

/**
 * Compute peak potential number (max trays delivered in a single delivery) from last8Days.
 */
const computePeakPotentialNumber = (last8Days = {}) => {
  if (!last8Days || typeof last8Days !== "object") return 0;

  let maxTrays = 0;
  Object.values(last8Days).forEach((entry) => {
    if (!entry) return;
    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || "",
    ).trim().toLowerCase();
    if (status !== "delivered") return;

    const trays = entry.traysDelivered ?? entry.trays ?? entry.quantity ?? entry?.deliveredTrays ?? 0;
    const numTrays = Number(trays);
    if (Number.isFinite(numTrays) && numTrays > maxTrays) {
      maxTrays = numTrays;
    }
  });

  return maxTrays;
};

/**
 * Get today's delivered trays for a customer.
 * Returns 0 if not delivered today.
 */
const getTodayDeliveredTrays = (last8Days = {}, todayStr) => {
  const entry = last8Days[todayStr];
  if (!entry) return 0;

  const status = (typeof entry === "string" ? entry : entry?.status || "")
    .trim()
    .toLowerCase();
  if (status !== "delivered") return 0;

  const trays = entry.traysDelivered ?? entry.trays ?? entry.quantity ?? entry?.deliveredTrays ?? 0;
  const numTrays = Number(trays);
  return Number.isFinite(numTrays) && numTrays > 0 ? numTrays : 0;
};

/**
 * Helper: Calculate yesterday's category totals and update stored best if higher.
 * We calculate for yesterday because this runs at 12:00 AM (start of the new day).
 * It uses the already-fetched customersSnap to save database reads.
 */
export const calculateAndSavePeakPotentials = async (db, customersSnap) => {
  // Target date is YESTERDAY
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const targetDateStr = getDateStringInTimeZone(yesterday, INDIA_TZ);
  const weekdayName = getWeekdayName(yesterday);

  console.log(`[categoryPeakCron] Computing peak potentials for ${targetDateStr} (${weekdayName})`);

  if (!customersSnap || customersSnap.empty) {
    console.log("[categoryPeakCron] No customers provided, skipping");
    return;
  }

  // 2. Calculate today's totals per category
  const categoryTotals = {
    ALL: 0,
    PRIME: 0,
    ONBOARDING: 0,
    D0: 0, D1: 0, D2: 0, D3: 0, D4: 0, D5: 0, D6: 0, D7: 0,
  };

  customersSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const last8Days = data.last8Days || {};

    // Get yesterday's delivered trays
    const targetTrays = getTodayDeliveredTrays(last8Days, targetDateStr);
    if (targetTrays <= 0) return; // Skip if not delivered on target date

    // Determine category (D0-D7) using reference date
    const deliveredCount = getDeliveredCountFromLast8Days(last8Days, targetDateStr);
    const category = `D${deliveredCount}`;

    // Check if PRIME (peak potential >= 10)
    const peakPotential = computePeakPotentialNumber(last8Days);
    const isPrime = peakPotential >= 10;

    // Check if ONBOARDING (no zone)
    const zone = String(data.zone || "").trim().toUpperCase();
    const isOnboarding = !zone || zone === "UNASSIGNED";
    const isCallingCustomer = zone === "CALLING CUSTOMER";

    // Add to ALL
    categoryTotals.ALL += targetTrays;

    // Add to their D-category
    if (categoryTotals[category] !== undefined) {
      categoryTotals[category] += targetTrays;
    }

    // Add to PRIME if applicable
    if (isPrime) {
      categoryTotals.PRIME += targetTrays;
    }

    // Add to ONBOARDING if applicable
    if (isOnboarding) {
      categoryTotals.ONBOARDING += targetTrays;
    }
    
    // Add to CALLING CUSTOMER if applicable
    if (isCallingCustomer) {
      if (categoryTotals["CALLING CUSTOMER"] === undefined) {
        categoryTotals["CALLING CUSTOMER"] = 0;
      }
      categoryTotals["CALLING CUSTOMER"] += targetTrays;
    }

    // Add to Business Type if applicable
    if (data.businessType) {
      const bType = String(data.businessType).trim().toUpperCase();
      if (bType) {
        if (categoryTotals[bType] === undefined) {
          categoryTotals[bType] = 0;
        }
        categoryTotals[bType] += targetTrays;
      }
    }

    // Add to Zone if applicable
    if (data.zone) {
      const zType = String(data.zone).trim().toUpperCase();
      // Skip onboarding and calling customer as they are handled by main tabs
      if (zType && zType !== "UNASSIGNED" && zType !== "CALLING CUSTOMER") {
        const zoneKey = `ZONE_${zType}`;
        if (categoryTotals[zoneKey] === undefined) {
          categoryTotals[zoneKey] = 0;
        }
        categoryTotals[zoneKey] += targetTrays;
      }
    }

    // Add to Route if applicable
    if (data.route) {
      const rType = String(data.route).trim().toUpperCase();
      if (rType && rType !== "UNASSIGNED") {
        const routeKey = `ROUTE_${rType}`;
        if (categoryTotals[routeKey] === undefined) {
          categoryTotals[routeKey] = 0;
        }
        categoryTotals[routeKey] += targetTrays;
      }
    }
  });

  console.log(`[categoryPeakCron] Today's totals:`, categoryTotals);

  // 3. Read stored best for this weekday
  const docRef = db.collection("categoryPeakPotentials").doc(weekdayName);
  const storedDoc = await docRef.get();
  const storedBest = storedDoc.exists ? storedDoc.data() || {} : {};

  // 4. Compare and build update — only update categories where today is higher
  const updates = {};
  let hasUpdates = false;

  Object.entries(categoryTotals).forEach(([category, todayTotal]) => {
    const storedValue = Number(storedBest[category]) || 0;
    if (todayTotal > storedValue) {
      updates[category] = todayTotal;
      hasUpdates = true;
      console.log(
        `[categoryPeakCron] ${category}: ${storedValue} → ${todayTotal} (new best!)`,
      );
    }
  });

  // 5. Save updates if any category improved
  if (hasUpdates) {
    updates.lastUpdated = targetDateStr;
    await docRef.set(updates, { merge: true });
    console.log(`[categoryPeakCron] Updated ${weekdayName} best potentials`);
  } else {
    console.log(`[categoryPeakCron] No improvements for ${weekdayName}`);
  }

  console.log(`[categoryPeakCron] Done for ${targetDateStr}`);
};


