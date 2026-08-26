import { getDateStringInTimeZone } from "./aiSuggestionEngine";

// --- Helper Functions ---

/**
 * Gets the delivery status for a specific date from customer's last8Days
 * Returns: "pending" | "checked" | "delivered"
 */
const getDeliveryStatusForDate = (customer, dateStr) => {
  const last8Days = customer?.last8Days || {};
  const entry = last8Days[dateStr];

  if (!entry) return "pending";

  const apiStatus = String(
    typeof entry === "string" ? entry : entry?.status || entry?.type || "",
  )
    .trim()
    .toLowerCase();

  if (apiStatus === "delivered") return "delivered";

  const checkedStatuses = [
    "checked",
    "reached",
    "price_mismatch",
    "shop_closed",
    "stock_available",
    "other_vendor",
    "confirmed_tomorrow",
  ];

  if (checkedStatuses.includes(apiStatus)) return "checked";

  return "pending";
};

// --- Buying Pattern Functions ---

const everyDayBuyer = (customer) => {
  return {
    suggestion: "TURN_ON_TODAY",
    confidence: 100,
    reason: "Customer follows an Every Day buying pattern.",
  };
};

const alternateDayBuyer = (customer) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getDateStringInTimeZone(yesterday, "Asia/Kolkata");
  const yesterdayStatus = getDeliveryStatusForDate(customer, yesterdayStr);

  if (yesterdayStatus === "delivered") {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 100,
      reason: "Delivery received yesterday. Customer follows an Alternate Day buying pattern, so skip today.",
    };
  }

  return {
    suggestion: "TURN_ON_TODAY",
    confidence: 100,
    reason: "No delivery received yesterday. Customer follows an Alternate Day buying pattern, so send today.",
  };
};

const weekdayBuyer = (targetWeekdayName) => {
  const today = new Date();
  const todayWeekdayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Asia/Kolkata",
  }).format(today);

  if (todayWeekdayName === targetWeekdayName) {
    return {
      suggestion: "TURN_ON_TODAY",
      confidence: 100,
      reason: `Today matches the customer's scheduled buying day (${targetWeekdayName}).`,
    };
  }

  return {
    suggestion: "TURN_OFF_TODAY",
    confidence: 100,
    reason: `Today is ${todayWeekdayName}, not their scheduled buying day (${targetWeekdayName}).`,
  };
};

const exceptWeekdayBuyer = (targetWeekdayName) => {
  const today = new Date();
  const todayWeekdayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Asia/Kolkata",
  }).format(today);

  if (todayWeekdayName === targetWeekdayName) {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 100,
      reason: `Customer skips buying on ${targetWeekdayName}s. Today is ${todayWeekdayName}.`,
    };
  }

  return {
    suggestion: "TURN_ON_TODAY",
    confidence: 100,
    reason: `Customer buys on all days except ${targetWeekdayName}. Today is ${todayWeekdayName}.`,
  };
};

const lastWeekdayBuyer = (customer) => {
  let latestDeliveryReference = null;
  const today = new Date();

  // Search from 1 to 14 days ago to find the absolute most recent delivery
  for (let i = 1; i <= 14; i++) {
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - i);
    const dateStr = getDateStringInTimeZone(pastDate, "Asia/Kolkata");
    if (getDeliveryStatusForDate(customer, dateStr) === "delivered") {
      latestDeliveryReference = pastDate;
      break;
    }
  }

  if (!latestDeliveryReference) {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 50,
      reason: "No delivery found in the last 14 days to determine the pattern.",
    };
  }

  const lastDeliveredDay = latestDeliveryReference.getDay(); // 0 (Sun) to 6 (Sat)
  const todayDay = today.getDay(); // 0 to 6

  // Check if today is lastDeliveredDay, lastDeliveredDay - 1, or lastDeliveredDay + 1 (with wrap around)
  const isMatch =
    todayDay === lastDeliveredDay ||
    todayDay === (lastDeliveredDay + 1) % 7 ||
    todayDay === (lastDeliveredDay + 6) % 7; // +6 is same as -1 with modulo

  const weekdayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(latestDeliveryReference);

  if (isMatch) {
    return {
      suggestion: "TURN_ON_TODAY",
      confidence: 90,
      reason: `Customer's latest delivery reference was on ${weekdayName}. Today is within +/- 1 day of that.`,
    };
  } else {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 90,
      reason: `Customer's latest delivery reference was on ${weekdayName}. Today is not within +/- 1 day of that.`,
    };
  }
};

const lastAlternateWeekdayBuyer = (customer) => {
  let latestDeliveryReference = null;
  const today = new Date();

  // Search from 1 to 14 days ago to find the absolute most recent delivery
  for (let i = 1; i <= 14; i++) {
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - i);
    const dateStr = getDateStringInTimeZone(pastDate, "Asia/Kolkata");
    if (getDeliveryStatusForDate(customer, dateStr) === "delivered") {
      latestDeliveryReference = pastDate;
      break;
    }
  }

  if (!latestDeliveryReference) {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 50,
      reason: "No delivery found in the last 14 days to determine the pattern.",
    };
  }

  const lastDeliveredDay = latestDeliveryReference.getDay(); // 0 (Sun) to 6 (Sat)
  const todayDay = today.getDay(); // 0 to 6

  // Check if today is lastDeliveredDay, lastDeliveredDay - 2, or lastDeliveredDay + 2
  const isMatch =
    todayDay === lastDeliveredDay ||
    todayDay === (lastDeliveredDay + 2) % 7 ||
    todayDay === (lastDeliveredDay + 5) % 7; // +5 is same as -2 with modulo

  const weekdayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(latestDeliveryReference);

  if (isMatch) {
    return {
      suggestion: "TURN_ON_TODAY",
      confidence: 90,
      reason: `Customer's latest delivery reference was on ${weekdayName}. Today is within +/- 2 days of that.`,
    };
  } else {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 90,
      reason: `Customer's latest delivery reference was on ${weekdayName}. Today is not within +/- 2 days of that.`,
    };
  }
};

const onCallLogicBuyer = (customer) => {
  return {
    suggestion: "TURN_OFF_TODAY",
    confidence: 100,
    reason: "Customer is an On Call Logic Buyer, so always suggest OFF.",
  };
};

const mondayException = (customer) => {
  const today = new Date();
  const todayWeekdayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Asia/Kolkata",
  }).format(today);

  if (todayWeekdayName === "Monday") {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 100,
      reason: "Monday Exception: Today is Monday, skipping delivery.",
    };
  }

  return {
    suggestion: "TURN_ON_TODAY",
    confidence: 100,
    reason: "Monday Exception: Today is not Monday, proceeding with delivery.",
  };
};

const monthEndException = (customer) => {
  const todayStr = getDateStringInTimeZone(new Date(), "Asia/Kolkata");
  const parts = todayStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const lastDayOfThisMonth = new Date(year, month, 0).getDate();
  const isMonthEnd = day === lastDayOfThisMonth;

  if (isMonthEnd) {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 100,
      reason: `Month-End Exception: Today is the last day of the month (${todayStr}), skipping delivery.`,
    };
  }

  return {
    suggestion: "TURN_ON_TODAY",
    confidence: 100,
    reason: `Month-End Exception: Today is not the last day of the month, proceeding with delivery.`,
  };
};

const churnBuyer = (customer) => {
  return {
    suggestion: "TURN_OFF_TODAY",
    confidence: 100,
    reason: "Customer is flagged as Churn, so always suggest OFF.",
  };
};

// --- Main Engine Function ---

export const BUYING_PATTERNS = [
  "UnAssigned",
  "Every Day Buyer",
  "Alternate Day Buyer",
  "Every Sunday Buyer",
  "Every Monday Buyer",
  "Every Tuesday Buyer",
  "Every Wednesday Buyer",
  "Every Thursday Buyer",
  "Every Friday Buyer",
  "Every Saturday Buyer",
  "Last Weekday Buyer",
  "Last Alternate Weekday Buyer",
  "All Days Except Sunday",
  "All Days Except Monday",
  "All Days Except Tuesday",
  "All Days Except Wednesday",
  "All Days Except Thursday",
  "All Days Except Friday",
  "All Days Except Saturday",
  "On Call Logic Buyer",
  "Monday Exception",
  "Month-End Exception",
  "Churn"
];

const evaluatePattern = (customer, pattern) => {
  switch (pattern) {
    case "UnAssigned":
      return {
        suggestion: "TURN_ON_TODAY",
        confidence: 100,
        reason: "Customer is UnAssigned, defaulting to ON.",
      };
    case "Every Day Buyer":
      return everyDayBuyer(customer);
    case "Alternate Day Buyer":
      return alternateDayBuyer(customer);
    case "Every Sunday Buyer":
      return weekdayBuyer("Sunday");
    case "Every Monday Buyer":
      return weekdayBuyer("Monday");
    case "Every Tuesday Buyer":
      return weekdayBuyer("Tuesday");
    case "Every Wednesday Buyer":
      return weekdayBuyer("Wednesday");
    case "Every Thursday Buyer":
      return weekdayBuyer("Thursday");
    case "Every Friday Buyer":
      return weekdayBuyer("Friday");
    case "Every Saturday Buyer":
      return weekdayBuyer("Saturday");
    case "Last Weekday Buyer":
      return lastWeekdayBuyer(customer);
    case "Last Alternate Weekday Buyer":
      return lastAlternateWeekdayBuyer(customer);
    case "All Days Except Sunday":
      return exceptWeekdayBuyer("Sunday");
    case "All Days Except Monday":
      return exceptWeekdayBuyer("Monday");
    case "All Days Except Tuesday":
      return exceptWeekdayBuyer("Tuesday");
    case "All Days Except Wednesday":
      return exceptWeekdayBuyer("Wednesday");
    case "All Days Except Thursday":
      return exceptWeekdayBuyer("Thursday");
    case "All Days Except Friday":
      return exceptWeekdayBuyer("Friday");
    case "All Days Except Saturday":
      return exceptWeekdayBuyer("Saturday");
    case "On Call Logic Buyer":
      return onCallLogicBuyer(customer);
    case "Monday Exception":
      return mondayException(customer);
    case "Month-End Exception":
      return monthEndException(customer);
    case "Churn":
      return churnBuyer(customer);
    default:
      return {
        suggestion: "TURN_OFF_TODAY",
        confidence: 0,
        score: 0,
        reason: "Unknown Buying Pattern selected.",
      };
  }
};

export const generateDummyAISuggestion = (customer, primaryPattern = "UnAssigned", secondaryPattern = "UnAssigned", tertiaryPattern = "UnAssigned") => {
  const skipConfig = customer?.skipConfig || {};

  // RULE: Skip config active (Applies across all patterns)
  if (skipConfig?.days > 0) {
    return {
      suggestion: "KEEP_OFF_TODAY",
      confidence: 100,
      score: 0,
      reason: "Customer currently in skip mode.",
    };
  }

  const primaryResult = evaluatePattern(customer, primaryPattern);
  const secondaryResult = evaluatePattern(customer, secondaryPattern);
  const tertiaryResult = evaluatePattern(customer, tertiaryPattern);

  const isPrimaryOn = primaryResult.suggestion.includes("ON");
  const isSecondaryOn = secondaryResult.suggestion.includes("ON");
  const isTertiaryOn = tertiaryResult.suggestion.includes("ON");

  if (isPrimaryOn && isSecondaryOn && isTertiaryOn) {
    return {
      suggestion: "TURN_ON_TODAY",
      confidence: Math.min(primaryResult.confidence, secondaryResult.confidence, tertiaryResult.confidence),
      reason: `Primary: ${primaryResult.reason} | Secondary: ${secondaryResult.reason} | Tertiary: ${tertiaryResult.reason}`,
    };
  } else {
    const offLogics = [];
    if (!isPrimaryOn) offLogics.push(`Primary: ${primaryResult.reason}`);
    if (!isSecondaryOn) offLogics.push(`Secondary: ${secondaryResult.reason}`);
    if (!isTertiaryOn) offLogics.push(`Tertiary: ${tertiaryResult.reason}`);
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: Math.max(primaryResult.confidence, secondaryResult.confidence, tertiaryResult.confidence),
      reason: `OFF because - ${offLogics.join(" | ")}`,
    };
  }
};
