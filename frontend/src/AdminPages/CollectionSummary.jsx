import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { ADMIN_PATH } from "../constant";
import {
  Download,
  RefreshCw,
  Calendar,
  Zap,
  Pencil,
  Check,
  X,
  User,
} from "lucide-react";
import { FiTrendingUp } from "react-icons/fi";
import * as XLSX from "xlsx";

const CollectionSummary = () => {
  // Parse timestamp in multiple formats
  const parseTimestamp = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === "function") return value.toDate();
    if (typeof value === "number") {
      const ms = value < 1e12 ? value * 1000 : value;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === "string") {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === "object") {
      const seconds = value.seconds ?? value._seconds;
      const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;
      if (typeof seconds === "number") {
        const ms = seconds * 1000 + Math.floor(nanoseconds / 1e6);
        const date = new Date(ms);
        return Number.isNaN(date.getTime()) ? null : date;
      }
    }
    return null;
  };

  const [data, setData] = useState(null);
  const [categoryPeaks, setCategoryPeaks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [activeTab, setActiveTab] = useState("ALL");
  // Helper to get today's date in local India timezone (Asia/Kolkata)
  const getTodayDateString = () => {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());

      const year = parts.find((p) => p.type === "year")?.value;
      const month = parts.find((p) => p.type === "month")?.value;
      const day = parts.find((p) => p.type === "day")?.value;
      if (year && month && day) return `${year}-${month}-${day}`;
    } catch (e) {
      // fallback
    }
    return new Date().toISOString().split("T")[0];
  };

  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [selectedOutlet, setSelectedOutlet] = useState("all");
  const [deliveryPartners, setDeliveryPartners] = useState([]);
  const [salesPartners, setSalesPartners] = useState([]);
  const [sortBy] = useState("delivery-time");
  const [todaysPrice, setTodaysPrice] = useState("");
  const [minusAmounts, setMinusAmounts] = useState({});
  const [editingCell, setEditingCell] = useState(null); // { rowId: docId, field: 'quantity' | 'cash' | 'upi' }
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // ⭐ Add Inventory Entry Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalType, setAddModalType] = useState("load");
  const [addFormDate, setAddFormDate] = useState("");
  const [addFormAgent, setAddFormAgent] = useState("");
  const [addFormValue, setAddFormValue] = useState("");
  const [addFormRemarks, setAddFormRemarks] = useState("");
  const [addFormSubmitting, setAddFormSubmitting] = useState(false);
  const [addFormError, setAddFormError] = useState("");
  const [agentSelectHighlight, setAgentSelectHighlight] = useState(false);
  const [agentWarningMessage, setAgentWarningMessage] = useState("");

  const openAddModal = (type) => {
    // Check if an agent is selected from the top filter
    if (!selectedAgent || selectedAgent === "all") {
      setAgentWarningMessage("Please select a Delivery Agent from the top option first before entering data.");
      setAgentSelectHighlight(true);
      setTimeout(() => setAgentSelectHighlight(false), 3500);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setAgentWarningMessage("");
    setAddModalType(type);
    setAddFormDate(selectedDate || getTodayDateString());
    setAddFormAgent(selectedAgent);
    setAddFormValue("");
    setAddFormRemarks("");
    setAddFormError("");
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setAddFormError("");
  };

  const [inventoryMetrics, setInventoryMetrics] = useState({
    totalLoad: 0,
    totalReturn: 0,
    totalDamage: 0,
    nettSales: 0,
    cashHandoverEntries: [],
    foodAllowanceEntries: [],
    incentiveEntries: [],
    upiHandoverEntries: [],
    loadingEntries: [],
    returnEntries: [],
    damageEntries: [],
  });

  const handleAddEntrySubmit = async (e) => {
    e.preventDefault();
    const currentAgent = (selectedAgent && selectedAgent !== "all") ? selectedAgent : addFormAgent;
    if (!currentAgent || !currentAgent.trim() || currentAgent === "all") {
      setAddFormError("Please select a delivery agent from the top filter.");
      return;
    }
    if (addFormValue === "" || isNaN(Number(addFormValue)) || Number(addFormValue) < 0) {
      setAddFormError("Please enter a valid quantity or amount.");
      return;
    }

    setAddFormSubmitting(true);
    setAddFormError("");

    try {
      const userRole = localStorage.getItem("userType") || "admin";
      const payload = {
        type: addModalType,
        dateKey: selectedDate || getTodayDateString(),
        agentName: currentAgent.trim(),
        value: Number(addFormValue),
        remarks: addFormRemarks.trim(),
        supervisorName: userRole === "supervisor" ? "Supervisor (Web)" : "Admin (Web)",
      };

      const res = await axios.post(`${ADMIN_PATH}/add-inventory-entry`, payload);

      if (res.data && res.data.success) {
        setIsAddModalOpen(false);
        setAddFormValue("");
        setAddFormRemarks("");
        // Refresh metrics & collection summary
        await fetchInventoryMetrics(selectedDate || getTodayDateString());
        await fetchCollectionSummary();
      } else {
        setAddFormError(res.data?.message || "Failed to add inventory entry");
      }
    } catch (err) {
      console.error("Add entry error:", err);
      setAddFormError(err.response?.data?.message || err.message || "Failed to add inventory entry");
    } finally {
      setAddFormSubmitting(false);
    }
  };

  const agentOptionsList = useMemo(() => {
    const list = new Set();
    if (Array.isArray(deliveryPartners)) {
      deliveryPartners.forEach((p) => {
        const pName = p.name || p.displayName;
        const pOutlet = (p.outlet || "").trim();
        const hasLayout = Boolean(pOutlet && pOutlet !== "-");
        const isActive = Boolean(p.active);

        // Include agents who have an assigned layout/outlet OR are active
        if (pName && (hasLayout || isActive)) {
          list.add(pName.trim());
        }
      });
    }
    return Array.from(list).sort();
  }, [deliveryPartners]);



  const TYPE_CONFIG = {
    load: { title: "Total Load", unit: "Trays", label: "Quantity (Trays)" },
    return: { title: "Total Return", unit: "Trays", label: "Quantity (Trays)" },
    damage: { title: "Total Damage", unit: "Pcs", label: "Quantity (Pcs)" },
    cash_handover: { title: "Cash Handover", unit: "₹", label: "Amount (₹)" },
    upi_handover: { title: "UPI Handover", unit: "₹", label: "Amount (₹)" },
    food_allowance: { title: "Food Allowance", unit: "₹", label: "Amount (₹)" },
    incentive: { title: "Incentives", unit: "₹", label: "Amount (₹)" },
  };


  const fetchInventoryMetrics = useCallback(async (date) => {
    try {
      const res = await axios.get(`${ADMIN_PATH}/inventory-metrics`, {
        params: { date },
      });
      if (res.data && res.data.success) {
        setInventoryMetrics({
          totalLoad: res.data.totalLoad || 0,
          totalReturn: res.data.totalReturn || 0,
          totalDamage: res.data.totalDamage || 0,
          nettSales: res.data.nettSales || 0,
          cashHandoverEntries: res.data.cashHandoverEntries || [],
          foodAllowanceEntries: res.data.foodAllowanceEntries || [],
          incentiveEntries: res.data.incentiveEntries || [],
          upiHandoverEntries: res.data.upiHandoverEntries || [],
          loadingEntries: res.data.loadingEntries,
          returnEntries: res.data.returnEntries,
          damageEntries: res.data.damageEntries,
        });
      }
    } catch (err) {
      console.error("Error fetching inventory metrics:", err);
    }
  }, []);

  // Fetch collection summary on mount
  useEffect(() => {
    fetchCollectionSummary();
  }, []);

  // Fetch inventory metrics when selectedDate changes
  useEffect(() => {
    if (selectedDate) {
      fetchInventoryMetrics(selectedDate);
    }
  }, [selectedDate, fetchInventoryMetrics]);  // Handle edit cell click
  const handleEditCell = (item, field) => {
    let currentValue = 0;
    if (field === "quantity") {
      currentValue = typeof item.quantity === "number" ? item.quantity : 0;
    } else if (field === "cash") {
      currentValue = typeof item.cash === "number" ? item.cash : 0;
    } else if (field === "upi") {
      currentValue = typeof item.upi === "number" ? item.upi : 0;
    }
    setEditingCell({ rowId: item.docId, field });
    setEditValue(currentValue.toString());
    setEditError("");
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
    setEditError("");
  };

  // Handle save individual cell
  const handleSaveCell = async (item) => {
    if (!editingCell) return;

    setSavingEdit(true);
    setEditError("");

    try {
      if (!item.docId) {
        throw new Error("Customer ID not found");
      }

      const numValue = parseFloat(editValue) || 0;
      const updatePayload = {
        docId: item.docId,
        date: selectedDate,
      };

      // Get current values for recalculating total amount
      const currentEntry = data.customers.find(
        (c) => (c.id || c._id) === item.docId,
      )?.last8Days?.[selectedDate];
      const entryObj =
        typeof currentEntry === "string"
          ? { status: currentEntry }
          : currentEntry || {};
      let currentCash =
        typeof entryObj.cashAmount === "number" ? entryObj.cashAmount : 0;
      let currentUpi =
        typeof entryObj.upiAmount === "number" ? entryObj.upiAmount : 0;

      // Add only the edited field to the payload and recalculate total
      if (editingCell.field === "quantity") {
        updatePayload.quantity = parseInt(editValue) || 0;
      } else if (editingCell.field === "cash") {
        updatePayload.cashAmount = numValue;
        currentCash = numValue; // Update for calculation
        updatePayload.totalAmount = currentCash + currentUpi;
      } else if (editingCell.field === "upi") {
        updatePayload.upiAmount = numValue;
        currentUpi = numValue; // Update for calculation
        updatePayload.totalAmount = currentCash + currentUpi;
      }

      const response = await axios.post(
        `${ADMIN_PATH}/update-customer-payment`,
        updatePayload,
      );

      if (response.data.success) {
        // Update local data state
        setData((prevData) => ({
          ...prevData,
          customers: prevData.customers.map((customer) => {
            if ((customer.id || customer._id) === item.docId) {
              const last8Days = { ...customer.last8Days };
              if (!last8Days[selectedDate]) {
                last8Days[selectedDate] = {};
              }

              // Update only the specific field and recalculate total
              if (editingCell.field === "quantity") {
                last8Days[selectedDate] = {
                  ...last8Days[selectedDate],
                  quantity: parseInt(editValue) || 0,
                };
              } else if (editingCell.field === "cash") {
                const updatedCash = numValue;
                const updatedUpi =
                  typeof last8Days[selectedDate].upiAmount === "number"
                    ? last8Days[selectedDate].upiAmount
                    : 0;
                last8Days[selectedDate] = {
                  ...last8Days[selectedDate],
                  cashAmount: updatedCash,
                  totalAmount: updatedCash + updatedUpi,
                };
              } else if (editingCell.field === "upi") {
                const updatedUpi = numValue;
                const updatedCash =
                  typeof last8Days[selectedDate].cashAmount === "number"
                    ? last8Days[selectedDate].cashAmount
                    : 0;
                last8Days[selectedDate] = {
                  ...last8Days[selectedDate],
                  upiAmount: updatedUpi,
                  totalAmount: updatedCash + updatedUpi,
                };
              }

              return { ...customer, last8Days };
            }
            return customer;
          }),
        }));

        // Clear edit state
        setEditingCell(null);
        setEditValue("");
      } else {
        setEditError(response.data.message || "Failed to update");
      }
    } catch (err) {
      console.error("Save cell error:", err);
      setEditError(
        err.response?.data?.message || err.message || "Error saving",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // Helper to match partner names fuzzily (handles case variations, first-name matches, and common spelling differences like Bishal/Vishal)
  const findPartnerByName = useCallback((name) => {
    if (!name) return null;
    const clean = name.toLowerCase().replace(/[^a-z]/g, "");

    // --- Tier 1 & 2: Exact Match ---
    const exactDel = deliveryPartners.find(
      (p) => p.name?.toLowerCase().trim() === name.toLowerCase().trim()
    );
    const exactSales = salesPartners.find(
      (p) => p.name?.toLowerCase().trim() === name.toLowerCase().trim()
    );

    if (exactDel && exactDel.outlet) return exactDel;
    if (exactSales && exactSales.outlet) return exactSales;
    if (exactDel) return exactDel;
    if (exactSales) return exactSales;

    // --- Tier 3 & 4: Substring / First Word Match ---
    const firstWord = name.toLowerCase().trim().split(/\s+/)[0];
    const subMatchesDel = deliveryPartners.filter((p) => {
      const pName = p.name?.toLowerCase().trim();
      if (!pName) return false;
      const pFirstWord = pName.split(/\s+/)[0];
      return pFirstWord === firstWord || pName.includes(firstWord) || firstWord.includes(pName);
    });

    const subMatchesSales = salesPartners.filter((p) => {
      const pName = p.name?.toLowerCase().trim();
      if (!pName) return false;
      const pFirstWord = pName.split(/\s+/)[0];
      return pFirstWord === firstWord || pName.includes(firstWord) || firstWord.includes(pName);
    });

    const subWithOutletDel = subMatchesDel.find((p) => p.outlet);
    if (subWithOutletDel) return subWithOutletDel;

    const subWithOutletSales = subMatchesSales.find((p) => p.outlet);
    if (subWithOutletSales) return subWithOutletSales;

    if (subMatchesDel.length > 0) return subMatchesDel[0];
    if (subMatchesSales.length > 0) return subMatchesSales[0];

    // --- Tier 5 & 6: Similarity Match (Bishal/Vishal) ---
    if (clean.includes("bishal") || clean.includes("vishal")) {
      const simMatchesDel = deliveryPartners.filter((p) => {
        const pClean = p.name?.toLowerCase().replace(/[^a-z]/g, "") || "";
        return pClean.includes("vishal") || pClean.includes("bishal");
      });

      const simMatchesSales = salesPartners.filter((p) => {
        const pClean = p.name?.toLowerCase().replace(/[^a-z]/g, "") || "";
        return pClean.includes("vishal") || pClean.includes("bishal");
      });

      const simWithOutletDel = simMatchesDel.find((p) => p.outlet);
      if (simWithOutletDel) return simWithOutletDel;

      const simWithOutletSales = simMatchesSales.find((p) => p.outlet);
      if (simWithOutletSales) return simWithOutletSales;

      if (simMatchesDel.length > 0) return simMatchesDel[0];
      if (simMatchesSales.length > 0) return simMatchesSales[0];
    }

    return null;
  }, [deliveryPartners, salesPartners]);

  // Calculate metrics based on selected outlet and agent filters
  const displayedMetrics = useMemo(() => {
    const {
      totalLoad = 0,
      totalReturn = 0,
      totalDamage = 0,
      nettSales = 0,
      cashHandoverEntries = [],
      foodAllowanceEntries = [],
      incentiveEntries = [],
      upiHandoverEntries = [],
      loadingEntries,
      returnEntries,
      damageEntries,
    } = inventoryMetrics;

    const isMatchingOutlet = (entryOutlet, entryAgent, entrySupervisor) => {
      const targetOutletLower = selectedOutlet.toLowerCase().trim();
      const cleanTargetOutlet = targetOutletLower.replace(/^eggbucket\s+/, "");

      // 1. Direct match with entryOutlet
      if (entryOutlet) {
        const entryOutletLower = entryOutlet.toLowerCase().trim();
        const cleanEntryOutlet = entryOutletLower.replace(/^eggbucket\s+/, "");
        if (cleanEntryOutlet === cleanTargetOutlet) {
          return true;
        }

        // Check if entryOutlet is a partner name (e.g. "Rohan")
        const partnerByOutletName = findPartnerByName(entryOutlet);
        if (partnerByOutletName && partnerByOutletName.outlet) {
          const pOutletLower = partnerByOutletName.outlet.toLowerCase().trim().replace(/^eggbucket\s+/, "");
          if (pOutletLower === cleanTargetOutlet) {
            return true;
          }
        }
      }

      // 2. Check if agentName belongs to the selectedOutlet
      if (entryAgent) {
        const partnerByAgent = findPartnerByName(entryAgent);
        if (partnerByAgent && partnerByAgent.outlet) {
          const pOutletLower = partnerByAgent.outlet.toLowerCase().trim().replace(/^eggbucket\s+/, "");
          if (pOutletLower === cleanTargetOutlet) {
            return true;
          }
        }
      }

      // 3. Check if supervisorName belongs to the selectedOutlet
      if (entrySupervisor) {
        const partnerBySupervisor = findPartnerByName(entrySupervisor);
        if (partnerBySupervisor && partnerBySupervisor.outlet) {
          const pOutletLower = partnerBySupervisor.outlet.toLowerCase().trim().replace(/^eggbucket\s+/, "");
          if (pOutletLower === cleanTargetOutlet) {
            return true;
          }
        }
      }

      return false;
    };

    const getLatestUpiHandover = (entries) => {
      if (!entries || entries.length === 0) return 0;

      if (selectedOutlet !== "all") {
        const matching = entries.filter((item) =>
          isMatchingOutlet(item.outletName, item.agentName, item.supervisorName)
        );
        if (matching.length === 0) return 0;

        matching.sort((a, b) => {
          const tA = parseTimestamp(a.createdAt)?.getTime() || 0;
          const tB = parseTimestamp(b.createdAt)?.getTime() || 0;
          return tB - tA;
        });

        return matching[0].cash || 0;
      } else if (selectedAgent !== "all") {
        const matching = entries.filter((item) =>
          item.agentName?.toLowerCase().trim() === selectedAgent?.toLowerCase().trim()
        );
        if (matching.length === 0) return 0;

        matching.sort((a, b) => {
          const tA = parseTimestamp(a.createdAt)?.getTime() || 0;
          const tB = parseTimestamp(b.createdAt)?.getTime() || 0;
          return tB - tA;
        });

        return matching[0].cash || 0;
      } else {
        // Group by outlet and pick latest per outlet, then sum
        const groups = {};
        entries.forEach((item) => {
          const key = (item.outletId || item.outletName || item.agentName || "unknown")
            .toLowerCase()
            .trim();
          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
        });

        let sum = 0;
        Object.values(groups).forEach((groupEntries) => {
          groupEntries.sort((a, b) => {
            const tA = parseTimestamp(a.createdAt)?.getTime() || 0;
            const tB = parseTimestamp(b.createdAt)?.getTime() || 0;
            return tB - tA;
          });
          sum += groupEntries[0].cash || 0;
        });

        return sum;
      }
    };

    // Fallback if detailed entries are not yet populated from backend
    if (!loadingEntries || !returnEntries || !damageEntries) {
      let cashHandover = 0;
      let foodAllowance = 0;
      let incentives = 0;
      if (selectedAgent === "all") {
        cashHandover = cashHandoverEntries.reduce((sum, item) => sum + item.cash, 0);
        foodAllowance = foodAllowanceEntries.reduce((sum, item) => sum + item.cash, 0);
        incentives = incentiveEntries.reduce((sum, item) => sum + item.cash, 0);
      } else {
        const agentFilter = (item) =>
          item.agentName?.toLowerCase().trim() === selectedAgent?.toLowerCase().trim();
        cashHandover = cashHandoverEntries.filter(agentFilter).reduce((sum, item) => sum + item.cash, 0);
        foodAllowance = foodAllowanceEntries.filter(agentFilter).reduce((sum, item) => sum + item.cash, 0);
        incentives = incentiveEntries.filter(agentFilter).reduce((sum, item) => sum + item.cash, 0);
      }
      return {
        totalLoad,
        totalReturn,
        totalDamage,
        nettSales,
        cashHandover,
        upiHandover: getLatestUpiHandover(upiHandoverEntries),
        foodAllowance,
        incentives,
      };
    }

    if (selectedOutlet === "all") {
      const load = loadingEntries.reduce((sum, item) => sum + item.quantity, 0);
      const ret = returnEntries.reduce((sum, item) => sum + item.quantity, 0);
      const dmg = damageEntries.reduce((sum, item) => sum + item.quantity, 0);
      const cash = cashHandoverEntries.reduce((sum, item) => sum + item.cash, 0);
      const food = foodAllowanceEntries.reduce((sum, item) => sum + item.cash, 0);
      const inc = incentiveEntries.reduce((sum, item) => sum + item.cash, 0);
      return {
        totalLoad: load,
        totalReturn: ret,
        totalDamage: dmg,
        nettSales: load - ret,
        cashHandover: cash,
        upiHandover: getLatestUpiHandover(upiHandoverEntries),
        foodAllowance: food,
        incentives: inc,
      };
    }

    const filteredLoad = loadingEntries
      .filter((item) => isMatchingOutlet(item.outletName, item.agentName, item.supervisorName))
      .reduce((sum, item) => sum + item.quantity, 0);

    const filteredReturn = returnEntries
      .filter((item) => isMatchingOutlet(item.outletName, item.agentName, item.supervisorName))
      .reduce((sum, item) => sum + item.quantity, 0);

    const filteredDamage = damageEntries
      .filter((item) => isMatchingOutlet(item.outletName, item.agentName, item.supervisorName))
      .reduce((sum, item) => sum + item.quantity, 0);

    const filteredCash = cashHandoverEntries
      .filter((item) => isMatchingOutlet(item.outletName, item.agentName, item.supervisorName))
      .reduce((sum, item) => sum + item.cash, 0);

    const filteredFood = foodAllowanceEntries
      .filter((item) => isMatchingOutlet(item.outletName, item.agentName, item.supervisorName))
      .reduce((sum, item) => sum + item.cash, 0);

    const filteredIncentive = incentiveEntries
      .filter((item) => isMatchingOutlet(item.outletName, item.agentName, item.supervisorName))
      .reduce((sum, item) => sum + item.cash, 0);

    return {
      totalLoad: filteredLoad,
      totalReturn: filteredReturn,
      totalDamage: filteredDamage,
      nettSales: filteredLoad - filteredReturn,
      cashHandover: filteredCash,
      upiHandover: getLatestUpiHandover(upiHandoverEntries),
      foodAllowance: filteredFood,
      incentives: filteredIncentive,
    };
  }, [inventoryMetrics, selectedOutlet, selectedAgent, deliveryPartners, salesPartners, findPartnerByName]);

  // Filter customers based on active tab, selected date, agent, and sort
  const filtered = useMemo(() => {
    if (!data?.customers) return [];

    const customers = data.customers
      .map((customer) => {
        const last8Days = customer.last8Days || {};
        const entry = last8Days[selectedDate];

        if (!entry) return null;

        // Handle both string format and object format
        const entryObj = typeof entry === "string" ? { status: entry } : entry;

        // Skip if not delivered on this date
        if (entryObj.status !== "delivered") return null;

        // Extract fields
        const custid = customer.custid || customer.id || customer._id || "";
        const customerName = customer.name || customer.customerName || "N/A";

        // Quantities
        const quantity = entryObj.quantity ?? entryObj.trays ?? 0;

        // Amounts - Calculate in order to ensure consistency
        // First, get the base totalAmount for legacy support
        const baseAmount = entryObj.totalAmount ?? entryObj.amount ?? 0;

        // Calculate cashAmount from explicit value or payment method
        const cashAmount =
          typeof entryObj.cashAmount === "number"
            ? entryObj.cashAmount
            : entryObj.paymentMethod === "CASH"
              ? baseAmount
              : 0;

        // Calculate upiAmount from explicit value or payment method
        const upiAmount =
          typeof entryObj.upiAmount === "number"
            ? entryObj.upiAmount
            : entryObj.paymentMethod === "UPI"
              ? baseAmount
              : 0;

        // Dynamically calculate totalAmount from cash + upi to keep UI in sync
        const totalAmount =
          (typeof cashAmount === "number" ? cashAmount : 0) +
          (typeof upiAmount === "number" ? upiAmount : 0);

        // Payment Method label
        let paymentMethod = entryObj.paymentMethod || "UNKNOWN";
        if (paymentMethod === "UNKNOWN") {
          if (cashAmount > 0 && upiAmount > 0) paymentMethod = "SPLIT";
          else if (cashAmount > 0) paymentMethod = "CASH";
          else if (upiAmount > 0) paymentMethod = "UPI";
        }

        // Extract delivery agent
        let deliveryAgent = "-";
        if (entryObj.agentName) {
          deliveryAgent = entryObj.agentName;
        } else if (entryObj.deliveryMan) {
          deliveryAgent =
            typeof entryObj.deliveryMan === "object"
              ? entryObj.deliveryMan.name
              : entryObj.deliveryMan;
        }

        // Extract delivery time
        let deliveryTime = "-";
        const timeVal =
          entryObj.time || entryObj.timestamp || customer.last8DaysUpdatedAt;
        if (timeVal) {
          const parsedDate = parseTimestamp(timeVal);
          if (parsedDate && !isNaN(parsedDate.getTime())) {
            deliveryTime = parsedDate.toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
            });
          }
        }

        return {
          customerId: custid,
          customerName,
          quantity: quantity || "-",
          paymentMethod,
          cash: cashAmount || "-",
          upi: upiAmount || "-",
          amount: totalAmount || "-",
          deliveryAgent,
          deliveryTime,
          rawDeliveryTime: timeVal,
          docId: customer.id || customer._id,
        };
      })
      .filter(Boolean);

    // Apply tab filter
    let temp = customers;

    if (activeTab === "CASH") {
      temp = temp.filter((c) => c.paymentMethod === "CASH");
    } else if (activeTab === "UPI") {
      temp = temp.filter((c) => c.paymentMethod === "UPI");
    }

    // Apply delivery agent filter
    if (selectedAgent !== "all") {
      temp = temp.filter((c) => c.deliveryAgent === selectedAgent);
    }

    // Apply sorting by creation time (newest first)
    if (sortBy === "delivery-time") {
      temp.sort((a, b) => {
        const aTime = parseTimestamp(a.rawDeliveryTime)?.getTime();
        const bTime = parseTimestamp(b.rawDeliveryTime)?.getTime();

        if (aTime == null && bTime == null) return 0;
        if (aTime == null) return 1;
        if (bTime == null) return -1;

        return aTime - bTime; // earliest first
      });
    }

    return temp;
  }, [data, selectedDate, activeTab, selectedAgent, sortBy]);

  // Calculate filtered totals
  const filteredTotals = useMemo(() => {
    if (!filtered || filtered.length === 0) {
      return {
        totalTrays: 0,
        totalCash: 0,
        totalUpi: 0,
        totalAmount: 0,
      };
    }

    let totalTrays = 0;
    let totalCash = 0;
    let totalUpi = 0;
    let totalAmount = 0;

    filtered.forEach((item) => {
      if (item.quantity !== "-") {
        totalTrays += typeof item.quantity === "number" ? item.quantity : 0;
      }
      if (item.cash !== "-" && typeof item.cash === "number") {
        totalCash += item.cash;
      }
      if (item.upi !== "-" && typeof item.upi === "number") {
        totalUpi += item.upi;
      }
      if (item.amount !== "-") {
        totalAmount += typeof item.amount === "number" ? item.amount : 0;
      }
    });

    return {
      totalTrays,
      totalCash,
      totalUpi,
      totalAmount,
    };
  }, [filtered]);

  // ─── Weekday name for display ──────────────────────────────────────────────
  const weekdayName = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday",
  ][new Date(selectedDate + "T00:00:00").getDay() || new Date().getDay()];

  // ─── Total Peak Potential: persistent best for the current tab ─────────
  const totalPeakPotential = useMemo(() => {
    return Number(categoryPeaks["ALL"]) || 0;
  }, [categoryPeaks]);

  // ─── Potential Achieved: sum of trays delivered TODAY in current tab ───────
  const potentialAchieved = filteredTotals.totalTrays;

  // ─── Last Weekday Totals: sum of metrics delivered exactly 7 days ago ────
  const lastWeekdayTotals = useMemo(() => {
    let totals = { totalTrays: 0, totalCash: 0, totalUpi: 0, totalAmount: 0, deliveredCount: 0 };
    if (!data?.customers) return totals;

    // Calculate date exactly 7 days ago
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() - 7);

    // Format to YYYY-MM-DD in IST
    let lastWeekDateStr = d.toISOString().split("T")[0];
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(d);

      const year = parts.find((p) => p.type === "year")?.value;
      const month = parts.find((p) => p.type === "month")?.value;
      const day = parts.find((p) => p.type === "day")?.value;
      if (year && month && day) {
        lastWeekDateStr = `${year}-${month}-${day}`;
      }
    } catch (e) { }

    data.customers.forEach((customer) => {
      const last8Days = customer.last8Days || {};
      const entry = last8Days[lastWeekDateStr];
      if (!entry) return;
      const entryObj = typeof entry === "string" ? { status: entry } : entry;
      if (entryObj.status !== "delivered") return;

      // Apply the same filters as the main list
      let deliveryAgent = "-";
      if (entryObj.agentName) {
        deliveryAgent = entryObj.agentName;
      } else if (entryObj.deliveryMan) {
        deliveryAgent = typeof entryObj.deliveryMan === "object" ? entryObj.deliveryMan.name : entryObj.deliveryMan;
      }

      if (selectedAgent !== "all" && deliveryAgent !== selectedAgent) return;

      // payment method filter
      const baseAmount = entryObj.totalAmount ?? entryObj.amount ?? 0;
      const cashAmount = typeof entryObj.cashAmount === "number" ? entryObj.cashAmount : (entryObj.paymentMethod === "CASH" ? baseAmount : 0);
      const upiAmount = typeof entryObj.upiAmount === "number" ? entryObj.upiAmount : (entryObj.paymentMethod === "UPI" ? baseAmount : 0);

      let paymentMethod = entryObj.paymentMethod || "UNKNOWN";
      if (paymentMethod === "UNKNOWN") {
        if (cashAmount > 0 && upiAmount > 0) paymentMethod = "SPLIT";
        else if (cashAmount > 0) paymentMethod = "CASH";
        else if (upiAmount > 0) paymentMethod = "UPI";
      }

      if (activeTab === "CASH" && paymentMethod !== "CASH") return;
      if (activeTab === "UPI" && paymentMethod !== "UPI") return;

      const trays = entryObj.quantity ?? entryObj.trays ?? 0;
      const numTrays = Number(trays);
      if (Number.isFinite(numTrays) && numTrays > 0) {
        totals.totalTrays += numTrays;
      }
      totals.totalCash += typeof cashAmount === "number" ? cashAmount : 0;
      totals.totalUpi += typeof upiAmount === "number" ? upiAmount : 0;
      totals.totalAmount += (typeof cashAmount === "number" ? cashAmount : 0) + (typeof upiAmount === "number" ? upiAmount : 0);
      totals.deliveredCount += 1;
    });

    return totals;
  }, [data, selectedDate, selectedAgent, activeTab]);

  const lastWeekdayPotential = lastWeekdayTotals.totalTrays;

  // ─── Achievement %: today's trays vs best same-weekday total ──────────────
  const achievementPercentage = useMemo(() => {
    if (totalPeakPotential <= 0) return 0;
    return Math.round((potentialAchieved / totalPeakPotential) * 100);
  }, [potentialAchieved, totalPeakPotential]);

  const lastAchievementPercentage = useMemo(() => {
    if (totalPeakPotential <= 0) return 0;
    return Math.round((lastWeekdayPotential / totalPeakPotential) * 100);
  }, [lastWeekdayPotential, totalPeakPotential]);

  const wowPercentage = useMemo(() => {
    if (lastWeekdayPotential === 0) return potentialAchieved > 0 ? 100 : 0;
    return (((potentialAchieved - lastWeekdayPotential) / lastWeekdayPotential) * 100).toFixed(2);
  }, [potentialAchieved, lastWeekdayPotential]);

  // Get unique delivery agents for selected date
  const deliveryAgentOptions = useMemo(() => {
    const agents = new Set();
    if (data?.customers) {
      data.customers.forEach((customer) => {
        const last8Days = customer.last8Days || {};
        const entry = last8Days[selectedDate];
        if (entry) {
          const entryObj =
            typeof entry === "string" ? { status: entry } : entry;
          if (entryObj.agentName && entryObj.status === "delivered") {
            agents.add(entryObj.agentName);
          }
        }
      });
    }
    return Array.from(agents).sort();
  }, [data, selectedDate]);

  const fetchCollectionSummary = async () => {
    setLoading(true);
    setRefreshing(true);
    setError("");
    try {
      // Fetch full customer data, delivery partners, and sales partners
      const [res, delPartnersRes, salesPartnersRes, peakRes] = await Promise.all([
        axios.get(`${ADMIN_PATH}/user-info`),
        axios.get(`${ADMIN_PATH}/get-del-partner`),
        axios.get(`${ADMIN_PATH}/get-sales-partner`).catch(() => ({ data: [] })),
        axios.get(`${ADMIN_PATH}/category-peak-potentials`).catch(() => ({ data: {} }))
      ]);
      if (Array.isArray(res.data)) {
        setData({
          customers: res.data,
          success: true,
        });
      } else {
        setError("Failed to fetch collection summary");
      }
      setDeliveryPartners(delPartnersRes.data || []);
      setSalesPartners(salesPartnersRes.data || []);
      setCategoryPeaks(peakRes.data || {});

      // Also fetch inventory metrics for the selected date
      await fetchInventoryMetrics(selectedDate);
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Error fetching data. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Recalculate: Clean old last8Days entries and keep only latest 30 days
  const handleRecalculate = async () => {
    if (!data?.customers) return;

    setRecalculating(true);
    setError("");

    try {
      const MAX_BATCH_SIZE = 50;
      const MAX_DATES = 30;

      // Filter customers with more than 30 dates and prepare cleaned data
      const customersToUpdate = data.customers
        .map((customer) => {
          const last8Days = customer.last8Days || {};
          const sortedDates = Object.keys(last8Days).sort().reverse();

          // Only include if more than 30 dates exist
          if (sortedDates.length <= MAX_DATES) {
            return null;
          }

          // Keep only latest 30 dates
          const cleanedLast8Days = {};
          sortedDates.slice(0, MAX_DATES).forEach((date) => {
            cleanedLast8Days[date] = last8Days[date];
          });

          return {
            id: customer.id || customer._id,
            last8Days: cleanedLast8Days,
            removedCount: sortedDates.length - MAX_DATES,
          };
        })
        .filter(Boolean);

      // If nothing to clean, show message
      if (customersToUpdate.length === 0) {
        alert(
          "✓ All customers already have 30 days or less of data. No cleanup needed.",
        );
        setRecalculating(false);
        return;
      }

      // Split into batches and send parallel requests
      const batches = [];
      for (let i = 0; i < customersToUpdate.length; i += MAX_BATCH_SIZE) {
        batches.push(customersToUpdate.slice(i, i + MAX_BATCH_SIZE));
      }

      // Send all batches in parallel
      const batchRequests = batches.map((batch) =>
        axios.post(`${ADMIN_PATH}/recalculate-collection-data`, {
          customers: batch,
        }),
      );

      await Promise.all(batchRequests);

      // Update local state with cleaned data
      setData((prev) => ({
        ...prev,
        customers: prev.customers.map((customer) => {
          const cleanedCustomer = customersToUpdate.find(
            (c) => c.id === (customer.id || customer._id),
          );
          if (cleanedCustomer) {
            return {
              ...customer,
              last8Days: cleanedCustomer.last8Days,
            };
          }
          return customer;
        }),
      }));

      // Show success message
      const totalRemoved = customersToUpdate.reduce(
        (sum, c) => sum + (c.removedCount || 0),
        0,
      );
      alert(
        `✓ Recalculation complete!\n${customersToUpdate.length} customers updated\n${totalRemoved} old entries removed\nKeeping latest 30 days per customer`,
      );
    } catch (err) {
      console.error("Recalculate error:", err);
      setError("Error recalculating data. Please try again.");
    } finally {
      setRecalculating(false);
    }
  };

  const handleExcelExport = useCallback(() => {
    if (!filtered) return;

    const headers = [
      "Cust ID",
      "Customer Name",
      "Delivery Agent",
      "Delivery Time",
      "Quantity",
      "Payment Method",
      "Cash",
      "UPI",
      "Amount",
      "Sales Point",
    ];
    const rows = filtered.map((c) => [
      c.customerId,
      c.customerName,
      c.deliveryAgent,
      c.deliveryTime,
      c.quantity,
      c.paymentMethod,
      c.cash,
      c.upi,
      c.amount,
      typeof c.amount === "number" && typeof c.quantity === "number" && c.quantity > 0
        ? (c.amount / c.quantity).toFixed(3)
        : "-",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${cell === "-" ? "" : cell}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Collection_Summary_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [filtered]);

  // Handle Calculate button click
  const handleCalculate = () => {
    if (!todaysPrice || parseFloat(todaysPrice) <= 0) {
      alert("Please enter a valid Today's Price");
      return;
    }

    const price = parseFloat(todaysPrice);
    const newMinusAmounts = {};

    filtered.forEach((item) => {
      const quantity = typeof item.quantity === "number" ? item.quantity : 0;
      const amount = typeof item.amount === "number" ? item.amount : 0;

      // Minus Amount = Amount - (Today's Price × Quantity)
      const minusAmount = amount - price * quantity;
      newMinusAmounts[item.customerId] = minusAmount;
    });

    setMinusAmounts(newMinusAmounts);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-400 rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Error</h2>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={fetchCollectionSummary}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (!data?.customers || data.customers.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="bg-gray-50 rounded-lg p-12 text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            No Collections Today
          </h2>
          <p className="text-gray-600">
            No delivered orders found for today's collection summary.
          </p>
        </div>
      </div>
    );
  }

  const renderWowIndicator = (current, previous) => {
    if (previous === 0) return current > 0 ? (
      <span className="inline-flex items-center gap-1 text-sm font-bold text-green-500 mt-1 whitespace-nowrap"><span>▲</span><span>100%</span></span>
    ) : (
      <span className="inline-flex items-center gap-1 text-sm font-bold text-gray-500 mt-1 whitespace-nowrap"><span>▬</span><span>0%</span></span>
    );

    const diff = (((current - previous) / previous) * 100).toFixed(2);
    const color = diff > 0 ? 'text-green-500' : diff < 0 ? 'text-red-500' : 'text-gray-500';
    const icon = diff > 0 ? '▲' : diff < 0 ? '▼' : '▬';
    return (
      <span className={`inline-flex items-center gap-1 text-sm font-bold ${color} mt-1 whitespace-nowrap`}>
        <span>{icon}</span><span>{Math.abs(diff)}%</span>
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 w-full">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Collection Summary</h1>
          <p className="text-sm text-gray-600 mt-1">
            Viewing data for:{" "}
            <span className="font-semibold">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString(
                "en-IN",
                {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                },
              )}
            </span>
          </p>
        </div>

        {/* ⭐ Total Peak Potential & Potential Achieved row */}
        <div className="flex gap-4 mb-4 md:mb-0 flex-nowrap">
          <div className="bg-white px-5 py-3 rounded-xl shadow border-l-4 border-orange-500 flex flex-col justify-center">
            <p className="text-xs text-gray-500 whitespace-nowrap">
              Best {weekdayName} Potential
            </p>
            <p className="text-xl font-bold text-orange-600">
              {loading ? "…" : `T(${totalPeakPotential})`}
            </p>
          </div>

          <div className="bg-white px-5 py-3 rounded-xl shadow border-l-4 border-purple-500 flex flex-col justify-center">
            <p className="text-xs text-gray-500 whitespace-nowrap">
              Potential Achieved
            </p>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold text-purple-600">
                {loading ? "…" : potentialAchieved}
              </p>
              {!loading && (
                <span className={`inline-flex items-center gap-1 text-sm font-bold whitespace-nowrap ${wowPercentage > 0 ? 'text-green-500' : wowPercentage < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                  <span>{wowPercentage > 0 ? '▲' : wowPercentage < 0 ? '▼' : '▬'}</span>
                  <span>{Math.abs(wowPercentage)}%</span>
                </span>
              )}
            </div>
            {!loading && totalPeakPotential > 0 && (
              <p
                className="text-xs font-semibold mt-1"
                style={{
                  color:
                    achievementPercentage >= 100
                      ? "#0F9D58"
                      : achievementPercentage >= 70
                        ? "#FB8C00"
                        : "#FF3B30",
                }}
              >
                {achievementPercentage}% achieved
              </p>
            )}
          </div>

          <div className="bg-white px-5 py-3 rounded-xl shadow border-l-4 border-blue-500 flex flex-col justify-center">
            <p className="text-xs text-gray-500 whitespace-nowrap">
              Last {weekdayName} Potential
            </p>
            <p className="text-xl font-bold text-blue-600">
              {loading ? "…" : lastWeekdayPotential}
            </p>
            {!loading && totalPeakPotential > 0 && (
              <p
                className="text-xs font-semibold mt-1"
                style={{
                  color:
                    lastAchievementPercentage >= 100
                      ? "#0F9D58"
                      : lastAchievementPercentage >= 70
                        ? "#FB8C00"
                        : "#FF3B30",
                }}
              >
                {lastAchievementPercentage}% achieved
              </p>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="flex gap-4 w-full md:w-auto flex-nowrap ml-auto">
          <div className="bg-white p-6 rounded-xl shadow border-l-4 border-indigo-400 flex flex-col justify-center min-w-[160px]">
            <p className="text-sm text-gray-600 mb-1 whitespace-nowrap">Avg Order</p>
            <div className="flex items-end justify-between gap-4">
              <p className="text-2xl font-bold text-gray-900">
                {filtered.length > 0 ? (filteredTotals.totalTrays / filtered.length).toFixed(2) : "0.00"}
              </p>
              {!loading && renderWowIndicator(
                filtered.length > 0 ? (filteredTotals.totalTrays / filtered.length) : 0,
                lastWeekdayTotals.deliveredCount > 0 ? (lastWeekdayTotals.totalTrays / lastWeekdayTotals.deliveredCount) : 0
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500 flex flex-col justify-center min-w-[160px]">
            <p className="text-sm text-gray-600 mb-1 whitespace-nowrap">Total Collections</p>
            <div className="flex items-end justify-between gap-4">
              <p className="text-2xl font-bold">
                {loading ? "…" : filtered.length}
              </p>
              {!loading && renderWowIndicator(filtered.length, lastWeekdayTotals.deliveredCount)}
            </div>
          </div>
        </div>
      </div>

      {/* Alert banner if user tries to add entry without selecting agent */}
      {agentWarningMessage && (
        <div className="mb-5 bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-xl flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-sm font-bold text-orange-900">Select Delivery Agent First</p>
              <p className="text-xs text-orange-700 font-medium">{agentWarningMessage}</p>
            </div>
          </div>
          <button
            onClick={() => setAgentWarningMessage("")}
            className="text-orange-500 hover:text-orange-800 p-1.5 rounded-lg hover:bg-orange-100 transition cursor-pointer"
            title="Dismiss"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap items-center">
        {["ALL", "CASH", "UPI"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl border font-medium transition ${activeTab === tab
              ? "bg-black text-white border-black"
              : "bg-white text-gray-900 border-gray-200 hover:border-gray-300"
              }`}
          >
            {tab}
          </button>
        ))}

        {/* Delivery Agent Filter */}
        <div className="flex items-center gap-2 ml-2">
          <label className="text-sm font-medium text-gray-600">Agent:</label>
          <select
            value={selectedAgent}
            onChange={(e) => {
              const newAgent = e.target.value;
              setSelectedAgent(newAgent);
              setAgentWarningMessage("");
              setAgentSelectHighlight(false);
              if (newAgent === "all") {
                setSelectedOutlet("all");
              } else {
                const partner = findPartnerByName(newAgent);
                if (partner && partner.outlet) {
                  setSelectedOutlet(partner.outlet);
                } else {
                  setSelectedOutlet("all");
                }
              }
            }}
            className={`border rounded-lg px-3 py-2 text-sm font-medium bg-white transition-all duration-300 ${
              agentSelectHighlight
                ? "border-orange-500 ring-4 ring-orange-300 shadow-md font-bold text-orange-900"
                : "border-gray-300 focus:ring-2 focus:ring-purple-500"
            }`}
          >
            <option value="all">All Delivery Agents</option>
            {deliveryAgentOptions.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>
        </div>

        {/* Outlet Filter */}
        <div className="flex items-center gap-2 ml-2">
          <label className="text-sm font-medium text-gray-600">Outlet:</label>
          <select
            value={selectedOutlet}
            onChange={(e) => {
              const newOutlet = e.target.value;
              setSelectedOutlet(newOutlet);
              if (newOutlet === "all") {
                setSelectedAgent("all");
              } else {
                const partner = deliveryPartners.find(p => p.outlet === newOutlet) || salesPartners.find(p => p.outlet === newOutlet);
                if (partner && partner.name) {
                  setSelectedAgent(partner.name);
                } else {
                  setSelectedAgent("all");
                }
              }
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium bg-white"
          >
            <option value="all">All Outlets</option>
            {Array.from(
              new Set([
                ...deliveryPartners.map((p) => p.outlet),
                ...salesPartners.map((p) => p.outlet),
              ].filter(Boolean))
            )
              .sort()
              .map((outlet) => (
                <option key={outlet} value={outlet}>
                  {outlet}
                </option>
              ))}
          </select>
        </div>

        {/* Date Picker */}
        <div className="flex items-center gap-2 ml-auto">
          <Calendar size={18} className="text-gray-600" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium"
          />
        </div>

        {/* Refresh and Export Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={fetchCollectionSummary}
            disabled={refreshing}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExcelExport}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition w-full justify-center"
          >
            <Download size={18} />
            <span>Export</span>
          </button>
        </div>

        {/* Recalculate Button */}
        <button
          onClick={handleRecalculate}
          disabled={recalculating || !data}
          className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-semibold py-2 px-4 rounded-lg transition"
          title="Clean old entries and keep latest 20 days"
        >
          <Zap size={18} className={recalculating ? "animate-spin" : ""} />
          <span>Recalculate</span>
        </button>

        {/* Calculator Controls */}
        <div className="flex items-center gap-2 ml-2">
          <input
            type="number"
            value={todaysPrice}
            onChange={(e) => {
              const newValue = e.target.value;
              setTodaysPrice(newValue);
              // Clear minusAmounts when input is cleared
              if (newValue === "") {
                setMinusAmounts({});
              }
            }}
            placeholder="Today's Price"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleCalculate}
            className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition whitespace-nowrap"
          >
            Calculate
          </button>
        </div>
      </div>

      {/* Summary Stats Cards */}
      {/* Row 1 Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {(() => {
          const sales = displayedMetrics.nettSales;
          const load = displayedMetrics.totalLoad;
          const ret = displayedMetrics.totalReturn;
          const dmg = displayedMetrics.totalDamage;
          const inc = displayedMetrics.incentives || 0;

          const cards = [
            {
              label: "NETT Sales",
              value: sales,
              format: (v) => v.toLocaleString("en-IN"),
              color: "border-t-blue-500",
              unit: "Trays",
              topRight: "Qty",
            },
            {
              label: "Total Load",
              value: load,
              format: (v) => v.toLocaleString("en-IN"),
              color: "border-t-green-500",
              unit: "Trays",
              topRight: "Qty",
              addType: "load",
            },
            {
              label: "Total Return",
              value: ret,
              format: (v) => v.toLocaleString("en-IN"),
              color: "border-t-purple-500",
              unit: "Trays",
              topRight: "Qty",
              addType: "return",
            },
            {
              label: "Total Damage",
              value: dmg,
              format: (v) => v.toLocaleString("en-IN"),
              color: "border-t-orange-500",
              unit: "Pcs",
              topRight: "Qty",
              addType: "damage",
            },
            {
              label: "Incentives",
              value: inc,
              format: (v) => `₹${v.toLocaleString("en-IN")}`,
              color: "border-t-purple-500",
              topRight: "Amt",
              addType: "incentive",
            },
          ];

          return cards.map((card) => (
            <div
              key={card.label}
              className={`bg-white rounded-lg p-5 shadow border-t-4 ${card.color} flex flex-col justify-between`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-600">{card.label}</p>
                <span className="text-xs font-semibold text-gray-500">{card.topRight}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-3">
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-gray-900">
                    {card.format(card.value)}
                  </p>
                  {card.unit && (
                    <span className="text-xl font-semibold text-gray-500 ml-1">{card.unit}</span>
                  )}
                </div>
                {card.addType && (
                  <button
                    onClick={() => openAddModal(card.addType)}
                    className="px-3 py-1 border-2 border-purple-600 text-purple-700 hover:bg-purple-50 font-bold rounded-xl text-xs transition flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer ml-auto shrink-0"
                    title={`Add ${card.label}`}
                  >
                    <span>ADD</span>
                    <span className="text-sm font-black">+</span>
                  </button>
                )}
              </div>
            </div>
          ));
        })()}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg p-6 shadow border-t-4 border-t-blue-500 flex flex-col justify-between">
          <p className="text-sm text-gray-600 mb-2">Total Trays</p>
          <div className="flex justify-between items-end">
            <p className="text-3xl font-bold text-gray-900">
              {filteredTotals.totalTrays}
            </p>
            {renderWowIndicator(filteredTotals.totalTrays, lastWeekdayTotals.totalTrays)}
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow border-t-4 border-t-teal-400 flex flex-col justify-between">
          <p className="text-sm text-gray-600 mb-2">Sales Point</p>
          <div className="flex justify-between items-end">
            <p className="text-3xl font-bold text-gray-900">
              {filteredTotals.totalTrays > 0 ? (filteredTotals.totalAmount / filteredTotals.totalTrays).toFixed(3) : "0.000"}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow border-t-4 border-t-green-500 flex flex-col justify-between">
          <p className="text-sm text-gray-600 mb-2">Total Cash</p>
          <div className="flex justify-between items-end">
            <p className="text-3xl font-bold text-gray-900">
              ₹{filteredTotals.totalCash.toLocaleString("en-IN")}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow border-t-4 border-t-purple-500 flex flex-col justify-between">
          <p className="text-sm text-gray-600 mb-2">Total UPI</p>
          <div className="flex justify-between items-end">
            <p className="text-3xl font-bold text-gray-900">
              ₹{filteredTotals.totalUpi.toLocaleString("en-IN")}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow border-t-4 border-t-orange-500 flex flex-col justify-between">
          <p className="text-sm text-gray-600 mb-2">Total Amount</p>
          <div className="flex justify-between items-end">
            <p className="text-3xl font-bold text-gray-900">
              ₹{filteredTotals.totalAmount.toLocaleString("en-IN")}
            </p>
          </div>
        </div>
      </div>

      {/* Row 2 Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {(() => {
          const cash = displayedMetrics.cashHandover || 0;
          const upiHandover = displayedMetrics.upiHandover || 0;
          const food = displayedMetrics.foodAllowance || 0;
          const totalUpi = filteredTotals.totalUpi || 0;
          const upiBalance = totalUpi - upiHandover;
          // difference/balance = Total Cash - Cash Handover - Food Allowance
          const totalCash = filteredTotals.totalCash || 0;
          const diff = totalCash - cash - food;

          const cards = [
            {
              label: "Cash Handover",
              value: cash,
              format: (v) => `₹${v.toLocaleString("en-IN")}`,
              color: "border-t-blue-500",
              topRight: "Amt",
              addType: "cash_handover",
            },
            {
              label: "UPI Handover",
              value: upiHandover,
              format: (v) => `₹${v.toLocaleString("en-IN")}`,
              color: "border-t-indigo-500",
              topRight: "Amt",
              addType: "upi_handover",
            },
            {
              label: "Food Allowance",
              value: food,
              format: (v) => `₹${v.toLocaleString("en-IN")}`,
              color: "border-t-green-500",
              topRight: "Amt",
              addType: "food_allowance",
            },
            {
              label: "UPI Balance",
              value: upiBalance,
              format: (v) => {
                if (v < 0) {
                  return `-₹${Math.abs(v).toLocaleString("en-IN")}`;
                }
                return `₹${v.toLocaleString("en-IN")}`;
              },
              color: "border-t-purple-500",
              topRight: "Amt",
            },
            {
              label: "Cash Balance",
              value: diff,
              format: (v) => {
                if (v < 0) {
                  return `-₹${Math.abs(v).toLocaleString("en-IN")}`;
                }
                return `₹${v.toLocaleString("en-IN")}`;
              },
              color: "border-t-orange-500",
              topRight: "Amt",
            },
          ];

          return cards.map((card) => (
            <div
              key={card.label}
              className={`bg-white rounded-lg p-5 shadow border-t-4 ${card.color} flex flex-col justify-between`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-600">{card.label}</p>
                <span className="text-xs font-semibold text-gray-500">{card.topRight}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-3">
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-gray-900">
                    {card.format(card.value)}
                  </p>
                </div>
                {card.addType && (
                  <button
                    onClick={() => openAddModal(card.addType)}
                    className="px-3 py-1 border-2 border-purple-600 text-purple-700 hover:bg-purple-50 font-bold rounded-xl text-xs transition flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer ml-auto shrink-0"
                    title={`Add ${card.label}`}
                  >
                    <span>ADD</span>
                    <span className="text-sm font-black">+</span>
                  </button>
                )}
              </div>
            </div>
          ));
        })()}
      </div>




      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="p-3 text-left font-semibold text-gray-900">
                Cust ID
              </th>
              <th className="p-3 text-left font-semibold text-gray-900">
                Customer Name
              </th>
              <th className="p-3 text-left font-semibold text-gray-900">
                Delivery Agent
              </th>
              <th className="p-3 text-left font-semibold text-gray-900">
                Delivery Time
              </th>
              <th className="p-3 text-center font-semibold text-gray-900">
                Quantity
              </th>
              <th className="p-3 text-center font-semibold text-gray-900">
                Payment Method
              </th>
              <th className="p-3 text-right font-semibold text-gray-900">
                Cash
              </th>
              <th className="p-3 text-right font-semibold text-gray-900">
                UPI
              </th>
              <th className="p-3 text-right font-semibold text-gray-900">
                Amount
              </th>
              <th className="p-3 text-right font-semibold text-gray-900">
                Sales Point
              </th>
              <th className="p-3 text-right font-semibold text-gray-900">
                Minus Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {editError && (
              <tr>
                <td colSpan="10" className="p-3 bg-red-50 border-t">
                  <div className="text-red-700 text-sm">
                    Error: {editError}
                    <button
                      onClick={() => setEditError("")}
                      className="ml-3 text-red-600 hover:text-red-800 underline"
                    >
                      Dismiss
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {filtered.map((item) => (
              <tr
                key={item.customerId}
                className="border-t hover:bg-gray-50 transition"
              >
                <td className="p-3 font-medium text-gray-900">
                  {item.customerId}
                </td>
                <td className="p-3 font-medium text-gray-700">
                  {item.customerName}
                </td>
                <td className="p-3 font-medium text-gray-700">
                  {item.deliveryAgent}
                </td>
                <td className="p-3 font-medium text-gray-700">
                  {item.deliveryTime}
                </td>

                {/* Quantity Column */}
                <td className="p-3 text-center text-gray-700 font-medium">
                  {editingCell?.rowId === item.docId &&
                    editingCell?.field === "quantity" ? (
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-14 px-1.5 py-0.5 border border-gray-300 rounded text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={savingEdit}
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveCell(item)}
                        disabled={savingEdit}
                        className="text-green-600 hover:text-green-700 disabled:text-green-400"
                        title="Save"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={savingEdit}
                        className="text-gray-400 hover:text-gray-600 disabled:text-gray-300"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 group">
                      <span>{item.quantity}</span>
                      <button
                        onClick={() => handleEditCell(item, "quantity")}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-700 transition-opacity"
                        title="Edit quantity"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  )}
                </td>

                <td className="p-3 text-center">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${item.paymentMethod === "CASH"
                      ? "bg-green-100 text-green-800"
                      : "bg-purple-100 text-purple-800"
                      }`}
                  >
                    {item.paymentMethod}
                  </span>
                </td>

                {/* Cash Column */}
                <td className="p-3 text-right text-gray-700 font-medium">
                  {editingCell?.rowId === item.docId &&
                    editingCell?.field === "cash" ? (
                    <div className="flex items-center justify-end gap-2">
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-20 px-1.5 py-0.5 border border-gray-300 rounded text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={savingEdit}
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveCell(item)}
                        disabled={savingEdit}
                        className="text-green-600 hover:text-green-700 disabled:text-green-400"
                        title="Save"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={savingEdit}
                        className="text-gray-400 hover:text-gray-600 disabled:text-gray-300"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2 group">
                      <span>
                        {typeof item.cash === "number"
                          ? `₹${item.cash.toLocaleString("en-IN")}`
                          : item.cash}
                      </span>
                      <button
                        onClick={() => handleEditCell(item, "cash")}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-700 transition-opacity"
                        title="Edit cash amount"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  )}
                </td>

                {/* UPI Column */}
                <td className="p-3 text-right text-gray-700 font-medium">
                  {editingCell?.rowId === item.docId &&
                    editingCell?.field === "upi" ? (
                    <div className="flex items-center justify-end gap-2">
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-20 px-1.5 py-0.5 border border-gray-300 rounded text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={savingEdit}
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveCell(item)}
                        disabled={savingEdit}
                        className="text-green-600 hover:text-green-700 disabled:text-green-400"
                        title="Save"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={savingEdit}
                        className="text-gray-400 hover:text-gray-600 disabled:text-gray-300"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2 group">
                      <span>
                        {typeof item.upi === "number"
                          ? `₹${item.upi.toLocaleString("en-IN")}`
                          : item.upi}
                      </span>
                      <button
                        onClick={() => handleEditCell(item, "upi")}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-700 transition-opacity"
                        title="Edit UPI amount"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  )}
                </td>

                <td className="p-3 text-right text-gray-900 font-semibold">
                  {typeof item.amount === "number"
                    ? `₹${item.amount.toLocaleString("en-IN")}`
                    : item.amount}
                </td>

                <td className="p-3 text-right text-gray-900 font-semibold">
                  {typeof item.amount === "number" &&
                    typeof item.quantity === "number" &&
                    item.quantity > 0
                    ? `₹${(item.amount / item.quantity).toLocaleString("en-IN", {
                      minimumFractionDigits: 3,
                      maximumFractionDigits: 3,
                    })}`
                    : "-"}
                </td>

                <td className="p-3 text-right font-semibold">
                  {minusAmounts[item.customerId] !== undefined ? (
                    <span
                      className={
                        minusAmounts[item.customerId] < 0
                          ? "text-red-600"
                          : "text-gray-900"
                      }
                    >
                      ₹{minusAmounts[item.customerId].toLocaleString("en-IN")}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}

            {/* Totals Row */}
            <tr className="bg-gray-100 border-t-2 border-gray-300 font-semibold">
              <td colSpan="5" className="p-3 text-gray-900">
                TOTAL ({filtered.length}{" "}
                {filtered.length === 1 ? "order" : "orders"})
              </td>
              <td className="p-3"></td>
              <td className="p-3 text-right text-gray-900">
                ₹{filteredTotals.totalCash.toLocaleString("en-IN")}
              </td>
              <td className="p-3 text-right text-gray-900">
                ₹{filteredTotals.totalUpi.toLocaleString("en-IN")}
              </td>
              <td className="p-3 text-right text-gray-900">
                ₹{filteredTotals.totalAmount.toLocaleString("en-IN")}
              </td>
              <td className="p-3 text-right text-gray-900">
                {filteredTotals.totalTrays > 0
                  ? `₹${(
                    filteredTotals.totalAmount / filteredTotals.totalTrays
                  ).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                  : "-"}
              </td>
              <td className="p-3 text-right text-gray-900">
                {Object.keys(minusAmounts).length > 0
                  ? `₹${Object.values(minusAmounts)
                    .reduce((sum, val) => sum + val, 0)
                    .toLocaleString("en-IN")}`
                  : "-"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Modal for Adding Inventory/Handover Data */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 flex items-center justify-between text-white">
              <div>
                <h3 className="text-lg font-bold">
                  Add {TYPE_CONFIG[addModalType]?.title || "Entry"}
                </h3>
                <p className="text-xs text-purple-100 mt-0.5">
                  Direct data entry for {selectedAgent}
                </p>
              </div>
              <button
                onClick={closeAddModal}
                className="text-white/80 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleAddEntrySubmit} className="p-6 space-y-4">
              {addFormError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm font-medium">
                  {addFormError}
                </div>
              )}

              {/* Selected Agent & Date Display Banner */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-xl p-3.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <User size={15} className="text-purple-600" />
                  <span className="font-semibold text-gray-500">Agent:</span>
                  <span className="font-bold text-purple-900 bg-purple-100/80 px-2 py-0.5 rounded-md">
                    {selectedAgent}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar size={15} className="text-indigo-600" />
                  <span className="font-semibold text-gray-500">Date:</span>
                  <span className="font-bold text-indigo-900 bg-indigo-100/80 px-2 py-0.5 rounded-md">
                    {new Date((selectedDate || getTodayDateString()) + "T00:00:00").toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric"
                    })}
                  </span>
                </div>
              </div>

              {/* Quantity / Amount Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1.5">
                  {TYPE_CONFIG[addModalType]?.label || "Quantity / Amount"} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  autoFocus
                  placeholder={`Enter ${TYPE_CONFIG[addModalType]?.label || "value"}`}
                  value={addFormValue}
                  onChange={(e) => setAddFormValue(e.target.value)}
                  className="w-full border-2 border-purple-200 rounded-xl px-4 py-2.5 text-base font-semibold focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none transition"
                  required
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                  Remarks / Notes (Optional)
                </label>
                <textarea
                  rows="2"
                  placeholder="Enter remarks (optional)"
                  value={addFormRemarks}
                  onChange={(e) => setAddFormRemarks(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addFormSubmitting}
                  className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 rounded-lg transition shadow flex items-center gap-2 cursor-pointer"
                >
                  {addFormSubmitting && <RefreshCw size={16} className="animate-spin" />}
                  <span>Save Entry</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectionSummary;

