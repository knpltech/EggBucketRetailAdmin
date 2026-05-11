# AI Suggestions Engine - Documentation

This document explains the architecture and business logic behind the AI Suggestions feature found in the Admin Dashboard. This module predicts the next day's delivery action (`ON` or `OFF`) for each customer based on their recent history.

## Overview

The AI Engine is a **Rule-Based Prediction Engine** located in `frontend/src/utils/aiSuggestionEngine.js`. It does NOT use Machine Learning (like TensorFlow). Instead, it evaluates the customer's `last8Days` activity, remarks, and delivery configuration to make intelligent, determinable suggestions.

### The Objective
To tell the Delivery or Admin team whether a customer will likely need an egg delivery **tomorrow**.

- **🟢 Turn ON Tomorrow:** High probability the customer needs stock.
- **🔴 Turn OFF Tomorrow:** High probability the customer does not need stock.
- **🟡 Keep ON Tomorrow:** Stable demand; continue deliveries.
- **🟠 Keep OFF Tomorrow:** Customer is inactive or explicitly in "Skip Mode".

---

## Data Source

The suggestion engine takes a standard `customer` object as its input, which contains:
- `last8Days`: An object/map tracking the last 8 days of delivery statuses.
- `latestRemark`: Any recent text notes added by a delivery agent.
- `skipConfig`: Configurations for pausing deliveries.
- `todayOverride`: The current toggle state for today.

---

## Scoring System & Rules

The engine starts with a base score of **50**. We apply several rules to adjust this score up (more likely to need delivery) or down (less likely to need delivery).

### Rules Breakdown:

1. **Rule 1: Excess Stock (-40 points)**
   - **Condition:** If the reason "STOCK AVAILABLE" appears 3 or more times in the `last8Days`.
   - **Reasoning:** The customer likely has enough eggs to last another day.

2. **Rule 2: Out of Stock (+50 points)**
   - **Condition:** If `latestRemark` contains "0 trays".
   - **Reasoning:** The customer is entirely out of stock and urgently needs a delivery.

3. **Rule 3: Low Stock (+20 points)**
   - **Condition:** If `latestRemark` contains "1 tray".
   - **Reasoning:** The customer is running low.

4. **Rule 4: Prolonged Inactivity (-20 points)**
   - **Condition:** If there is no delivery or check activity in the last 3 days.
   - **Reasoning:** The customer's demand has paused or dropped significantly.

5. **Rule 5: Skip Mode Active (Immediate Override)**
   - **Condition:** If `skipConfig.days > 0`.
   - **Reasoning:** If the customer explicitly requested a pause, the engine immediately halts scoring and returns `KEEP_OFF_TOMORROW` with 100% confidence.

6. **Rule 6: Frequent Deliveries (+20 points)**
   - **Condition:** If delivered count is 5 or more.
   - **Reasoning:** Frequent deliveries indicate a higher chance of ordering again.

7. **Rule 7: Frequent Deliveries (+20 points)**
   - **Condition:** If there were 5 or more successful deliveries (`status === "delivered"`) in the `last8Days`.
   - **Reasoning:** High-frequency customers have high turnover and generally need daily deliveries.

---

## Final Output & Confidence

Once the rules are applied, the final score determines the suggestion:

| Final Score Range | Suggestion Output | Meaning |
| :--- | :--- | :--- |
| **>= 70** | `TURN_ON_TOMORROW` | Very high chance they need stock. |
| **40 to 69** | `KEEP_ON_TOMORROW` | Normal demand pattern; continue as usual. |
| **20 to 39** | `KEEP_OFF_TOMORROW` | Low demand; wait another day. |
| **< 20** | `TURN_OFF_TOMORROW` | Very low chance they need stock. |

### Confidence Score
A confidence percentage is calculated to indicate how strong the suggestion is. 
`Confidence = Math.min(Math.abs(score - 50) * 2, 100)`

Example: A score of 90 results in 80% confidence. A score of 10 results in 80% confidence.

---

## UI Integration

- **Page:** `frontend/src/AdminPages/AISuggestions.jsx`
- **Table Components:** `AISuggestionTable.jsx` and `AISuggestionRow.jsx`

The page natively fetches all customers, filters out those without a `todayOverride`, feeds them into the `generateAISuggestion` function, and then sorts the resulting table by **Confidence** (highest first).
