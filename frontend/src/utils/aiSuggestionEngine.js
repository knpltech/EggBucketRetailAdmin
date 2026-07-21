export function getDateStringInTimeZone(date, timeZone) {
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
    // eslint-disable-next-line no-unused-vars
  } catch (error) { /* empty */ }
  return new Date().toISOString().slice(0, 10);
}

export function getDateDayNumber(dateStr) {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(time)) return null;
  return Math.floor(time / 86400000);
}

export const normalizePeakFrequency = (value) => {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();

  if (/^D[0-7]$/.test(raw)) return raw;
  if (/^[0-7]$/.test(raw)) return `D${raw}`;

  return "D0";
};

export const getPeakFrequencyNumber = (value) => {
  const peak = normalizePeakFrequency(value);
  const n = Number(peak.slice(1));
  return Number.isFinite(n) && n >= 0 && n <= 7 ? n : 0;
};

export const getCurrentCategoryNumber = (value) => {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  const match = raw.match(/^D([0-7])$/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n >= 0 && n <= 7 ? n : 0;
};

export const computeCurrentCategory = (last8Days) => {
  if (!last8Days || typeof last8Days !== "object") return "D0";

  let count = 0;
  const today = new Date();

  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = getDateStringInTimeZone(d, "Asia/Kolkata");
    const entry = last8Days[dateStr];
    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || "",
    )
      .trim()
      .toLowerCase();

    if (status === "delivered") count++;
  }

  return `D${Math.min(count, 7)}`;
};

export const computePeakFrequency = (last8Days) => {
  if (!last8Days || typeof last8Days !== "object") return "D0";

  let count = 0;
  const today = new Date();

  for (let i = 0; i <= 6; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = getDateStringInTimeZone(d, "Asia/Kolkata");
    const entry = last8Days[dateStr];
    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || "",
    )
      .trim()
      .toLowerCase();

    if (status === "delivered") count++;
  }

  return `D${Math.min(count, 7)}`;
};

export const resolvePeakFrequency = (customer) => {
  const savedPeak = normalizePeakFrequency(
    customer?.Peak_Frequency ||
    customer?.peakFrequency ||
    customer?.peak_frequency,
  );
  const currentPeak = computePeakFrequency(customer?.last8Days);

  return getPeakFrequencyNumber(savedPeak) >=
    getPeakFrequencyNumber(currentPeak)
    ? savedPeak
    : currentPeak;
};

export function computeDeliveryGap(last8Days, todayDate) {
  if (!last8Days || typeof last8Days !== "object") return "G10";
  const todayDayNumber = getDateDayNumber(todayDate);
  if (todayDayNumber === null) return "G10";
  let latestDeliveredDayNumber = null;
  Object.entries(last8Days).forEach(([dateStr, entry]) => {
    const status = String(
      typeof entry === "string" ? entry : entry?.status || entry?.type || "",
    )
      .trim()
      .toLowerCase();
    if (status !== "delivered") return;
    const dayNumber = getDateDayNumber(dateStr);
    if (dayNumber === null || dayNumber > todayDayNumber) return;
    if (
      latestDeliveredDayNumber === null ||
      dayNumber > latestDeliveredDayNumber
    ) {
      latestDeliveredDayNumber = dayNumber;
    }
  });
  if (latestDeliveredDayNumber === null) return "G10";
  return `G${Math.min(todayDayNumber - latestDeliveredDayNumber, 10)}`;
}

export function normalizeDeliveryGap(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  const match = raw.match(/^G?(\d+)$/);
  if (!match) return "G10";
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 0) return "G10";
  return `G${Math.min(Math.floor(n), 10)}`;
}

export function getDeliveryGapNumber(value) {
  const gap = normalizeDeliveryGap(value);
  const n = Number(gap.slice(1));
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 10;
}

export const getTodayEffectiveStatus = (
  customer,
  todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata"),
) => {
  const override = customer?.todayOverride || {};

  const overrideDate = String(override?.date || "").slice(0, 10);

  // ⭐ HIGHEST PRIORITY: todayOverride for today
  if (
    overrideDate === todayDate &&
    (override?.status === "ON" || override?.status === "OFF")
  ) {
    return override.status;
  }

  // Fallback: Weekly schedule
  const weeklySchedule = customer?.weeklySchedule || {};

  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Kolkata",
  })
    .format(new Date())
    .toLowerCase()
    .substring(0, 3);

  return weeklySchedule[weekday] ? "ON" : "OFF";
};

export const generateAISuggestion = (customer, logicOption = "logic1") => {
  const skipConfig = customer?.skipConfig || {};

  // RULE: Skip config active (Applies across all logics)
  if (skipConfig?.days > 0) {
    return {
      suggestion: "KEEP_OFF_TOMORROW",
      confidence: 100,
      score: 0,
      reason: "Customer currently in skip mode.",
    };
  }

  // LOGIC 1
  if (logicOption === "logic1") {
    const peakFrequencyStr = resolvePeakFrequency(customer);
    const peakFrequencyNumber = getPeakFrequencyNumber(peakFrequencyStr);

    const todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata");
    const rawDeliveryGap = computeDeliveryGap(customer?.last8Days, todayDate);
    const deliveryGapStr = normalizeDeliveryGap(
      customer?.deliveryGap || rawDeliveryGap,
    );
    const deliveryGapNumber = getDeliveryGapNumber(deliveryGapStr);

    const aiScore = peakFrequencyNumber - 7 + deliveryGapNumber;
    let suggestion = "";
    let reason = `AI Score: ${aiScore} (Peak: ${peakFrequencyNumber}, Gap: ${deliveryGapNumber})`;

    if (aiScore >= 0) {
      suggestion = "TURN_ON_TOMORROW";
    } else if (aiScore < 0) {
      suggestion = "TURN_OFF_TOMORROW";
    }

    const confidence = Math.min(Math.abs(aiScore) * 20, 100);

    return {
      suggestion,
      confidence,
      score: aiScore,
      reason,
    };
  }

  // LOGIC 2: Peak frequency retention/upmove rules
  if (logicOption === "logic2") {
    const peakFrequencyStr = resolvePeakFrequency(customer);
    const peakFrequencyNumber = getPeakFrequencyNumber(peakFrequencyStr);

    const todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata");
    const rawDeliveryGap = computeDeliveryGap(customer?.last8Days, todayDate);
    const deliveryGapStr = normalizeDeliveryGap(
      customer?.deliveryGap || rawDeliveryGap,
    );
    const deliveryGapNumber = getDeliveryGapNumber(deliveryGapStr);
    const logic1Score = peakFrequencyNumber - 7 + deliveryGapNumber;

    if (peakFrequencyNumber >= 4) {
      return {
        suggestion: "TURN_ON_TOMORROW",
        confidence: 100,
        score: logic1Score,
        reason: `AI Score: ${logic1Score} - Logic 2: D${peakFrequencyNumber} customer. Permanent ON for retention/upmove.`,
      };
    }

    if (peakFrequencyNumber >= 1 && peakFrequencyNumber <= 3) {
      const maxAllowedGap = 4 - peakFrequencyNumber;
      const shouldTurnOn = deliveryGapNumber > maxAllowedGap;

      return {
        suggestion: shouldTurnOn ? "TURN_ON_TOMORROW" : "TURN_OFF_TOMORROW",
        confidence: shouldTurnOn ? 90 : 80,
        score: logic1Score,
        reason: `AI Score: ${logic1Score} - Logic 2: D${peakFrequencyNumber} customer. OFF when gap is G0-G${maxAllowedGap}; current gap is G${deliveryGapNumber}.`,
      };
    }

    return {
      suggestion: "KEEP_OFF_TOMORROW",
      confidence: 100,
      score: logic1Score,
      reason: `AI Score: ${logic1Score} - Logic 2: D0 customer. Manual approach for retention/data understanding stage.`,
    };
  }

  // LOGIC 3: Current category vs peak frequency
  if (logicOption === "logic3") {
    const currentCategory = computeCurrentCategory(customer?.last8Days);
    const currentCategoryNumber = getCurrentCategoryNumber(currentCategory);
    const peakFrequencyStr = resolvePeakFrequency(customer);
    const peakFrequencyNumber = getPeakFrequencyNumber(peakFrequencyStr);
    const score = peakFrequencyNumber - currentCategoryNumber;

    return {
      suggestion:
        currentCategoryNumber < peakFrequencyNumber
          ? "TURN_ON_TOMORROW"
          : "TURN_OFF_TOMORROW",
      confidence: currentCategoryNumber < peakFrequencyNumber ? 95 : 90,
      score,
      reason: `Logic 3: Current Category ${currentCategory}, Peak Frequency ${peakFrequencyStr}.`,
    };
  }

  // LOGIC 4: Delivery gap / peak frequency ratio
  if (logicOption === "logic4") {
    const peakFrequencyStr = resolvePeakFrequency(customer);
    const peakFrequencyNumber = getPeakFrequencyNumber(peakFrequencyStr);

    const todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata");
    const rawDeliveryGap = computeDeliveryGap(customer?.last8Days, todayDate);
    const deliveryGapStr = normalizeDeliveryGap(
      customer?.deliveryGap || rawDeliveryGap,
    );
    const deliveryGapNumber = getDeliveryGapNumber(deliveryGapStr);
    const ratio =
      peakFrequencyNumber > 0 ? deliveryGapNumber / peakFrequencyNumber : 0;
    const shouldTurnOn = ratio >= 1;

    return {
      suggestion: shouldTurnOn ? "TURN_ON_TOMORROW" : "TURN_OFF_TOMORROW",
      confidence: shouldTurnOn ? 90 : 80,
      score: ratio,
      reason: `Logic 4: Delivery Gap ${deliveryGapStr} / Peak Frequency ${peakFrequencyStr} = ${ratio.toFixed(2)}. ${ratio < 1 ? "Turn OFF" : "Turn ON"}.`,
    };
  }

  // LOGIC 5: Delivery gap / current category ratio
  if (logicOption === "logic5") {
    const currentCategory = computeCurrentCategory(customer?.last8Days);
    const currentCategoryNumber = getCurrentCategoryNumber(currentCategory);

    const todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata");
    const rawDeliveryGap = computeDeliveryGap(customer?.last8Days, todayDate);
    const deliveryGapStr = normalizeDeliveryGap(
      customer?.deliveryGap || rawDeliveryGap,
    );
    const deliveryGapNumber = getDeliveryGapNumber(deliveryGapStr);
    const ratio =
      currentCategoryNumber > 0 ? deliveryGapNumber / currentCategoryNumber : 0;
    const shouldTurnOn = ratio >= 1;

    return {
      suggestion: shouldTurnOn ? "TURN_ON_TOMORROW" : "TURN_OFF_TOMORROW",
      confidence: shouldTurnOn ? 90 : 80,
      score: ratio,
      reason: `Logic 5: Delivery Gap ${deliveryGapStr} / Current Category ${currentCategory} = ${ratio.toFixed(2)}. ${ratio < 1 ? "Turn OFF" : "Turn ON"}.`,
    };
  }

  // LOGIC 7: Last same weekday delivery status
  if (logicOption === "logic7") {
    const today = new Date();
    // Use Asia/Kolkata weekday name to avoid server/local mismatch
    const weekday = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "Asia/Kolkata",
    }).format(today);

    // Since all weeks are 7 days, “last {weekday}” => today - 7 days
    const lastWeekSameWeekday = new Date(today);
    lastWeekSameWeekday.setDate(lastWeekSameWeekday.getDate() - 7);
    const lastWeekdayDate = getDateStringInTimeZone(
      lastWeekSameWeekday,
      "Asia/Kolkata",
    );

    const lastWeekdayEntry = customer?.last8Days?.[lastWeekdayDate];
    const lastWeekdayStatus = String(
      typeof lastWeekdayEntry === "string"
        ? lastWeekdayEntry
        : lastWeekdayEntry?.status || lastWeekdayEntry?.type || "",
    )
      .trim()
      .toLowerCase();

    const didDeliverLastWeekday = lastWeekdayStatus === "delivered";

    return {
      suggestion: didDeliverLastWeekday ? "TURN_ON_TOMORROW" : "TURN_OFF_TOMORROW",
      confidence: didDeliverLastWeekday ? 95 : 85,
      score: didDeliverLastWeekday ? 1 : -1,
      reason: `Logic 7: Today is ${weekday}. Checking last ${weekday} (${lastWeekdayDate}) status: ${lastWeekdayStatus || "pending"}. ${didDeliverLastWeekday ? "Delivered last week same weekday, turn ON" : "Not delivered last week same weekday, turn OFF"}.`,
    };
  }

  // LOGIC 6: Yesterday delivery status
  if (logicOption === "logic6") {

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = getDateStringInTimeZone(yesterday, "Asia/Kolkata");

    const yesterdayEntry = customer?.last8Days?.[yesterdayDate];
    const yesterdayStatus = String(
      typeof yesterdayEntry === "string"
        ? yesterdayEntry
        : yesterdayEntry?.status || yesterdayEntry?.type || "",
    )
      .trim()
      .toLowerCase();

    const didDeliverYesterday = yesterdayStatus === "delivered";

    // “checked” OR “pending” should turn ON tomorrow.
    const isYesterdayCheckedOrPending =
      yesterdayStatus === "pending" ||
      yesterdayStatus === "checked";

    return {
      suggestion: didDeliverYesterday
        ? "TURN_OFF_TOMORROW"
        : isYesterdayCheckedOrPending
          ? "TURN_ON_TOMORROW"
          : "TURN_OFF_TOMORROW",
      confidence: didDeliverYesterday ? 90 : 85,
      score: didDeliverYesterday ? -1 : isYesterdayCheckedOrPending ? 1 : -1,
      reason: `Logic 6: Yesterday (${yesterdayDate}) status is ${yesterdayStatus || "pending"}. ${didDeliverYesterday ? "Delivery happened yesterday, turn OFF" : isYesterdayCheckedOrPending ? "Yesterday was checked/pending, turn ON" : "Yesterday was neither delivered nor checked/pending, keep OFF"}.`,
    };
  }


  // Fallback if an unknown logic is selected
  return {
    suggestion: "TURN_OFF_TOMORROW",
    confidence: 0,
    score: 0,
    reason: "Unknown AI Logic selected",
  };
};

/**
 * Get today's delivery status from customer's last8Days
 * Returns: "pending" | "checked" | "delivered"
 */
export const getTodayDeliveryStatus = (
  customer,
  todayDate = getDateStringInTimeZone(new Date(), "Asia/Kolkata"),
) => {
  const last8Days = customer?.last8Days || {};
  const todayEntry = last8Days[todayDate];

  if (!todayEntry) {
    return "pending";
  }

  const apiStatus = String(
    typeof todayEntry === "string" ? todayEntry : todayEntry?.status || todayEntry?.type || "",
  )
    .trim()
    .toLowerCase();

  // Check if delivered
  if (apiStatus === "delivered") {
    return "delivered";
  }

  // Check if checked (includes: reached, price_mismatch, shop_closed, stock_available, other_vendor)
  const checkedStatuses = [
    "checked",
    "reached",
    "price_mismatch",
    "shop_closed",
    "stock_available",
    "other_vendor",
  ];

  if (checkedStatuses.includes(apiStatus)) {
    return "checked";
  }

  return "pending";
};
