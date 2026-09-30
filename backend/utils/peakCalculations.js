/**
 * Shared 30-day Peak Calculations for Backend
 * Computes Peak Frequency and Peak Potential based strictly on the 30-day window.
 */

const INDIA_TZ = "Asia/Kolkata";

export function getDateStringInTimeZone(date = new Date(), timeZone = INDIA_TZ) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || INDIA_TZ,
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
}

export function normalizePeakFrequency(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (/^D[0-7]$/.test(raw)) return raw;
  if (/^[0-7]$/.test(raw)) return `D${raw}`;
  return "";
}

export function normalizePotential(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!raw) return "T1";

  const normalized = raw.replace(/T\s*(\d+)/, "T$1");
  const match = normalized.match(/^T(\d+)$/);
  if (match) {
    const num = Number(match[1]);
    return Number.isFinite(num) && num > 0 ? `T${num}` : "T1";
  }

  return "T1";
}

/**
 * Computes Peak Frequency (D0 to D7) based on a 7-day sliding window over the past 30 days.
 */
export function computePeakFrequency30Days(last8Days = {}) {
  if (!last8Days || typeof last8Days !== "object") return "D0";

  let maxWeekCount = 0;
  const today = new Date();

  // Slide a 7-day window across the 30-day period (offsets 0 to 23: 24 windows of 7 days)
  for (let offset = 0; offset <= 23; offset++) {
    let weekCount = 0;

    for (let day = 0; day < 7; day++) {
      const d = new Date(today);
      d.setDate(today.getDate() - (offset + day));
      const dateStr = getDateStringInTimeZone(d, INDIA_TZ);
      const entry = last8Days[dateStr];
      const status = String(
        typeof entry === "string" ? entry : entry?.status || entry?.type || ""
      ).trim().toLowerCase();

      if (status === "delivered") weekCount++;
    }

    if (weekCount > maxWeekCount) {
      maxWeekCount = weekCount;
      if (maxWeekCount === 7) break;
    }
  }

  return `D${Math.min(maxWeekCount, 7)}`;
}

/**
 * Computes Peak Potential number (max trays in a single delivered order) over the past 30 days.
 */
export function computePeakPotentialNumber30Days(last8Days = {}) {
  if (!last8Days || typeof last8Days !== "object") return 0;

  let maxTrays = 0;
  const today = new Date();

  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = getDateStringInTimeZone(d, INDIA_TZ);
    const entry = last8Days[dateStr];
    if (!entry) continue;

    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || ""
    ).trim().toLowerCase();

    if (status !== "delivered") continue;

    const trays =
      entry.traysDelivered ??
      entry.trays ??
      entry.quantity ??
      entry?.deliveredTrays ??
      0;
    const numTrays = Number(trays);

    if (Number.isFinite(numTrays) && numTrays > maxTrays) {
      maxTrays = numTrays;
    }
  }

  return maxTrays;
}

/**
 * Batch updates peak frequency and peak potential for all customers in customersSnap.
 * Reuses existing snapshot documents with ZERO extra reads.
 */
export async function updateCustomersPeak30Days(db, customersSnap) {
  if (!customersSnap || customersSnap.empty) return 0;

  let batch = db.batch();
  let operationCount = 0;
  let totalUpdated = 0;

  for (const doc of customersSnap.docs) {
    const data = doc.data() || {};
    const last8Days = data.last8Days || {};

    const computedPeakFreq = computePeakFrequency30Days(last8Days);
    const currentPeakFreq = normalizePeakFrequency(data.Peak_Frequency || data.peakFrequency);

    const computedPeakPotNum = computePeakPotentialNumber30Days(last8Days);
    const computedPeakPot = computedPeakPotNum > 0 ? `T${computedPeakPotNum}` : "T1";
    const currentPeakPot = normalizePotential(data.Peak_Potential || data.peakPotential);

    const updates = {};
    if (computedPeakFreq !== currentPeakFreq) {
      updates.Peak_Frequency = computedPeakFreq;
      updates.peakFrequency = computedPeakFreq;
    }
    if (computedPeakPot !== currentPeakPot) {
      updates.Peak_Potential = computedPeakPot;
      updates.peakPotential = computedPeakPot;
    }

    if (Object.keys(updates).length > 0) {
      batch.update(doc.ref, updates);
      operationCount++;
      totalUpdated++;

      if (operationCount >= 450) {
        await batch.commit();
        batch = db.batch();
        operationCount = 0;
      }
    }
  }

  if (operationCount > 0) {
    await batch.commit();
  }

  return totalUpdated;
}
