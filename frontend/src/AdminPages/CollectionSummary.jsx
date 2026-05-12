import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { ADMIN_PATH } from "../constant";
import { Download, RefreshCw, Calendar, Zap } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [activeTab, setActiveTab] = useState("ALL");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [sortBy] = useState("delivery-time");
  const [todaysPrice, setTodaysPrice] = useState("");
  const [minusAmounts, setMinusAmounts] = useState({});

  // Get date string in Kolkata timezone

  // Fetch collection summary
  useEffect(() => {
    fetchCollectionSummary();
  }, []);

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

        // Amounts
        const totalAmount = entryObj.totalAmount ?? entryObj.amount ?? 0;
        const cashAmount =
          typeof entryObj.cashAmount === "number"
            ? entryObj.cashAmount
            : entryObj.paymentMethod === "CASH"
              ? totalAmount
              : 0;
        const upiAmount =
          typeof entryObj.upiAmount === "number"
            ? entryObj.upiAmount
            : entryObj.paymentMethod === "UPI"
              ? totalAmount
              : 0;

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
      // Fetch full customer data with last8Days
      const res = await axios.get(`${ADMIN_PATH}/user-info`);
      if (Array.isArray(res.data)) {
        setData({
          customers: res.data,
          success: true,
        });
      } else {
        setError("Failed to fetch collection summary");
      }
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

        {/* Stats Card */}
        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500 flex items-center gap-6 w-full md:w-auto">
          <FiTrendingUp className="text-3xl text-blue-500 flex-shrink-0" />

          <div className="flex-1">
            <p className="text-sm text-gray-600">Total Collections</p>
            <p className="text-2xl font-bold">
              {loading ? "…" : filtered.length}
            </p>
          </div>

          <button
            onClick={handleExcelExport}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 whitespace-nowrap"
          >
            <Download size={18} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap items-center">
        {["ALL", "CASH", "UPI"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl border font-medium transition ${
              activeTab === tab
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
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium bg-white"
          >
            <option value="all">All Delivery Agents</option>
            {deliveryAgentOptions.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
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

        {/* Refresh Button */}
        <button
          onClick={fetchCollectionSummary}
          disabled={refreshing}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg p-6 shadow border-t-4 border-t-blue-500">
          <p className="text-sm text-gray-600 mb-2">Total Trays</p>
          <p className="text-3xl font-bold text-gray-900">
            {filteredTotals.totalTrays}
          </p>
        </div>

        <div className="bg-white rounded-lg p-6 shadow border-t-4 border-t-green-500">
          <p className="text-sm text-gray-600 mb-2">Total Cash</p>
          <p className="text-3xl font-bold text-gray-900">
            ₹{filteredTotals.totalCash.toLocaleString("en-IN")}
          </p>
        </div>

        <div className="bg-white rounded-lg p-6 shadow border-t-4 border-t-purple-500">
          <p className="text-sm text-gray-600 mb-2">Total UPI</p>
          <p className="text-3xl font-bold text-gray-900">
            ₹{filteredTotals.totalUpi.toLocaleString("en-IN")}
          </p>
        </div>

        <div className="bg-white rounded-lg p-6 shadow border-t-4 border-t-orange-500">
          <p className="text-sm text-gray-600 mb-2">Total Amount</p>
          <p className="text-3xl font-bold text-gray-900">
            ₹{filteredTotals.totalAmount.toLocaleString("en-IN")}
          </p>
        </div>
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
                Minus Amount
              </th>
            </tr>
          </thead>
          <tbody>
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
                <td className="p-3 text-center text-gray-700 font-medium">
                  {item.quantity}
                </td>
                <td className="p-3 text-center">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                      item.paymentMethod === "CASH"
                        ? "bg-green-100 text-green-800"
                        : "bg-purple-100 text-purple-800"
                    }`}
                  >
                    {item.paymentMethod}
                  </span>
                </td>
                <td className="p-3 text-right text-gray-700 font-medium">
                  {typeof item.cash === "number"
                    ? `₹${item.cash.toLocaleString("en-IN")}`
                    : item.cash}
                </td>
                <td className="p-3 text-right text-gray-700 font-medium">
                  {typeof item.upi === "number"
                    ? `₹${item.upi.toLocaleString("en-IN")}`
                    : item.upi}
                </td>
                <td className="p-3 text-right text-gray-900 font-semibold">
                  {typeof item.amount === "number"
                    ? `₹${item.amount.toLocaleString("en-IN")}`
                    : item.amount}
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
              <td colSpan="4" className="p-3 text-gray-900">
                TOTAL ({filtered.length}{" "}
                {filtered.length === 1 ? "order" : "orders"})
              </td>
              <td className="p-3 text-center text-gray-900">
                {filteredTotals.totalTrays}
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
    </div>
  );
};

export default CollectionSummary;
