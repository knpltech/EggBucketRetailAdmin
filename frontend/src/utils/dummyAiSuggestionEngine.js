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
    suggestion: "TURN_ON_TOMORROW",
    confidence: 100,
    reason: "Customer follows an Every Day buying pattern.",
  };
};

const alternateDayBuyer = (customer) => {
  const today = new Date();
  const todayStr = getDateStringInTimeZone(today, "Asia/Kolkata");
  const todayStatus = getDeliveryStatusForDate(customer, todayStr);
  
  if (todayStatus === "delivered") {
    return {
      suggestion: "TURN_OFF_TOMORROW",
      confidence: 100,
      reason: "Delivery received today. Customer follows an Alternate Day buying pattern, so skip tomorrow.",
    };
  }

  return {
    suggestion: "TURN_ON_TOMORROW",
    confidence: 100,
    reason: "No delivery received today. Customer follows an Alternate Day buying pattern, so send tomorrow.",
  };
};

const weekdayBuyer = (targetWeekdayName) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowWeekdayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Asia/Kolkata",
  }).format(tomorrow);

  if (tomorrowWeekdayName === targetWeekdayName) {
    return {
      suggestion: "TURN_ON_TOMORROW",
      confidence: 100,
      reason: `Tomorrow matches the customer's scheduled buying day (${targetWeekdayName}).`,
    };
  }

  return {
    suggestion: "TURN_OFF_TOMORROW",
    confidence: 100,
    reason: `Tomorrow is ${tomorrowWeekdayName}, not their scheduled buying day (${targetWeekdayName}).`,
  };
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
  "Every Saturday Buyer"
];

export const generateDummyAISuggestion = (customer, pattern = "Every Day Buyer") => {
  const skipConfig = customer?.skipConfig || {};

  // RULE: Skip config active (Applies across all patterns)
  if (skipConfig?.days > 0) {
    return {
      suggestion: "KEEP_OFF_TOMORROW",
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
    default:
      return {
        suggestion: "TURN_OFF_TOMORROW",
        confidence: 0,
        score: 0,
        reason: "Unknown Buying Pattern selected.",
      };
  }
};
