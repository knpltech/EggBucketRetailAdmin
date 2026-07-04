# Business Analytics Dashboard Formulas

This document outlines the exact formulas and data sources used to calculate the metrics and graphs shown on the Business Analytics dashboard. All daily aggregations are processed automatically at 12:00 AM and 6:00 PM IST.

---

## 1. Dashboard Overview KPIs

- **Active Customers:** The total number of customers who successfully received a delivery today (`status === "delivered"`).
- **Total Trays Sold:** The sum of the `quantity` (trays) across all successful deliveries today.
- **Total Collection:** The sum of `totalAmount` (or `cashAmount` + `upiAmount`) across all successful deliveries today.
- **Delivered:** Count of customers marked as "delivered".
- **Reached:** Count of customers marked as "reached" (agent visited but no delivery made).
- **Pending:** Count of customers who are scheduled for today (not marked "off") but have not been attended to yet.

---

## 2. Customer Analytics Module

- **Customer Category Trend (D0-D7):** 
  - **Formula:** Counts the number of customers grouped by their official assigned `category` (e.g., D1, D7).
- **Peak Frequency (Expected vs Actual):** 
  - **Expected:** Grouped by the customer's officially assigned `Peak_Frequency` (Daily -> D1, Alternate -> D2, Weekly -> D7).
  - **Actual:** Calculated dynamically by looking back exactly 7 days. If a customer received 4 deliveries in the last 7 days, they are grouped under "D4".
- **Sales Distribution:** 
  - **Formula:** Groups customers into tray buckets (0-5 Trays, 6-15 Trays, 16-25 Trays, 26+ Trays) based on the number parsed from their `Peak_Potential` profile tag.
- **Customer Type / Business Type Distribution:**
  - **Formula:** Groups the customer base by their `customerType` (Prime/Regular) and `businessType`.
- **Morning vs Evening Active Users:**
  - **Formula:** A delivery is classified as "Morning" if it was completed before 12:00 PM IST based on the actual delivery timestamp (`afterEntry.time`). "Evening" is anything delivered after 12:00 PM IST.

---

## 3. Sales Analytics Module

- **Average Trays Per Customer:**
  - **Formula:** `Total Trays Sold / Active Customers`
- **Peak Potential Achieved %:**
  - **Formula:** `(Total Trays Sold / Total Peak Potential for today's weekday) * 100`
  - *Note: Total Peak Potential is the historical best tray count ever recorded for this specific day of the week.*
- **Revenue by Zone / Customer Type / Business Type:**
  - **Formula:** Sum of `totalAmount` grouped by the respective customer attributes.

---

## 4. Delivery Analytics Module

- **Delivery Efficiency %:**
  - **Formula:** `(Delivered / (Delivered + Reached + Pending)) * 100`
  - *Measures what percentage of the total route was successfully converted to a sale.*
- **Attend Efficiency %:**
  - **Formula:** `((Delivered + Reached) / (Delivered + Reached + Pending)) * 100`
  - *Measures what percentage of the scheduled route was actually visited by an agent, regardless of a successful sale.*
- **Agent Wise Productivity:**
  - **Formula:** Counts the number of successful deliveries grouped by `agentName`.
- **Agent Wise Sales / Collection:**
  - **Formula:** Sums the total trays sold and total money collected, grouped by `agentName`.

---

## 5. Payment Analytics Module

- **Cash / UPI Collection:** 
  - **Formula:** Sum of `cashAmount` and `upiAmount` across all successful deliveries.
- **Collection by Zone:** 
  - **Formula:** Sums of `cashAmount` and `upiAmount` grouped by the customer's `zone`.

---

## 6. Inventory Analytics Module

- **Total Load:** 
  - **Formula:** Sum of `quantity` from the `loading_entries` table for today.
- **Total Returns:** 
  - **Formula:** Sum of `quantity` from the `return_load_entries` table for today.
- **Total Damage:** 
  - **Formula:** Sum of `quantity` from the `damage_reports` table for today.
- **Damage %:**
  - **Formula:** `(Total Damage / Total Load) * 100`
- **Stock Available:**
  - **Formula:** `Total Load - (Total Trays Sold + Total Returns + Total Damage)`
- **Missed Opportunity (Trays):**
  - **Formula:** `Reached + Pending` (Each missed stop is counted as at least 1 missed opportunity).

---

## 7. Customer Conversion Module

- **Revenue Per Customer:** 
  - **Formula:** `Total Collection / Active Customers`
- **Repeat Customers:**
  - **Formula:** Checks every customer's 8-day history. A customer is counted as a Repeat Customer if they successfully received a delivery ("delivered") both today AND yesterday.
- **Trays Per Customer:**
  - **Formula:** `Total Trays Sold / Active Customers`
