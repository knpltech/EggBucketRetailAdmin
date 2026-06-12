import cron from "node-cron";
import { getFirestore } from "firebase-admin/firestore";
import cache from "../Controller/cache.js";
import { invalidateActiveCountCache } from "../Controller/CustomerInfoController.js";
import { calculateAndSavePeakPotentials } from "./categoryPeakCron.js";

const INDIA_TZ = "Asia/Kolkata";

const getDateStringInTimeZone = (date = new Date(), timeZone = INDIA_TZ) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (!year || !month || !day) {
    // Fallback (UTC) — should not happen in modern Node, but keeps job resilient.
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
};

const getTodayDateStringIST = () =>
  getDateStringInTimeZone(new Date(), INDIA_TZ);

const isDebugEnabled = () =>
  String(process.env.SKIP_CRON_DEBUG || "")
    .trim()
    .toLowerCase() === "true";

const getDebugCustomerIds = () => {
  const raw = String(process.env.SKIP_CRON_DEBUG_CUSTOMER_IDS || "").trim();
  if (!raw) return null;

  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? new Set(ids) : null;
};

const shouldDebugDoc = (docId, debugIds, debugRemaining) => {
  if (debugIds) return debugIds.has(docId);
  return debugRemaining > 0;
};

const safeJson = (value) => {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return "[unserializable]";
  }
};

const invalidateSkipRelatedCaches = () => {
  try {
    cache.del("analytics:last8:v2");
    cache.del("analytics:last8:v10");
    cache.del("customerMapStatus:today");
    cache.del("latestRemarks");

    const keys = cache.keys();
    const allDeliveriesKeys = keys.filter((k) =>
      k.startsWith("allCustomerDeliveries"),
    );
    const userDeliveriesKeys = keys.filter((k) =>
      k.startsWith("userDeliveries:"),
    );

    if (allDeliveriesKeys.length) cache.del(allDeliveriesKeys);
    if (userDeliveriesKeys.length) cache.del(userDeliveriesKeys);
    invalidateActiveCountCache().catch(() => {});
  } catch (err) {
    console.warn("Cron cache invalidation error:", err);
  }
};

export const runSkipDeliveryJobOnce = async () => {
  const today = getTodayDateStringIST();

  // Get current weekday (mon, tue, wed, etc.)
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: INDIA_TZ,
  })
    .format(new Date())
    .toLowerCase()
    .substring(0, 3);

  const db = getFirestore();

  const debug = isDebugEnabled();
  const debugIds = getDebugCustomerIds();
  let debugRemaining = Number(process.env.SKIP_CRON_DEBUG_LIMIT || 10);
  if (!Number.isFinite(debugRemaining) || debugRemaining < 0)
    debugRemaining = 0;

  const customersSnap = await db.collection("customers").get();
  if (customersSnap.empty) return;

  if (debug) {
    console.log(
      `[skipDeliveryCron][weekly] projectId=${process.env.PROJECT_ID || ""} totalCustomers=${customersSnap.size} today=${today} weekday=${weekday}`,
    );
  }

  let processed = 0;
  let updated = 0;

  let batch = db.batch();
  let batchCount = 0;

  const commitBatchIfNeeded = async (force = false) => {
    if (!force && batchCount < 450) return; // headroom under 500
    if (batchCount === 0) return;

    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  };

  for (const doc of customersSnap.docs) {
    const data = doc.data() || {};

    // Default to all days enabled if no schedule exists
    const weeklySchedule = data?.weeklySchedule || {
      mon: true,
      tue: true,
      wed: true,
      thu: true,
      fri: true,
      sat: true,
      sun: true,
    };

    const debugThisDoc =
      debug && shouldDebugDoc(doc.id, debugIds, debugRemaining);
    if (debugThisDoc && !debugIds && debugRemaining > 0) debugRemaining -= 1;

    if (debugThisDoc) {
      console.log("[skipDeliveryCron][weekly] Customer ID:", doc.id);
      console.log(
        "[skipDeliveryCron][weekly] WeeklySchedule:",
        safeJson(weeklySchedule),
      );
      console.log("[skipDeliveryCron][weekly] Current weekday:", weekday);
    }

    processed += 1;

    const existingOverride = data?.todayOverride || null;
    const existingOverrideDate = existingOverride?.date
      ? String(existingOverride.date).slice(0, 10)
      : null;
    const existingOverrideType = existingOverride?.type
      ? String(existingOverride.type).trim().toUpperCase()
      : null;

    // ✅ MANUAL OFF protection: Preserve MANUAL OFF for today
    const existingOverrideStatus = existingOverride?.status
      ? String(existingOverride.status).trim().toUpperCase()
      : null;

    const isManualOff =
      existingOverrideType === "MANUAL" &&
      existingOverrideDate === today &&
      existingOverrideStatus === "OFF";

    if (isManualOff) {
      if (debugThisDoc) {
        console.log(
          "[skipDeliveryCron][weekly] MANUAL OFF: preserving today's OFF status",
          {
            today,
            existingStatus: existingOverride?.status,
          },
        );
      }
      continue; // ← Preserve MANUAL OFF for rest of today
    }

    // ⭐ NEW: Check if already completed today (delivered, reached, or check reason)
    const todayEntry = data?.last8Days?.[today];
    const todayStatus = String(
      typeof todayEntry === "string" ? todayEntry : todayEntry?.status || "",
    )
      .trim()
      .toLowerCase();

    const completedStatuses = [
      "delivered",
      "reached",
      "price_mismatch",
      "shop_closed",
      "stock_available",
      "other_vendor",
    ];

    const isCompleted = completedStatuses.includes(todayStatus);

    if (isCompleted) {
      if (debugThisDoc) {
        console.log(
          "[skipDeliveryCron][weekly] Already completed today, skipping",
          {
            today,
            status: todayStatus,
          },
        );
      }
      continue; // ← Skip this customer - don't modify todayOverride
    }

    // ✅ Determine if delivery should be ON based on weeklySchedule
    const shouldDeliver = weeklySchedule[weekday] === true;

    if (debugThisDoc) {
      console.log("[skipDeliveryCron][weekly] Computed status", {
        today,
        weekday,
        weeklySchedule,
        shouldDeliver,
        existingStatus: existingOverride?.status,
      });
    }

    const status = shouldDeliver ? "ON" : "OFF";

    // ✅ Optimization: Don't write if already correct for today
    const existingStatus = existingOverride?.status
      ? String(existingOverride.status).trim().toUpperCase()
      : null;

    if (
      existingOverrideDate === today &&
      existingStatus === status &&
      existingOverrideType === "SYSTEM"
    ) {
      if (debugThisDoc) {
        console.log(
          "[skipDeliveryCron][weekly] Already correct for today, skipping",
          {
            today,
            status,
          },
        );
      }
      continue;
    }

    if (debugThisDoc) {
      console.log("[skipDeliveryCron][weekly] Updating todayOverride", {
        today,
        status,
      });
    }

    batch.update(doc.ref, {
      todayOverride: {
        date: today,
        status,
        type: "SYSTEM",
      },
    });

    batchCount += 1;
    updated += 1;

    await commitBatchIfNeeded(false);
  }

  await commitBatchIfNeeded(true);

  if (updated > 0) {
    invalidateSkipRelatedCaches();
  }

  console.log(
    `[skipDeliveryCron][weekly] ${today} weekday=${weekday}: processed=${processed}, updated=${updated}`,
  );

  // ⭐ NEW: Calculate and save category peak potentials using the SAME customer data
  // This saves ~387 reads per day by reusing the customersSnap we already fetched above.
  try {
    await calculateAndSavePeakPotentials(db, customersSnap);
  } catch (err) {
    console.error("[skipDeliveryCron] Error calculating peak potentials:", err);
  }
};

let cronTask = null;

export const startSkipDeliveryCron = () => {
  if (cronTask) return;

  const cronExpr =
    String(process.env.SKIP_CRON_DEV_EVERY_MINUTE || "").toLowerCase() ===
    "true"
      ? "* * * * *"
      : "0 0 * * *";

  // Runs every day at 12:00 AM Asia/Kolkata (or every minute in dev).
  cronTask = cron.schedule(
    cronExpr,
    async () => {
      try {
        await runSkipDeliveryJobOnce();
      } catch (err) {
        console.error("[skipDeliveryCron] Job error:", err);
      }
    },
    { timezone: INDIA_TZ },
  );

  console.log(`[skipDeliveryCron] Scheduled: ${cronExpr} (${INDIA_TZ})`);

  // ✅ NEW: Run on startup if today's cron hasn't executed yet
  // This ensures skip configs are processed even if server restarted after midnight
  // Run startup recovery ONLY in production
  if (process.env.NODE_ENV === "production") {
    (async () => {
      try {
        console.log("[skipDeliveryCron] Running startup check...");
        await runSkipDeliveryJobOnce();
        console.log("[skipDeliveryCron] Startup check completed");
      } catch (err) {
        console.error("[skipDeliveryCron] Startup check error:", err);
      }
    })();
  }
};
