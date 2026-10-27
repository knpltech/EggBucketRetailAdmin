/**
 * Shared Customer Metrics & Helpers
 * Centralized utility for calculating and formatting peak frequencies, potentials,
 * categories, delivery gaps, frequency gaps, risk factors, and statuses across the application.
 */

export const INDIA_TZ = "Asia/Kolkata";

// ─── Date Helpers ─────────────────────────────────────────────────────────────

// ─── High-Performance Date & Formatter Caches ────────────────────────────────
let cachedKolkataFormatter = null;

function getKolkataFormatter() {
  if (!cachedKolkataFormatter) {
    cachedKolkataFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: INDIA_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  return cachedKolkataFormatter;
}

export function getDateStringInTimeZone(date = new Date(), timeZone = INDIA_TZ) {
  try {
    const formatter = (!timeZone || timeZone === INDIA_TZ)
      ? getKolkataFormatter()
      : new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });

    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;

    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // fall through
  }
  return new Date().toISOString().slice(0, 10);
}

// Precomputed 30-day date keys cache (computed once per day, 0 allocations per row)
let cachedDateSessionKey = "";
let cachedPast30DaysList = [];

export function getPast30DaysList() {
  const now = new Date();
  const todayKey = getDateStringInTimeZone(now, INDIA_TZ);

  if (todayKey === cachedDateSessionKey && cachedPast30DaysList.length === 30) {
    return cachedPast30DaysList;
  }

  cachedDateSessionKey = todayKey;
  const list = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    list.push(getDateStringInTimeZone(d, INDIA_TZ));
  }
  cachedPast30DaysList = list;
  return list;
}

// WeakMap caches for O(1) instantaneous lookups across table re-renders
const peakFrequencyCache = new WeakMap();
const peakPotentialCache = new WeakMap();
const deliveredCountCache = new WeakMap();
const resolvedPeakCache = new WeakMap();

export function getDateDayNumber(dateStr) {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const time = Date.UTC(year, month - 1, day);

    if (Number.isFinite(time)) return Math.floor(time / 86400000);
  }

  const parsed = Date.parse(dateStr);
  if (Number.isFinite(parsed)) {
    return Math.floor(parsed / 86400000);
  }

  return null;
}

// ─── Peak Frequency Helpers ───────────────────────────────────────────────────

export function normalizePeakFrequency(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (/^D[0-7]$/.test(raw)) return raw;
  if (/^[0-7]$/.test(raw)) return `D${raw}`;
  return "";
}

export function getFrequencyNumber(value) {
  const normalized = normalizePeakFrequency(value);
  const n = Number(String(normalized).slice(1));
  return Number.isFinite(n) && n >= 0 && n <= 7 ? n : 0;
}

export function getPeakFrequencyNumber(customerOrValue) {
  if (typeof customerOrValue === "object" && customerOrValue !== null) {
    return getFrequencyNumber(getPeakFrequencyLabel(customerOrValue));
  }
  return getFrequencyNumber(customerOrValue);
}

/**
 * Computes Peak Frequency (D0 to D7) based on customer's entire lifetime history in last8Days.
 * Evaluates the maximum delivery count in any 7-consecutive-day window across their lifetime.
 */
export function computePeakFrequency(last8Days = {}) {
  if (!last8Days || typeof last8Days !== "object") return "D0";
  if (peakFrequencyCache.has(last8Days)) {
    return peakFrequencyCache.get(last8Days);
  }

  const deliveredDaysSet = new Set();
  for (const [dateStr, entry] of Object.entries(last8Days)) {
    if (!dateStr) continue;
    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || ""
    ).trim().toLowerCase();

    if (status === "delivered") {
      const dayNum = getDateDayNumber(dateStr);
      if (dayNum !== null) {
        deliveredDaysSet.add(dayNum);
      }
    }
  }

  if (deliveredDaysSet.size === 0) {
    const res = "D0";
    peakFrequencyCache.set(last8Days, res);
    return res;
  }

  const sortedDays = Array.from(deliveredDaysSet).sort((a, b) => a - b);
  let maxWeekCount = 0;
  let left = 0;

  // Window of 7 consecutive calendar days (right - left <= 6)
  for (let right = 0; right < sortedDays.length; right++) {
    while (sortedDays[right] - sortedDays[left] > 6) {
      left++;
    }
    const count = right - left + 1;
    if (count > maxWeekCount) {
      maxWeekCount = count;
      if (maxWeekCount >= 7) {
        maxWeekCount = 7;
        break;
      }
    }
  }

  const res = `D${Math.min(maxWeekCount, 7)}`;
  peakFrequencyCache.set(last8Days, res);
  return res;
}

/**
 * High-water mark resolver for Peak Frequency:
 * Returns the maximum between the customer's saved Peak_Frequency and any achieved lifetime peak.
 * Peak frequency never rolls off or decreases; it only increases when a new record is set.
 */
export function resolvePeakFrequency(customer = {}) {
  if (!customer || typeof customer !== "object") return "D0";
  if (resolvedPeakCache.has(customer)) {
    return resolvedPeakCache.get(customer);
  }

  const savedPeak = normalizePeakFrequency(
    customer.Peak_Frequency ||
    customer.peakFrequency ||
    customer.peak_frequency
  );
  const computedPeak = computePeakFrequency(customer.last8Days);

  const savedNum = getFrequencyNumber(savedPeak);
  const compNum = getFrequencyNumber(computedPeak);
  const bestNum = Math.max(savedNum, compNum);

  const result = `D${bestNum}`;
  resolvedPeakCache.set(customer, result);
  return result;
}

export function getPeakFrequencyLabel(customer) {
  return resolvePeakFrequency(customer);
}

export function getPeakFrequencyColor(customerOrValue) {
  const n = getPeakFrequencyNumber(customerOrValue);
  if (n <= 2) return "#FF3B30"; // red
  if (n <= 4) return "#FB8C00"; // orange
  return "#0F9D58"; // green
}

// ─── Potential & Peak Potential Helpers ────────────────────────────────────────

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

export function getPotentialNumber(value) {
  const potential = normalizePotential(value);
  const n = Number(potential.slice(1));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Computes Peak Potential number (max trays in single order) over the last 30 days.
 */
export function computePeakPotentialNumber(last8Days = {}) {
  if (!last8Days || typeof last8Days !== "object") return 0;
  if (peakPotentialCache.has(last8Days)) {
    return peakPotentialCache.get(last8Days);
  }

  const dates = getPast30DaysList();
  let maxTrays = 0;

  for (let i = 0; i < 30; i++) {
    const entry = last8Days[dates[i]];
    if (!entry) continue;

    const status = String(
      typeof entry === "string" ? entry : entry.status || entry.type || ""
    ).trim().toLowerCase();

    if (status !== "delivered") continue;

    const trays =
      entry.traysDelivered ??
      entry.trays ??
      entry.quantity ??
      entry.deliveredTrays ??
      0;
    const numTrays = Number(trays);

    if (Number.isFinite(numTrays) && numTrays > maxTrays) {
      maxTrays = numTrays;
    }
  }

  peakPotentialCache.set(last8Days, maxTrays);
  return maxTrays;
}

export function computePeakPotential(last8Days = {}) {
  const max = computePeakPotentialNumber(last8Days);
  return max > 0 ? `T${max}` : "T1";
}

export const computePotential = computePeakPotential;

export function getPotentialColor(value) {
  const potential = normalizePotential(value);
  const num = parseInt(potential.slice(1), 10);
  if (num <= 7) return "#FF3B30"; // red (T1-T7)
  if (num <= 15) return "#FB8C00"; // orange (T8-T15)
  return "#0F9D58"; // green (T16+)
}

// ─── Current Category & Delivered Counts (Rolling 7 Days) ─────────────────────

export function getDeliveredCountForCustomer(customer) {
  const last8Days = customer?.last8Days || {};
  if (typeof last8Days !== "object") return 0;
  if (deliveredCountCache.has(last8Days)) {
    return deliveredCountCache.get(last8Days);
  }

  const dates = getPast30DaysList();
  let count = 0;

  // Check last 8 days (today + last 7 days: i = 0 through 7) to match original logic
  for (let i = 0; i <= 7; i++) {
    const entry = last8Days[dates[i]];
    if (!entry) continue;

    const status = String(
      typeof entry === "string" ? entry : entry.status || entry.type || ""
    ).trim().toLowerCase();

    if (status === "delivered") {
      count++;
    }
  }

  const result = Math.min(count, 7);
  deliveredCountCache.set(last8Days, result);
  return result;
}

export function getCurrentCategory(customer) {
  return `D${customer?.deliveredCount ?? getDeliveredCountForCustomer(customer)}`;
}

export function computeCurrentCategory(last8DaysOrCustomer) {
  if (last8DaysOrCustomer && typeof last8DaysOrCustomer === "object" && last8DaysOrCustomer.last8Days) {
    return getCurrentCategory(last8DaysOrCustomer);
  }
  return `D${getDeliveredCountForCustomer({ last8Days: last8DaysOrCustomer })}`;
}

export function getCurrentCategoryNumber(category) {
  const match = String(category || "").match(/^D(\d+)$/);
  return match ? Number(match[1]) : 0;
}

export function getCurrentCategoryColor(category) {
  const num = getCurrentCategoryNumber(category);
  if (num <= 2) return "#FF3B30"; // red: D0-D2
  if (num <= 4) return "#FB8C00"; // orange: D3-D4
  return "#0F9D58"; // green: D5-D7
}

export function getCurrentCategoryClasses(category) {
  const num = getCurrentCategoryNumber(category);
  if (num <= 2) return "bg-[#FF3B30] text-white";
  if (num <= 4) return "bg-[#FB8C00] text-white";
  return "bg-[#0F9D58] text-white";
}

// ─── Delivery Gap Helpers ─────────────────────────────────────────────────────

export function normalizeDeliveryGap(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  const match = raw.match(/^G?(\d+)$/);
  if (!match) return "G0";

  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 0) return "G0";

  return `G${Math.floor(n)}`;
}

export function getDeliveryGapNumber(value) {
  const gap = normalizeDeliveryGap(value);
  const n = Number(gap.slice(1));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function getDeliveryGapColor(value) {
  const n = getDeliveryGapNumber(value);
  if (n === 0) return "#0F9D58";
  if (n <= 2) return "#FB8C00";
  return "#FF3B30";
}

export function computeDeliveryGap(last8Days, todayDate, customer = null) {
  return normalizeDeliveryGap(customer?.deliveryGap || "G0");
}

// ─── Frequency Gap & Risk Factor Helpers ───────────────────────────────────────

export function getFrequencyGapNumber(customerOrValue, maybeCurrentCategory) {
  if (typeof customerOrValue === "number") {
    return Math.max(0, Math.min(7, customerOrValue));
  }
  if (typeof customerOrValue === "string") {
    const match = customerOrValue.match(/\d+/);
    return match ? Math.max(0, Math.min(7, Number(match[0]))) : 0;
  }
  if (typeof customerOrValue === "object" && customerOrValue !== null) {
    const peakNum = getPeakFrequencyNumber(customerOrValue);
    const cat = maybeCurrentCategory || getCurrentCategory(customerOrValue);
    const catNum = getCurrentCategoryNumber(cat);
    const gap = peakNum - catNum;
    return Math.max(0, Math.min(7, gap));
  }
  return 0;
}

export function getFrequencyGapLabel(customerOrValue) {
  return `F${getFrequencyGapNumber(customerOrValue)}`;
}

export function getFrequencyGapColor(value) {
  const n = getFrequencyGapNumber(value);
  if (n === 0) return "#0F9D58";
  if (n <= 2) return "#FB8C00";
  return "#FF3B30";
}

export function getRiskFactorNumber(customerOrPeak, maybeCurrentCategory) {
  let peakNum = 0;
  let freqGap = 0;

  if (typeof customerOrPeak === "object" && customerOrPeak !== null) {
    peakNum = getPeakFrequencyNumber(customerOrPeak);
    freqGap = getFrequencyGapNumber(customerOrPeak);
  } else {
    peakNum = typeof customerOrPeak === "number" ? customerOrPeak : getPeakFrequencyNumber(customerOrPeak);
    freqGap = getFrequencyGapNumber(customerOrPeak, maybeCurrentCategory);
  }

  if (!peakNum || peakNum <= 0) return 0;
  const factor = freqGap / peakNum;
  return Number.isFinite(factor) && factor >= 0 ? factor : 0;
}

export function getRiskFactorLabel(customerOrPeak, maybeCurrentCategory) {
  const num = getRiskFactorNumber(customerOrPeak, maybeCurrentCategory);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

export function getRiskFactorColor(value) {
  let n = 0;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    const parsed = parseFloat(value);
    n = Number.isFinite(parsed) ? parsed : 0;
  } else if (typeof value === "object" && value !== null) {
    n = getRiskFactorNumber(value);
  }

  if (n <= 0) return "#0F9D58";
  if (n <= 0.50) return "#FB8C00";
  return "#FF3B30";
}

// ─── Status & Remarks Helpers ─────────────────────────────────────────────────

export function getStatusColor(value) {
  const status = String(value || "")
    .trim()
    .toLowerCase();

  switch (status) {
    case "delivered":
      return "bg-green-100 text-green-800 border border-green-300";
    case "checked":
      return "bg-yellow-100 text-yellow-800 border border-yellow-300";
    default:
      return "bg-red-100 text-red-800 border border-red-300";
  }
}

export function getStatusClasses(statusKey) {
  if (statusKey === "delivered") {
    return "bg-[#0F9D58] text-white";
  }
  if (statusKey === "checked") {
    return "bg-[#FB8C00] text-white";
  }
  return "bg-[#FF3B30] text-white";
}

export function normalizeRetentionRemark(value = "") {
  const text = String(value || "").trim();
  if (!text || text === "-") return "";

  const normalized = text
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized === "price mismatch") {
    return "Price Issue";
  }

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getName(c) {
  return c?.name || c?.customerName || "Unknown";
}

/**
 * Generates an initials map for a list of delivery agent names.
 * Standard format: 2-letter initials (e.g. "TS" for Tapas Singha, "AS" for Ashutosh Sarkar).
 * Collision resolution: When 2 or more names share the same 2-letter initials,
 * disambiguates with 3 letters (e.g. "ASS" / "AMS", or "ASH" / "AMI").
 */
export function buildAgentInitialsMap(agentNames = []) {
  const uniqueNames = Array.from(
    new Set(
      (agentNames || [])
        .filter(Boolean)
        .map((n) => String(n).trim())
        .filter((n) => n && n !== "-" && n !== "Unassigned" && n !== "Unknown Agent"),
    ),
  );

  const get2Letter = (name) => {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const groups = {};
  uniqueNames.forEach((name) => {
    const init2 = get2Letter(name);
    if (!groups[init2]) groups[init2] = [];
    groups[init2].push(name);
  });

  const resultMap = {};

  Object.entries(groups).forEach(([init2, names]) => {
    if (names.length === 1) {
      resultMap[names[0]] = init2;
    } else {
      // Clash detected! Generate unique 3-letter initials for each clashing name
      const usedInitials = new Set();
      names.forEach((name) => {
        const parts = name.split(/\s+/).filter(Boolean);
        let candidate = "";

        // Candidate 1: First 2 of first name + First of last name (e.g. "Ashutosh Sarkar" -> "ASS", "Amit Sharma" -> "AMS")
        if (parts.length >= 2) {
          const c1 = (parts[0].substring(0, 2) + parts[parts.length - 1][0]).toUpperCase();
          if (c1.length === 3 && !usedInitials.has(c1)) {
            candidate = c1;
          }
        }

        // Candidate 2: First of first name + First 2 of last name (e.g. "Ashutosh Sarkar" -> "ASA", "Amit Sharma" -> "ASH")
        if (!candidate && parts.length >= 2) {
          const c2 = (parts[0][0] + parts[parts.length - 1].substring(0, 2)).toUpperCase();
          if (c2.length === 3 && !usedInitials.has(c2)) {
            candidate = c2;
          }
        }

        // Candidate 3: First 3 letters of first name (e.g. "Ashutosh" -> "ASH", "Amit" -> "AMI")
        if (!candidate && parts[0]) {
          const c3 = parts[0].substring(0, 3).toUpperCase();
          if (c3.length === 3 && !usedInitials.has(c3)) {
            candidate = c3;
          }
        }

        // Candidate 4: Any unique 3 letters from name
        if (!candidate) {
          const alphaOnly = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
          for (let i = 0; i <= alphaOnly.length - 3; i++) {
            const sub = alphaOnly.substring(i, i + 3);
            if (!usedInitials.has(sub)) {
              candidate = sub;
              break;
            }
          }
        }

        // Fallback
        if (!candidate) {
          candidate = ((parts[0]?.substring(0, 2) || "AG") + (usedInitials.size + 1)).toUpperCase();
        }

        usedInitials.add(candidate);
        resultMap[name] = candidate;
      });
    }
  });

  return resultMap;
}

/**
 * Returns initials for a single agent name, using the initialsMap if provided
 * or falling back to standard 2-letter initials.
 */
export function getAgentInitials(name, initialsMap = null) {
  if (!name || name === "-" || name === "Unassigned") return "";
  const trimmed = String(name).trim();
  if (initialsMap && initialsMap[trimmed]) {
    return initialsMap[trimmed];
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Checks whether a customer is assigned to a specific delivery agent.
 * Checks:
 * 1. Direct assignments (assignedDeliverymen, deliveredBy, deliveryMan) - handles comma-separated IDs, names, and UIDs.
 * 2. Route assignment - checks if agent's assigned routes (agent.route) includes customer's route (c.route).
 * 3. Today's execution records (last8Days[dateKey]) - if the customer was serviced/checked by this agent.
 */
export function isCustomerAssignedToAgent(customer, agent, dateKey = null) {
  if (!customer || !agent) return false;

  const agentId = String(agent.id || agent._id || "").trim();
  const agentUid = String(agent.uid || "").trim();
  const agentName = String(agent.name || agent.display_name || "").trim().toLowerCase();

  // 1. Direct assignments
  const directFields = [customer.assignedDeliverymen, customer.deliveredBy, customer.deliveryMan];
  for (const raw of directFields) {
    if (!raw) continue;
    const parts = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
    for (const p of parts) {
      if (agentId && p === agentId) return true;
      if (agentUid && p === agentUid) return true;
      if (agentName && p.toLowerCase() === agentName) return true;
    }
  }

  // 2. Route-based assignment (agent.route contains comma-separated routes)
  if (customer.route && agent.route) {
    const agentRoutes = String(agent.route)
      .split(",")
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);
    if (agentRoutes.includes(String(customer.route).trim().toLowerCase())) {
      return true;
    }
  }

  // 3. Execution record for dateKey (or today)
  if (dateKey && customer.last8Days && customer.last8Days[dateKey]) {
    const entry = customer.last8Days[dateKey];
    const entryObj = typeof entry === "object" ? entry : {};
    const eAgentId = String(entryObj.agentId || entryObj.assignedDeliverymen || "").trim();
    const eAgentName = String(entryObj.agentName || "").trim().toLowerCase();
    const eDeliveryMan = String(entryObj.deliveryMan || "").trim();
    const nested = entryObj.assignedDeliverymen || entryObj.agent || null;
    const nestedName = (nested && typeof nested === "object")
      ? String(nested.name || nested.display_name || nested.agentName || "").trim().toLowerCase()
      : (typeof nested === "string" ? nested.trim().toLowerCase() : "");

    if (agentId && (eAgentId === agentId || eDeliveryMan === agentId)) return true;
    if (agentUid && (eAgentId === agentUid || eDeliveryMan === agentUid)) return true;
    if (agentName && (eAgentName === agentName || nestedName === agentName)) return true;
  }

  return false;
}


