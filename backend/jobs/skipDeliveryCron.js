import cron from "node-cron";
import { getFirestore } from "firebase-admin/firestore";
import cache from "../Controller/cache.js";

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

const parseDateStringISTStart = (dateString) => {
  const s = String(dateString || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  // Interpret as start-of-day in India.
  const d = new Date(`${s}T00:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const clampDays0to6 = (value) => {
  let n = Number(value);
  if (!Number.isFinite(n)) return 0;
  n = Math.floor(n);
  if (n < 0) return 0;
  if (n > 6) return 6;
  return n;
};

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
  } catch (err) {
    console.warn("Cron cache invalidation error:", err);
  }
};

export const runSkipDeliveryJobOnce = async () => {
  const today = getTodayDateStringIST();
  const todayStart = parseDateStringISTStart(today);
  if (!todayStart) return;

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
      `[skipDeliveryCron][debug] projectId=${process.env.PROJECT_ID || ""} totalCustomers=${customersSnap.size} today=${today}`,
    );
  }

  let autoDetected = 0;
  let eligible = 0;
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
    const rawSkipConfig = data?.skipConfig;

    const isObject =
      rawSkipConfig !== null &&
      rawSkipConfig !== undefined &&
      typeof rawSkipConfig === "object" &&
      !Array.isArray(rawSkipConfig);

    const skipConfig = isObject ? rawSkipConfig : null;

    const debugThisDoc =
      debug && shouldDebugDoc(doc.id, debugIds, debugRemaining);
    if (debugThisDoc && !debugIds && debugRemaining > 0) debugRemaining -= 1;

    const skipType = skipConfig?.type
      ? String(skipConfig.type).trim().toUpperCase()
      : "";

    if (debugThisDoc) {
      console.log("[skipDeliveryCron][debug] Customer ID:", doc.id);
      console.log(
        "[skipDeliveryCron][debug] SkipConfig:",
        skipConfig ? safeJson(skipConfig) : String(rawSkipConfig),
      );
      console.log("[skipDeliveryCron][debug] SkipType:", skipType);
      if (!isObject && rawSkipConfig !== undefined) {
        console.log(
          "[skipDeliveryCron][debug] skipConfig is not an object. typeof=",
          typeof rawSkipConfig,
        );
      }
    }

    if (skipType === "AUTO") {
      autoDetected += 1;
    }

    if (!skipConfig || skipType !== "AUTO") {
      continue;
    }

    const days = clampDays0to6(skipConfig.days);
    if (days <= 0) {
      if (debugThisDoc) {
        console.log("[skipDeliveryCron][debug] skip: days<=0", {
          rawDays: skipConfig.days,
          normalizedDays: days,
        });
      }
      continue;
    }

    const startDateStr = skipConfig.startDate
      ? String(skipConfig.startDate).trim()
      : "";
    const start = parseDateStringISTStart(startDateStr);
    if (!start) {
      if (debugThisDoc) {
        console.log("[skipDeliveryCron][debug] skip: invalid startDate", {
          startDate: startDateStr,
        });
      }
      continue;
    }

    const existingOverride = data?.todayOverride || null;

    const existingOverrideDate = existingOverride?.date
      ? String(existingOverride.date).slice(0, 10)
      : null;

    eligible += 1;

    const diffDays = Math.floor(
      (todayStart.getTime() - start.getTime()) / 86400000,
    );

    // If skip window is completed, reset to MANUAL to avoid future cron work and UI confusion.
    // Condition: diffDays > days  (skip starts from NEXT day, so days are counted after startDate)
    if (diffDays > days) {
      if (debugThisDoc) {
        console.log("[skipDeliveryCron][debug] reset: skip completed", {
          today,
          startDate: startDateStr,
          diffDays,
          days,
        });
      }

      batch.update(doc.ref, {
        skipConfig: {
          type: "MANUAL",
          days: 0,
          startDate: null,
        },
        todayOverride: {
          date: today,
          status: "ON",
        },
      });

      batchCount += 1;
      updated += 1;

      await commitBatchIfNeeded(false);
      continue;
    }

    // Skip starts from NEXT day.
    const status = diffDays >= 1 && diffDays <= days ? "OFF" : "ON";

    const existingStatus = existingOverride?.status
      ? String(existingOverride.status).trim().toUpperCase()
      : null;

    // If already correct for today (and not a manual override), avoid redundant writes.
    if (existingOverrideDate === today && existingStatus === status) {
      if (debugThisDoc) {
        console.log("[skipDeliveryCron][debug] skip: already up-to-date", {
          existingOverrideDate,
          existingStatus,
          status,
        });
      }
      continue;
    }

    if (debugThisDoc) {
      console.log("[skipDeliveryCron][debug] computed", {
        today,
        startDate: startDateStr,
        diffDays,
        days,
        status,
      });
    }

    batch.update(doc.ref, {
      todayOverride: {
        date: today,
        status,
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
    `[skipDeliveryCron] ${today}: autoDetected=${autoDetected}, eligible=${eligible}, updated=${updated}`,
  );
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
};
