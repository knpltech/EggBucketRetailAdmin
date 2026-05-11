export const generateAISuggestion = (customer) => {
  let score = 50;
  let reason = "Customer demand is stable.";

  // Extract data safely
  const last8Days = customer?.last8Days || {};
  const latestRemark = (customer?.latestRemark || "").toLowerCase();
  const skipConfig = customer?.skipConfig || {};

  // RULE 5: Skip config active
  if (skipConfig?.days > 0) {
    return {
      suggestion: "KEEP_OFF_TOMORROW",
      confidence: 100,
      score: 0,
      reason: "Customer currently in skip mode.",
    };
  }

  let stockAvailableCount = 0;
  let deliveredCount = 0;
  let recentActivityCount = 0; // Activity in the last 3 days

  const today = new Date();
  const recentDays = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    recentDays.push(d.toISOString().split("T")[0]);
  }

  // Iterate over last8Days
  Object.entries(last8Days).forEach(([dateStr, entry]) => {
    if (!entry) return;

    const status = (typeof entry === "string" ? entry : entry.status || entry.type || "").toLowerCase();
    const entryReason = (typeof entry === "object" ? entry.reason || entry.checkReason || "" : "").toLowerCase();

    if (entryReason.includes("stock available") || status === "stock_available") {
      stockAvailableCount++;
    }

    if (status === "delivered") {
      deliveredCount++;
    }

    // Check recent activity
    if (recentDays.includes(dateStr)) {
      if (status) {
        recentActivityCount++;
      }
    }
  });

  // RULE 1: Stock Available >= 3
  if (stockAvailableCount >= 3) {
    score -= 40;
    reason = "Customer likely has enough eggs for tomorrow.";
  }

  // RULE 2: latestRemark contains "0 trays"
  if (latestRemark.includes("0 trays") || latestRemark.includes("0 tray")) {
    score += 50;
    reason = "Customer may need eggs tomorrow.";
  } 
  // RULE 3: latestRemark contains "1 tray"
  else if (latestRemark.includes("1 tray")) {
    score += 20;
    reason = "Customer running low on stock.";
  }

  // RULE 4: No recent activity
  if (recentActivityCount === 0) {
    score -= 20;
    if (score < 40) reason = "No recent activity, likely does not need delivery.";
  }

  // RULE 6: Delivered count >= 5
  if (deliveredCount >= 5) {
    score += 20;
    if (score >= 70) reason = "Frequent deliveries, high chance of order.";
  }

  // FINAL DECISION LOGIC
  let suggestion = "";
  if (score >= 70) {
    suggestion = "TURN_ON_TOMORROW";
  } else if (score >= 40 && score < 70) {
    suggestion = "KEEP_ON_TOMORROW";
  } else if (score >= 20 && score < 40) {
    suggestion = "KEEP_OFF_TOMORROW";
  } else {
    suggestion = "TURN_OFF_TOMORROW";
  }

  // Confidence Calculation
  let confidence = Math.min(Math.abs(score - 50) * 2, 100);

  return {
    suggestion,
    confidence,
    score,
    reason,
  };
};
