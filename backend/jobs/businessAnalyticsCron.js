import { initializeFirebaseAdmin, getInventoryApp } from "../config/firebaseAdmin.js";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";
import axios from "axios";
import jwt from "jsonwebtoken";
import cron from "node-cron";

dotenv.config();

initializeFirebaseAdmin();
const db = admin.firestore();
const inventoryApp = getInventoryApp();
const invDb = inventoryApp ? getFirestore(inventoryApp) : db;

const INDIA_TZ = "Asia/Kolkata";
const getDateStringInTimeZone = (d, timeZone = INDIA_TZ) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
};

const generateGenuineAnalytics = async (preloadedCustomersSnap = null) => {
  console.log("Starting Genuine Analytics ETL process...");

  // Reuse pre-fetched snapshot if provided (saves N reads when called from skipDeliveryCron)
  const custSnap = preloadedCustomersSnap || await db.collection("customers").get();
  const allCustomers = custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log(`[analyticsCron] Using ${preloadedCustomersSnap ? "shared" : "fresh"} customer snapshot (${allCustomers.length} customers)`);

  const batch = db.batch();
  const collectionRef = db.collection("business_statistics_daily");

  const peakPotentialsSnap = await db.collection("categoryPeakPotentials").get();
  const peakPotentialsMap = {};
  peakPotentialsSnap.forEach(doc => {
    peakPotentialsMap[doc.id] = doc.data();
  });

  const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // If running at midnight (0-2 AM), process yesterday (finalization) AND today (baseline).
  // Otherwise process today.
  const currentHour = new Date().getHours();
  const daysToProcess = currentHour <= 2 ? [1, 0] : [0];

  for (let i of daysToProcess) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = getDateStringInTimeZone(d);

    const yd = new Date(d);
    yd.setDate(yd.getDate() - 1);
    const yesterdayDateStr = getDateStringInTimeZone(yd);

    console.log(`Processing date: ${dateStr}`);

    let totalCustomers = allCustomers.length;
    let newCustomers = 0;
    let repeatCustomersCount = 0;
    let totalCollection = 0, traysSold = 0, cash = 0, upi = 0;
    let delivered = 0, reached = 0, pending = 0;
    let activeMorningCount = 0, activeEveningCount = 0;

    const categoryMap = { D0: 0, D1: 0, D2: 0, D3: 0, D4: 0, D5: 0, D6: 0, D7: 0 };
    const expectedPeakFreqMap = { D1: 0, D2: 0, D3: 0, D4: 0, D5: 0, D6: 0, D7: 0 };
    const actualPeakFreqMap = { D0: 0, D1: 0, D2: 0, D3: 0, D4: 0, D5: 0, D6: 0, D7: 0 };
    const peakPotMap = { "0-5 Trays": 0, "6-15 Trays": 0, "16-25 Trays": 0, "26+ Trays": 0 };
    const weekdayName = WEEKDAY_NAMES[d.getDay()];
    const dayPeakData = peakPotentialsMap[weekdayName] || {};
    let totalPeakPotential = dayPeakData.ALL || 0;
    const custTypeMap = { PRIME: 0, REGULAR: 0 };
    const bizTypeMap = {};
    
    const revZoneMap = {};
    const cashZoneMap = {};
    const upiZoneMap = {};
    const revCustTypeMap = { PRIME: 0, REGULAR: 0 };
    const revBizTypeMap = {};

    const agentProdMap = {};
    const agentColMap = {};
    const agentSalesMap = {};
    const areaDelMap = {};

    // Calculate customer & sales & delivery & payment data
    allCustomers.forEach(c => {
      // Check if new customer today
      if (c.createdAt) {
        let cDateObj;
        if (typeof c.createdAt.toDate === 'function') {
           cDateObj = c.createdAt.toDate();
        } else if (c.createdAt._seconds) {
           cDateObj = new Date(c.createdAt._seconds * 1000);
        } else if (c.createdAt.seconds) {
           cDateObj = new Date(c.createdAt.seconds * 1000);
        } else {
           cDateObj = new Date(c.createdAt);
        }
        if (!isNaN(cDateObj.getTime()) && getDateStringInTimeZone(cDateObj) === dateStr) {
           newCustomers++;
        }
      }

      // General customer breakdown
      const cat = c.category || "D0";
      if (categoryMap[cat] !== undefined) categoryMap[cat]++;
      
      const peakPotStr = c.Peak_Potential || "T1";
      const peakPotNum = Number(peakPotStr.replace(/\D/g, "")) || 1;
      if (peakPotNum <= 5) peakPotMap["0-5 Trays"]++;
      else if (peakPotNum <= 15) peakPotMap["6-15 Trays"]++;
      else if (peakPotNum <= 25) peakPotMap["16-25 Trays"]++;
      else peakPotMap["26+ Trays"]++;

      // Expected Peak Frequency
      let expectedPFreq = String(c.Peak_Frequency || c.peakFrequency || c.peak_frequency || "").toLowerCase().trim();
      if (expectedPFreq === "daily") expectedPFreq = "D1";
      else if (expectedPFreq === "alternate") expectedPFreq = "D2";
      else if (expectedPFreq === "weekly") expectedPFreq = "D7";
      else if (expectedPFreq.match(/^d[1-7]$/)) expectedPFreq = expectedPFreq.toUpperCase();
      else expectedPFreq = null; // Ignore invalid or missing profiles

      if (expectedPFreq) {
        expectedPeakFreqMap[expectedPFreq] = (expectedPeakFreqMap[expectedPFreq] || 0) + 1;
      }

      // Actual Peak Frequency (from last 7 days relative to date d)
      const last8DaysObj = c.last8Days || {};
      let actualDeliveredCount = 0;
      
      for (let j = 1; j <= 7; j++) {
        const lookbackDate = new Date(d);
        lookbackDate.setDate(d.getDate() - j);
        
        // Format to YYYY-MM-DD using en-CA
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(lookbackDate);
        const y = parts.find((p) => p.type === "year")?.value;
        const m = parts.find((p) => p.type === "month")?.value;
        const day = parts.find((p) => p.type === "day")?.value;
        const key = `${y}-${m}-${day}`; // YYYY-MM-DD
        
        const entry = last8DaysObj[key];
        const status = (typeof entry === "string" ? entry : (entry?.status || entry?.type || ""));
        if (status.toLowerCase() === "delivered") {
          actualDeliveredCount++;
        }
      }
      
      const actualPFreq = `D${Math.min(actualDeliveredCount, 7)}`;
      actualPeakFreqMap[actualPFreq] = (actualPeakFreqMap[actualPFreq] || 0) + 1;

      const cType = c.customerType || "REGULAR";
      if (custTypeMap[cType] !== undefined) custTypeMap[cType]++;

      const bType = c.businessType || "OTHER";
      bizTypeMap[bType] = (bizTypeMap[bType] || 0) + 1;

      // Date specific data
      const last8Days = c.last8Days || {};
      const dayData = last8Days[dateStr];
      const status = dayData ? (dayData.status || "").toLowerCase() : "";

      const yesterdayData = last8Days[yesterdayDateStr];
      const yesterdayStatus = yesterdayData ? (yesterdayData.status || "").toLowerCase() : "";
      
      if (status === "delivered" && yesterdayStatus === "delivered") {
         repeatCustomersCount++;
      }

      const override = c.todayOverride || {};
      const overrideDate = override.date ? String(override.date).slice(0, 10) : null;
      const isOff = status === "off" || (overrideDate === dateStr && String(override.status || "").toLowerCase() === "off");

      if (status === "delivered") {
        delivered++;
        const qty = Number(dayData.quantity) || 0;
        const cAmount = Number(dayData.cashAmount) || 0;
        const uAmount = Number(dayData.upiAmount) || 0;
        const tAmount = Number(dayData.totalAmount) || (cAmount + uAmount);
        
        const agentName = dayData.agentName || "Unknown";
        const zone = c.zone || "Unknown";

        // Calculate Morning vs Evening based on time (cutoff 4:00 PM IST / 16:00)
        let isMorning = true;
        if (dayData.time) {
            let dTime;
            if (typeof dayData.time.toDate === 'function') {
                dTime = dayData.time.toDate();
            } else if (dayData.time._seconds) {
                dTime = new Date(dayData.time._seconds * 1000);
            } else if (dayData.time.seconds) {
                dTime = new Date(dayData.time.seconds * 1000);
            } else {
                dTime = new Date(dayData.time);
            }
            if (!isNaN(dTime.getTime())) {
                const istHours = (dTime.getUTCHours() + 5 + Math.floor((dTime.getUTCMinutes() + 30) / 60)) % 24;
                if (istHours >= 16) {
                    isMorning = false;
                }
            }
        }
        if (isMorning) activeMorningCount++;
        else activeEveningCount++;

        traysSold += qty;
        totalCollection += tAmount;
        cash += cAmount;
        upi += uAmount;

        revZoneMap[zone] = (revZoneMap[zone] || 0) + tAmount;
        cashZoneMap[zone] = (cashZoneMap[zone] || 0) + cAmount;
        upiZoneMap[zone] = (upiZoneMap[zone] || 0) + uAmount;

        if (revCustTypeMap[cType] !== undefined) revCustTypeMap[cType] += tAmount;
        revBizTypeMap[bType] = (revBizTypeMap[bType] || 0) + tAmount;

        agentProdMap[agentName] = (agentProdMap[agentName] || 0) + 1;
        agentColMap[agentName] = (agentColMap[agentName] || 0) + tAmount;
        agentSalesMap[agentName] = (agentSalesMap[agentName] || 0) + qty;
        areaDelMap[zone] = (areaDelMap[zone] || 0) + 1;
      } else if (status === "reached") {
        reached++;
      } else if (!isOff) {
        pending++;
      }
    });

    // Inventory App Metrics
    let totalLoad = 0, totalReturn = 0, totalDamage = 0;
    const damageByZone = {};

    if (inventoryApp) {
      const [loadSnap, returnSnap, damageSnap] = await Promise.all([
        invDb.collection("loading_entries").where("dateKey", "==", dateStr).get(),
        invDb.collection("return_load_entries").where("dateKey", "==", dateStr).get(),
        invDb.collection("damage_reports").where("dateKey", "==", dateStr).get(),
      ]);

      loadSnap.forEach(doc => {
        let qty = Number(doc.data().quantity) || 0;
        totalLoad += qty;
      });

      returnSnap.forEach(doc => {
        let qty = Number(doc.data().quantity) || 0;
        totalReturn += qty;
      });

      damageSnap.forEach(doc => {
        const data = doc.data();
        let qty = Number(data.quantity) || 0;
        totalDamage += qty;
        const zone = data.outletName || data.agentName || "Unknown";
        damageByZone[zone] = (damageByZone[zone] || 0) + qty;
      });
    } else {
      // Fallback: If running locally without credentials, fetch from PROD API
      const ADMIN_PATH = "https://eggbucketretailadmin.onrender.com/api/admin";
      const token = jwt.sign({ id: "admin", role: "admin" }, process.env.JWT_SECRET || "eggbucket12", { expiresIn: "1h" });
      try {
        const res = await axios.get(`${ADMIN_PATH}/inventory-metrics`, {
          params: { date: dateStr },
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data) {
          totalLoad = res.data.totalLoad || 0;
          totalReturn = res.data.totalReturn || 0;
          totalDamage = res.data.totalDamage || 0;
          
          if (res.data.damageEntries && Array.isArray(res.data.damageEntries)) {
            res.data.damageEntries.forEach(item => {
              const zone = item.outletName || item.agentName || "Unknown";
              damageByZone[zone] = (damageByZone[zone] || 0) + (Number(item.quantity) || 0);
            });
          }
        }
      } catch (err) {
        console.error(`Failed to fetch inventory from PROD for ${dateStr}:`, err.message);
      }
    }

    const activeCustomers = delivered;
    const missedOpportunity = reached + pending;
    const totalAttended = delivered + reached + pending;
    const checked = delivered + reached;
    const deliveryEfficiency = totalAttended > 0 ? Number(((delivered / totalAttended) * 100).toFixed(2)) : 0;
    const attendEfficiency = totalAttended > 0 ? Number(((checked / totalAttended) * 100).toFixed(2)) : 0;
    const potentialAchieved = totalPeakPotential > 0 ? Number(((traysSold / totalPeakPotential) * 100).toFixed(2)) : 0;
    const stockAvailable = totalLoad - (traysSold + totalReturn + totalDamage);

    // Build Payload
    const data = {
      dashboard: {
        totalCollection,
        cashCollection: cash,
        upiCollection: upi,
        totalCustomers,
        activeCustomers,
        newCustomers,
        totalTrays: traysSold,
        delivered,
        reached,
        pending,
      },
      customerAnalytics: {
        totalCustomers,
        newCustomers,
        activeMorning: activeMorningCount,
        activeEvening: activeEveningCount,
        category: categoryMap,
        peakFrequency: {
          expected: expectedPeakFreqMap,
          actual: actualPeakFreqMap
        },
        salesDistribution: peakPotMap,
        customerType: custTypeMap,
        businessType: bizTypeMap
      },
      salesAnalytics: {
        totalCollection,
        traysSold,
        averageTrayPerCustomer: activeCustomers > 0 ? Number((traysSold / activeCustomers).toFixed(2)) : 0,
        revenueByZone: revZoneMap,
        revenueByCustomerType: revCustTypeMap,
        revenueByBusinessType: revBizTypeMap,
        potentialAchieved,
        totalPeakPotential
      },
      deliveryAnalytics: {
        delivered,
        reached,
        pending,
        checked: 0,
        agentWiseProductivity: agentProdMap,
        agentWiseCollection: agentColMap,
        agentWiseSales: agentSalesMap,
        areaWiseDeliveries: areaDelMap,
        deliveryEfficiency,
        attendEfficiency,
        totalAttended,
        checked
      },
      paymentAnalytics: {
        cash,
        upi,
        cashByZone: cashZoneMap,
        upiByZone: upiZoneMap,
        collectionByAgent: agentColMap
      },
      inventoryAnalytics: {
        totalDamage,
        damagePercentage: totalLoad > 0 ? Number(((totalDamage / totalLoad) * 100).toFixed(2)) : 0,
        load: totalLoad,
        returns: totalReturn,
        missedOpportunity,
        stockAvailable: stockAvailable > 0 ? stockAvailable : 0,
        damageByZone
      },
      customerConversion: {
        revenuePerCustomer: activeCustomers > 0 ? Math.floor(totalCollection / activeCustomers) : 0,
        traysPerCustomer: activeCustomers > 0 ? Number((traysSold / activeCustomers).toFixed(2)) : 0,
        repeatCustomers: repeatCustomersCount,
        primeRevenue: revCustTypeMap.PRIME || 0,
        regularRevenue: revCustTypeMap.REGULAR || 0,
      },
      createdAt: new Date().toISOString()
    };

    const docRef = collectionRef.doc(dateStr);
    batch.set(docRef, data, { merge: false });
  }

  await batch.commit();
  console.log("Successfully generated and saved genuine analytics data!");

  // Cleanup old records (keep only last 30 days)
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoffDateStr = getDateStringInTimeZone(cutoffDate);

    const oldDocsSnap = await collectionRef.where("__name__", "<", cutoffDateStr).get();
    
    if (!oldDocsSnap.empty) {
      const deleteBatch = db.batch();
      oldDocsSnap.forEach(doc => {
        deleteBatch.delete(doc.ref);
      });
      await deleteBatch.commit();
      console.log(`Deleted ${oldDocsSnap.size} old analytics records (older than 30 days).`);
    }
  } catch (err) {
    console.error("Error cleaning up old records:", err);
  }
};

// Named export for use by skipDeliveryCron (midnight run with shared snapshot)
export { generateGenuineAnalytics };
export default generateGenuineAnalytics;

// ==========================================
// ==========================================
// 11 AM INVENTORY SYNC
// Fetch inventory data from the separate database once a day at 11 AM.
// ==========================================
cron.schedule("0 11 * * *", async () => {
  console.log("[analyticsCron] Scheduled: 0 11 * * * (11 AM Inventory Sync)");
  const dateStr = getDateStringInTimeZone(new Date(), INDIA_TZ);
  
  let totalLoad = 0, totalReturn = 0, totalDamage = 0;
  const damageByZone = {};

  try {
    if (inventoryApp) {
      const [loadSnap, returnSnap, damageSnap] = await Promise.all([
        invDb.collection("loading_entries").where("dateKey", "==", dateStr).get(),
        invDb.collection("return_load_entries").where("dateKey", "==", dateStr).get(),
        invDb.collection("damage_reports").where("dateKey", "==", dateStr).get(),
      ]);

      loadSnap.forEach(doc => { totalLoad += (Number(doc.data().quantity) || 0); });
      returnSnap.forEach(doc => { totalReturn += (Number(doc.data().quantity) || 0); });
      damageSnap.forEach(doc => {
        const data = doc.data();
        const qty = Number(data.quantity) || 0;
        totalDamage += qty;
        const zone = data.outletName || data.agentName || "Unknown";
        damageByZone[zone] = (damageByZone[zone] || 0) + qty;
      });
    } else {
      // Fallback API call
      const ADMIN_PATH = "https://eggbucketretailadmin.onrender.com/api/admin";
      const token = jwt.sign({ id: "admin", role: "admin" }, process.env.JWT_SECRET || "eggbucket12", { expiresIn: "1h" });
      const res = await axios.get(`${ADMIN_PATH}/inventory-metrics`, {
        params: { date: dateStr },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        totalLoad = res.data.totalLoad || 0;
        totalReturn = res.data.totalReturn || 0;
        totalDamage = res.data.totalDamage || 0;
        if (res.data.damageEntries && Array.isArray(res.data.damageEntries)) {
          res.data.damageEntries.forEach(item => {
            const zone = item.outletName || item.agentName || "Unknown";
            damageByZone[zone] = (damageByZone[zone] || 0) + (Number(item.quantity) || 0);
          });
        }
      }
    }

    // We don't have exact 'missedOpportunity' or 'traysSold' here, so we only update the absolute inventory fields.
    // The frontend or real-time trigger can compute stockAvailable if needed, but we'll update what we can.
    const inventoryUpdates = {
      "inventoryAnalytics.load": totalLoad,
      "inventoryAnalytics.returns": totalReturn,
      "inventoryAnalytics.totalDamage": totalDamage,
      "inventoryAnalytics.damageByZone": damageByZone,
      "inventoryAnalytics.damagePercentage": totalLoad > 0 ? Number(((totalDamage / totalLoad) * 100).toFixed(2)) : 0,
    };

    await db.collection("business_statistics_daily").doc(dateStr).set(inventoryUpdates, { merge: true });
    console.log(`[analyticsCron] 11 AM inventory sync completed for ${dateStr}`);
  } catch (error) {
    console.error("[analyticsCron] Error during hourly inventory sync:", error);
  }
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateGenuineAnalytics().catch(console.error).finally(() => process.exit(0));
}
