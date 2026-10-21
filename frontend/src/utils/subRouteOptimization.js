import {
  computeCurrentCategory,
  computeDeliveryGap,
  normalizeDeliveryGap,
  getDeliveryGapNumber,
  normalizePeakFrequency,
} from "./dummyAiSuggestionEngine";

export const extractParentRoute = (routeName) => {
  if (!routeName) return "Other";
  const trimmed = routeName.trim();
  const match = trimmed.match(/^(R\d+)([A-Za-z])?(.*)$/i);
  if (match) {
    return match[1].toUpperCase();
  }
  const parts = trimmed.split(/[\s-]+/);
  if (parts.length > 0 && parts[0]) {
    return parts[0].toUpperCase();
  }
  return trimmed;
};

/**
 * Check if a route is excluded from auto sub-route optimization.
 * Auto sub-route is allowed for ONLY sub-routes A, B, C, and D.
 * If any other sub-route letters/words exist (like N, X, Q, Out of Service, On-Boarding, etc.),
 * they are strictly excluded (no suggestions).
 */
export const isExcludedRoute = (routeName) => {
  if (!routeName || typeof routeName !== "string") return true;
  const trimmed = routeName.trim();
  if (!trimmed) return true;

  const upper = trimmed.toUpperCase();

  // 1. Common keywords for administrative or non-optimizable routes
  if (
    upper.includes("OUT OF SERVICE") ||
    upper.includes("OUT_OF_SERVICE") ||
    upper.includes("ON_BOARDING") ||
    upper.includes("ON BOARDING") ||
    upper.includes("ONBOARDING")
  ) {
    return true;
  }

  // 2. Must match standard parent route with sub-route tier letter (e.g. R001A, R001-B, Route 1 C)
  const match = trimmed.match(/^(?:ROUTE\s*|R)[\s\-_]*(\d+)[\s\-_]*([A-Za-z])/i);
  if (!match || !match[2]) {
    return true;
  }

  const subRouteLetter = match[2].toUpperCase();
  // Strictly allow ONLY A, B, C, D. Any other sub-routes (such as N, X, Q, etc.) -> excluded (no suggestions)
  if (!["A", "B", "C", "D"].includes(subRouteLetter)) {
    return true;
  }

  return false;
};

/**
 * Determine recommended tier (A, B, C, D) strictly based on customer metrics:
 * - Route A: Current Category D7, D6, D5
 * - Route B: Current Category D4, D3, D2
 * - Route C: Current Category D1
 * - Route D: Delivery Gap G8, G9, G10, G10+
 */
export function evaluateSubRouteTier(customer, todayDate) {
  const rawGap = computeDeliveryGap(customer?.last8Days, todayDate, customer);
  const gapStr = normalizeDeliveryGap(rawGap);
  const gapNum = getDeliveryGapNumber(gapStr);

  const rawCategory = computeCurrentCategory(customer?.last8Days);
  const categoryStr = normalizePeakFrequency(rawCategory);
  const dNum = parseInt(categoryStr.replace("D", ""), 10) || 0;

  // Rule 1: Delivery Gap G8, G9, G10, G10+ (or D0) -> Route D
  if (gapNum >= 8 || dNum === 0) {
    return {
      tier: "D",
      tierLabel: "Route D (Delivery Gap G8+)",
      reason: gapNum >= 8 ? `Delivery Gap is ${gapStr}` : `Current Category is ${categoryStr}`,
      category: categoryStr,
      gap: gapStr,
    };
  }

  // Rule 2: Current Category D7, D6, D5 -> Route A
  if (dNum >= 5) {
    return {
      tier: "A",
      tierLabel: "Route A (Current Category D5-D7)",
      reason: `Current Category is ${categoryStr}`,
      category: categoryStr,
      gap: gapStr,
    };
  }

  // Rule 3: Current Category D4, D3, D2 -> Route B
  if (dNum >= 2 && dNum <= 4) {
    return {
      tier: "B",
      tierLabel: "Route B (Current Category D2-D4)",
      reason: `Current Category is ${categoryStr}`,
      category: categoryStr,
      gap: gapStr,
    };
  }

  // Rule 4: Current Category D1 -> Route C
  if (dNum === 1) {
    return {
      tier: "C",
      tierLabel: "Route C (Current Category D1)",
      reason: `Current Category is ${categoryStr}`,
      category: categoryStr,
      gap: gapStr,
    };
  }

  // If none of the conditions match, customer does not move
  return null;
}

/**
 * Resolve target sub-route strictly within the same parent route
 */
export function resolveTargetSubRoute(customer, allRoutes, todayDate) {
  const currentRouteName = (customer.route || "").trim();
  if (!currentRouteName) return null;

  // Exclude customers who are in N or X routes (e.g., R001N, R001X, On-Boarding, Out of Service)
  if (isExcludedRoute(currentRouteName)) {
    return null;
  }

  const parentKey = extractParentRoute(currentRouteName);
  if (!parentKey || parentKey === "Other") return null;

  // Strictly filter routes belonging to the EXACT SAME parent route, excluding any non-ABCD routes
  const parentSubRoutes = allRoutes.filter((r) => {
    const rName = typeof r === "string" ? r : r.name;
    return extractParentRoute(rName) === parentKey && !isExcludedRoute(rName);
  });

  // If there is only 1 sub-route or none under this parent, cannot reassign
  if (parentSubRoutes.length <= 1) {
    return null;
  }

  const evaluation = evaluateSubRouteTier(customer, todayDate);
  if (!evaluation) {
    return null;
  }
  const targetLetter = evaluation.tier; // "A", "B", "C", or "D"

  // Find the sub-route belonging to this parent that has the target letter
  // Pattern: starts with parentKey + targetLetter, e.g. R001A, R001B, R001C, R001D
  const matchedRouteObj = parentSubRoutes.find((r) => {
    const rName = (typeof r === "string" ? r : r.name).trim().toUpperCase();
    const regex = new RegExp(`^${parentKey}[\\s\\-_]*${targetLetter}`, "i");
    return regex.test(rName);
  });

  if (!matchedRouteObj) {
    // If the parent route doesn't have a sub-route with this tier (e.g. only has A and B, but target is D),
    // do not reassign to a non-existent or wrong parent route!
    return null;
  }

  const matchedRouteName = typeof matchedRouteObj === "string" ? matchedRouteObj : matchedRouteObj.name;

  // Target route must be an allowed ABCD sub-route
  if (isExcludedRoute(matchedRouteName)) {
    return null;
  }

  return {
    customerId: customer.id,
    customerName: customer.shopName || customer.name || "Customer",
    phone: customer.phone || "",
    parentKey,
    currentRoute: currentRouteName,
    targetRoute: matchedRouteName,
    isChanged: currentRouteName !== matchedRouteName,
    ...evaluation,
  };
}

/**
 * Compute all pending sub-route reassignments across all customers
 */
export function computeSubRouteReassignments(customers, allRoutes, todayDate) {
  const allAnalyses = [];
  const pendingChanges = [];

  customers.forEach((customer) => {
    const result = resolveTargetSubRoute(customer, allRoutes, todayDate);
    if (!result) return;

    allAnalyses.push(result);
    if (result.isChanged) {
      pendingChanges.push(result);
    }
  });

  const stats = {
    totalEvaluated: allAnalyses.length,
    totalChanges: pendingChanges.length,
    toTierA: pendingChanges.filter((c) => c.tier === "A").length,
    toTierB: pendingChanges.filter((c) => c.tier === "B").length,
    toTierC: pendingChanges.filter((c) => c.tier === "C").length,
    toTierD: pendingChanges.filter((c) => c.tier === "D").length,
  };

  return {
    stats,
    pendingChanges,
    allAnalyses,
  };
}
