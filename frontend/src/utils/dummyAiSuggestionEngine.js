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

const lastWeekdayBuyer = (customer) => {
  let latestDeliveryLastWeek = null;
  const today = new Date();
  
  // Search from 7 to 14 days ago to find the most recent delivery from "last week"
  for (let i = 7; i <= 14; i++) {
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - i);
    const dateStr = getDateStringInTimeZone(pastDate, "Asia/Kolkata");
    if (getDeliveryStatusForDate(customer, dateStr) === "delivered") {
      latestDeliveryLastWeek = pastDate;
      break; // Found the latest one, ignore any older ones (e.g. ignore Tuesday if Thursday is found)
    }
  }

  if (!latestDeliveryLastWeek) {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 50,
      reason: "No delivery found last week to determine the pattern.",
    };
  }

  const lastDeliveredDay = latestDeliveryLastWeek.getDay(); // 0 (Sun) to 6 (Sat)
  const todayDay = today.getDay(); // 0 to 6

  // Check if today is lastDeliveredDay, lastDeliveredDay - 1, or lastDeliveredDay + 1 (with wrap around)
  const isMatch = 
    todayDay === lastDeliveredDay || 
    todayDay === (lastDeliveredDay + 1) % 7 || 
    todayDay === (lastDeliveredDay + 6) % 7; // +6 is same as -1 with modulo

  const weekdayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(latestDeliveryLastWeek);

  if (isMatch) {
    return {
      suggestion: "TURN_ON_TODAY",
      confidence: 90,
      reason: `Customer's latest delivery last week was on ${weekdayName}. Today is within +/- 1 day of that.`,
    };
  } else {
    return {
      suggestion: "TURN_OFF_TODAY",
      confidence: 90,
      reason: `Customer's latest delivery last week was on ${weekdayName}. Today is not within +/- 1 day of that.`,
    };
  }
};

// --- Main Engine Function ---

export const BUYING_PATTERNS = [
  "Every Day Buyer",
  "Alternate Day Buyer",
  "Every Sunday Buyer",
  "Every Monday Buyer",
  "Every Tuesday Buyer",
  "Every Wednesday Buyer",
  "Every Thursday Buyer",
  "Every Friday Buyer",
  "Every Saturday Buyer",
  "Last Weekday Buyer"
];

export const generateDummyAISuggestion = (customer, pattern = "Every Day Buyer") => {
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

  switch (pattern) {
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
    default:
      return {
        suggestion: "TURN_OFF_TODAY",
        confidence: 0,
        score: 0,
        reason: "Unknown Buying Pattern selected.",
      };
  }
};
