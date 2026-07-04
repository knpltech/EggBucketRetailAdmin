import { getFirestore } from "firebase-admin/firestore";

const INDIA_TZ = "Asia/Kolkata";

const getDateStringInTimeZone = (d = new Date(), timeZone = INDIA_TZ) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
};

// Helper to fetch documents in date range
const getDocsInRange = async (startDate, endDate) => {
  const db = getFirestore();
  const start = startDate || getDateStringInTimeZone();
  const end = endDate || getDateStringInTimeZone();

  // Assuming document IDs are formatted as YYYY-MM-DD
  const snapshot = await db.collection("business_statistics_daily")
    .where("__name__", ">=", start)
    .where("__name__", "<=", end)
    .orderBy("__name__", "asc")
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// 1. CUSTOMER ANALYTICS
export const getCustomerAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const docs = await getDocsInRange(startDate, endDate);

    const kpis = {
      totalCustomers: 0,
      newCustomers: 0,
      activeCustomers: 0,
      primeCustomers: 0,
    };

    const graphs = {
      categoryTrend: [], // Line Chart (D0-D7 over time)
      peakFrequency: [], // Bar Chart
      salesDistribution: [], // Bar Chart
      customerTypeDistribution: [], // Pie Chart
      businessTypeDistribution: [], // Doughnut Chart
      customerGrowthTrend: [] // Line Chart (Total/New over time)
    };

    let aggregatedCategory = {};
    let aggregatedExpectedPFreq = {};
    let aggregatedActualPFreq = {};
    let aggregatedSalesDistribution = {};
    let aggregatedCustomerType = { PRIME: 0, REGULAR: 0 };
    let aggregatedBusinessType = {};

    docs.forEach(doc => {
      const cAnalytics = doc.customerAnalytics || {};
      
      // Accumulate KPIs (taking the latest day's totalCustomers as total, or max if it fluctuates. Let's take latest for total, and sum for others if it makes sense. Since it's a snapshot, the last day is the most accurate for 'total')
      kpis.totalCustomers = cAnalytics.totalCustomers || kpis.totalCustomers;
      kpis.newCustomers += cAnalytics.newCustomers || 0;
      kpis.activeCustomers = (cAnalytics.activeMorning || 0) + (cAnalytics.activeEvening || 0); // approximation
      kpis.primeCustomers = cAnalytics.customerType?.PRIME || kpis.primeCustomers;

      // Category Trend (D0-D7)
      graphs.categoryTrend.push({
        date: doc.id,
        ...(cAnalytics.category || {})
      });

      // Growth Trend
      graphs.customerGrowthTrend.push({
        date: doc.id,
        totalCustomers: cAnalytics.totalCustomers || 0,
        newCustomers: cAnalytics.newCustomers || 0
      });

      // Snapshot data (overwrite with each day so we end up with the latest day's snapshot)
      aggregatedCategory = cAnalytics.category || {};
      
      const pFreqObj = cAnalytics.peakFrequency || {};
      // Handle both the old format (flat object) and the new format (nested expected/actual)
      if (pFreqObj.expected || pFreqObj.actual) {
        aggregatedExpectedPFreq = pFreqObj.expected || {};
        aggregatedActualPFreq = pFreqObj.actual || {};
      } else {
        aggregatedExpectedPFreq = pFreqObj;
        aggregatedActualPFreq = {};
      }

      aggregatedSalesDistribution = cAnalytics.salesDistribution || cAnalytics.peakPotential || {};
      
      const ct = cAnalytics.customerType || {};
      aggregatedCustomerType = { PRIME: ct.PRIME || 0, REGULAR: ct.REGULAR || 0 };
      
      aggregatedBusinessType = cAnalytics.businessType || {};
    });

    // Build Comparison Array
    const peakFreqKeys = ["D1", "D2", "D3", "D4", "D5", "D6", "D7"];
    graphs.peakFrequencyComparison = peakFreqKeys.map(key => ({
      name: key,
      Expected: aggregatedExpectedPFreq[key] || 0,
      Actual: aggregatedActualPFreq[key] || 0
    }));

    const salesDistKeys = ["0-5 Trays", "6-15 Trays", "16-25 Trays", "26+ Trays"];
    graphs.salesDistribution = salesDistKeys.map(key => ({
      name: key,
      value: aggregatedSalesDistribution[key] || 0
    }));
    graphs.customerTypeDistribution = [
      { name: 'Prime', value: aggregatedCustomerType.PRIME },
      { name: 'Regular', value: aggregatedCustomerType.REGULAR }
    ];
    graphs.businessTypeDistribution = Object.entries(aggregatedBusinessType).map(([name, value]) => ({ name, value }));

    return res.status(200).json({ success: true, kpis, graphs });
  } catch (error) {
    console.error("Error in getCustomerAnalytics:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// 2. SALES ANALYTICS
export const getSalesAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const docs = await getDocsInRange(startDate, endDate);

    const kpis = {
      totalCollection: 0,
      totalTraysSold: 0,
      averageRevenuePerCustomer: 0,
      averageTraysPerCustomer: 0,
    };

    const graphs = {
      dailyRevenueTrend: [],
      dailyTraysSold: [],
      revenueByZone: [],
      revenueByCustomerType: [],
      revenueByBusinessType: [],
      averageTraysPerCustomerTrend: [],
      potentialAchievedTrend: []
    };

    const zoneRevenue = {};
    const typeRevenue = { PRIME: 0, REGULAR: 0 };
    const businessRevenue = {};

    let totalCustomers = 0;

    docs.forEach(doc => {
      const sAnalytics = doc.salesAnalytics || {};
      const cAnalytics = doc.customerAnalytics || {};
      
      kpis.totalCollection += sAnalytics.totalCollection || 0;
      kpis.totalTraysSold += sAnalytics.traysSold || 0;
      totalCustomers = Math.max(totalCustomers, cAnalytics.totalCustomers || 1); // rough approximation

      graphs.dailyRevenueTrend.push({
        date: doc.id,
        revenue: sAnalytics.totalCollection || 0
      });

      graphs.dailyTraysSold.push({
        date: doc.id,
        trays: sAnalytics.traysSold || 0
      });

      graphs.averageTraysPerCustomerTrend.push({
        date: doc.id,
        avgTrays: sAnalytics.averageTrayPerCustomer || 0
      });

      graphs.potentialAchievedTrend.push({
        date: doc.id,
        achieved: sAnalytics.potentialAchieved || 0
      });

      // Assuming these are stored in salesAnalytics or we mock them if missing for the demo
      const zRev = sAnalytics.revenueByZone || {};
      Object.keys(zRev).forEach(k => { zoneRevenue[k] = (zoneRevenue[k] || 0) + zRev[k]; });

      const tRev = sAnalytics.revenueByCustomerType || {};
      typeRevenue.PRIME += tRev.PRIME || 0;
      typeRevenue.REGULAR += tRev.REGULAR || 0;

      const bRev = sAnalytics.revenueByBusinessType || {};
      Object.keys(bRev).forEach(k => { businessRevenue[k] = (businessRevenue[k] || 0) + bRev[k]; });
    });

    kpis.averageRevenuePerCustomer = totalCustomers ? Math.round(kpis.totalCollection / totalCustomers) : 0;
    kpis.averageTraysPerCustomer = totalCustomers ? (kpis.totalTraysSold / totalCustomers).toFixed(1) : 0;

    graphs.revenueByZone = Object.entries(zoneRevenue).map(([name, value]) => ({ name, value }));
    graphs.revenueByCustomerType = [
      { name: 'Prime', value: typeRevenue.PRIME },
      { name: 'Regular', value: typeRevenue.REGULAR }
    ];
    graphs.revenueByBusinessType = Object.entries(businessRevenue).map(([name, value]) => ({ name, value }));

    return res.status(200).json({ success: true, kpis, graphs });
  } catch (error) {
    console.error("Error in getSalesAnalytics:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// 3. DELIVERY OPERATIONS ANALYTICS
export const getDeliveryAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const docs = await getDocsInRange(startDate, endDate);

    const kpis = {
      delivered: 0,
      reached: 0,
      pending: 0,
      deliverySuccessPercent: 0,
    };

    const graphs = {
      deliveryStatus: [],
      agentProductivity: [],
      agentCollection: [],
      agentSales: [],
      zoneWiseDeliveries: [],
      deliveryTimeTrend: [],
      efficiencyTrend: []
    };

    let checked = 0;
    const agentProd = {};
    const agentColl = {};
    const agentSales = {};
    const zoneDel = {};

    docs.forEach(doc => {
      const dAnalytics = doc.deliveryAnalytics || {};
      
      kpis.delivered += dAnalytics.delivered || 0;
      kpis.reached += dAnalytics.reached || 0;
      kpis.pending += dAnalytics.pending || 0;
      checked += dAnalytics.checked || 0;

      graphs.deliveryTimeTrend.push({
        date: doc.id,
        delivered: dAnalytics.delivered || 0,
        reached: dAnalytics.reached || 0,
        pending: dAnalytics.pending || 0
      });

      graphs.efficiencyTrend.push({
        date: doc.id,
        deliveryEfficiency: dAnalytics.deliveryEfficiency || 0,
        attendEfficiency: dAnalytics.attendEfficiency || 0
      });

      const ap = dAnalytics.agentWiseProductivity || {};
      Object.keys(ap).forEach(k => { agentProd[k] = (agentProd[k] || 0) + ap[k]; });

      const ac = dAnalytics.agentWiseCollection || {};
      Object.keys(ac).forEach(k => { agentColl[k] = (agentColl[k] || 0) + ac[k]; });

      const as = dAnalytics.agentWiseSales || {};
      Object.keys(as).forEach(k => { agentSales[k] = (agentSales[k] || 0) + as[k]; });

      const zd = dAnalytics.areaWiseDeliveries || {};
      Object.keys(zd).forEach(k => { zoneDel[k] = (zoneDel[k] || 0) + zd[k]; });
    });

    const totalDeliveries = kpis.delivered + kpis.reached + kpis.pending;
    kpis.deliverySuccessPercent = totalDeliveries ? Math.round((kpis.delivered / totalDeliveries) * 100) : 0;

    graphs.deliveryStatus = [
      { name: 'Delivered', value: kpis.delivered },
      { name: 'Reached', value: kpis.reached },
      { name: 'Pending', value: kpis.pending },
    ];

    graphs.agentProductivity = Object.entries(agentProd).map(([name, value]) => ({ name, value }));
    graphs.agentCollection = Object.entries(agentColl).map(([name, value]) => ({ name, value }));
    graphs.agentSales = Object.entries(agentSales).map(([name, value]) => ({ name, value }));
    graphs.zoneWiseDeliveries = Object.entries(zoneDel).map(([name, value]) => ({ name, value }));

    return res.status(200).json({ success: true, kpis, graphs });
  } catch (error) {
    console.error("Error in getDeliveryAnalytics:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// 4. PAYMENT ANALYTICS
export const getPaymentAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const docs = await getDocsInRange(startDate, endDate);

    const kpis = {
      cashCollection: 0,
      upiCollection: 0,
      cashPercent: 0,
      upiPercent: 0,
    };

    const graphs = {
      cashVsUpiTrend: [],
      paymentDistribution: [],
      collectionTrend: [],
      cashCollectionByZone: [],
      upiCollectionByZone: [],
      collectionByAgent: []
    };

    const cashZone = {};
    const upiZone = {};
    const agentColl = {};

    docs.forEach(doc => {
      const pAnalytics = doc.paymentAnalytics || {};
      
      kpis.cashCollection += pAnalytics.cash || 0;
      kpis.upiCollection += pAnalytics.upi || 0;

      graphs.cashVsUpiTrend.push({
        date: doc.id,
        cash: pAnalytics.cash || 0,
        upi: pAnalytics.upi || 0
      });

      graphs.collectionTrend.push({
        date: doc.id,
        total: (pAnalytics.cash || 0) + (pAnalytics.upi || 0)
      });

      // Aggregate Zones & Agents if they exist in paymentAnalytics
      const cz = pAnalytics.cashByZone || {};
      Object.keys(cz).forEach(k => { cashZone[k] = (cashZone[k] || 0) + cz[k]; });

      const uz = pAnalytics.upiByZone || {};
      Object.keys(uz).forEach(k => { upiZone[k] = (upiZone[k] || 0) + uz[k]; });

      const ac = pAnalytics.collectionByAgent || {};
      Object.keys(ac).forEach(k => { agentColl[k] = (agentColl[k] || 0) + ac[k]; });
    });

    const totalPayment = kpis.cashCollection + kpis.upiCollection;
    kpis.cashPercent = totalPayment ? Math.round((kpis.cashCollection / totalPayment) * 100) : 0;
    kpis.upiPercent = totalPayment ? Math.round((kpis.upiCollection / totalPayment) * 100) : 0;

    graphs.paymentDistribution = [
      { name: 'Cash', value: kpis.cashCollection },
      { name: 'UPI', value: kpis.upiCollection }
    ];

    graphs.cashCollectionByZone = Object.entries(cashZone).map(([name, value]) => ({ name, value }));
    graphs.upiCollectionByZone = Object.entries(upiZone).map(([name, value]) => ({ name, value }));
    graphs.collectionByAgent = Object.entries(agentColl).map(([name, value]) => ({ name, value }));

    return res.status(200).json({ success: true, kpis, graphs });
  } catch (error) {
    console.error("Error in getPaymentAnalytics:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// 5. INVENTORY ANALYTICS
export const getInventoryAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const docs = await getDocsInRange(startDate, endDate);

    const kpis = {
      totalDamage: 0,
      damagePercent: 0,
      totalLoad: 0,
      totalReturn: 0,
    };

    const graphs = {
      damageTrend: [],
      damagePercentTrend: [],
      missedOpportunityAnalysis: [],
      loadVsReturn: [],
      damageByZone: [],
      stockStatus: []
    };

    const damageZone = {};

    docs.forEach(doc => {
      const iAnalytics = doc.inventoryAnalytics || {};
      
      kpis.totalDamage += iAnalytics.totalDamage || 0;
      kpis.totalLoad += iAnalytics.load || 0;
      kpis.totalReturn += iAnalytics.returns || 0;

      graphs.damageTrend.push({
        date: doc.id,
        damage: iAnalytics.totalDamage || 0
      });

      graphs.damagePercentTrend.push({
        date: doc.id,
        percent: iAnalytics.damagePercentage || 0
      });

      graphs.missedOpportunityAnalysis.push({
        date: doc.id,
        missed: iAnalytics.missedOpportunity || 0
      });

      graphs.loadVsReturn.push({
        date: doc.id,
        load: iAnalytics.load || 0,
        returns: iAnalytics.returns || 0
      });

      graphs.stockStatus.push({
        date: doc.id,
        stockAvailable: iAnalytics.stockAvailable || 0
      });

      const dz = iAnalytics.damageByZone || {};
      Object.keys(dz).forEach(k => { damageZone[k] = (damageZone[k] || 0) + dz[k]; });
    });

    kpis.damagePercent = kpis.totalLoad ? Math.round((kpis.totalDamage / kpis.totalLoad) * 100) : 0;
    graphs.damageByZone = Object.entries(damageZone).map(([name, value]) => ({ name, value }));

    return res.status(200).json({ success: true, kpis, graphs });
  } catch (error) {
    console.error("Error in getInventoryAnalytics:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// 6. CUSTOMER CONVERSION ANALYTICS
export const getCustomerConversionAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const docs = await getDocsInRange(startDate, endDate);

    const kpis = {
      revenuePerCustomer: 0,
      traysPerCustomer: 0,
      repeatCustomers: 0
    };

    const graphs = {
      revenuePerCustomerTrend: [],
      traysPerCustomerTrend: [],
      primeCustomerRevenue: [],
      regularCustomerRevenue: [],
      repeatCustomersTrend: []
    };

    docs.forEach(doc => {
      const ccAnalytics = doc.customerConversion || {};
      
      // We take the latest or average for KPIs
      kpis.revenuePerCustomer = ccAnalytics.revenuePerCustomer || kpis.revenuePerCustomer;
      kpis.traysPerCustomer = ccAnalytics.traysPerCustomer || kpis.traysPerCustomer;
      kpis.repeatCustomers = ccAnalytics.repeatCustomers || kpis.repeatCustomers;

      graphs.revenuePerCustomerTrend.push({
        date: doc.id,
        value: ccAnalytics.revenuePerCustomer || 0
      });

      graphs.traysPerCustomerTrend.push({
        date: doc.id,
        value: ccAnalytics.traysPerCustomer || 0
      });

      graphs.primeCustomerRevenue.push({
        date: doc.id,
        revenue: ccAnalytics.primeRevenue || 0
      });

      graphs.regularCustomerRevenue.push({
        date: doc.id,
        revenue: ccAnalytics.regularRevenue || 0
      });

      graphs.repeatCustomersTrend.push({
        date: doc.id,
        count: ccAnalytics.repeatCustomers || 0
      });
    });

    return res.status(200).json({ success: true, kpis, graphs });
  } catch (error) {
    console.error("Error in getCustomerConversionAnalytics:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
