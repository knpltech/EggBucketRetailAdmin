import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FiUsers, FiMapPin, FiTarget, FiTrendingUp, FiEdit2 } from "react-icons/fi";
import { ADMIN_PATH } from "../constant";
import { getCachedUserInfo, invalidateClientUserInfoCache } from "../utils/customerInfoClientCache";
import { getTodayEffectiveStatus } from "../utils/aiSuggestionEngine";

export default function CustomerRoutes() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [agents, setAgents] = useState([]);
  const [categoryPeaks, setCategoryPeaks] = useState({});
  const [availablePriorities, setAvailablePriorities] = useState([]);

  // Filtering and Selection
  const [sortBy, setSortBy] = useState("routeName");
  const [assignSelectedRoute, setAssignSelectedRoute] = useState("");
  const [assignSelectedAgent, setAssignSelectedAgent] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // Inline editing
  const [editingRoute, setEditingRoute] = useState(null);
  const [editRouteValue, setEditRouteValue] = useState("");
  const [isSavingRoute, setIsSavingRoute] = useState(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const userInfoData = await getCachedUserInfo();
        const rows = Array.isArray(userInfoData.customers)
          ? userInfoData.customers
          : Array.isArray(userInfoData)
            ? userInfoData
            : [];
        setCustomers(rows);

        const [routesRes, agentsRes, peakRes, prioritiesRes] = await Promise.all([
          axios.get(`${ADMIN_PATH}/routes`),
          axios.get(`${ADMIN_PATH}/get-del-partner`),
          axios.get(`${ADMIN_PATH}/category-peak-potentials`).catch(() => ({ data: {} })),
          axios.get(`${ADMIN_PATH}/priorities`).catch(() => ({ data: [] })),
        ]);

        const fetchedRoutes = routesRes.data || [];
        const fetchedPriorities = (prioritiesRes.data || []).sort((a, b) => (a.order || 99) - (b.order || 99));
        setRoutes(fetchedRoutes);
        setAgents(agentsRes.data || []);
        setCategoryPeaks(peakRes.data || {});
        setAvailablePriorities(fetchedPriorities);
      } catch (err) {
        console.error("Init error in Route Management:", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Compute route statistics
  const routeData = useMemo(() => {
    const routeMap = {};

    routes.forEach(routeObj => {
      const routeName = typeof routeObj === "string" ? routeObj : routeObj.name;
      const routePriorityId = (typeof routeObj === "object" && routeObj.priorityId) || null;
      const routePriority = availablePriorities.find(p => p.id === routePriorityId) || null;

      routeMap[routeName] = {
        name: routeName,
        priority: routePriority,
        priorityId: routePriorityId,
        description: typeof routeObj === "string" ? "" : (routeObj.description || ""),
        totalCustomers: 0,
        activeCustomers: 0,
        bestPotential: Number(categoryPeaks[`ROUTE_${routeName.toUpperCase()}`]) || 0,
        potentialAchieved: 0,
        yesterdayTotalCustomers: 0,
        yesterdayPotentialAchieved: 0,
        yesterdayActiveCustomers: 0,
        agentsAssigned: {},
        assignedAgent: "Unassigned",
        assignedAgentName: "Unassigned"
      };
    });

    const todayDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const yesterdayDateObj = new Date();
    yesterdayDateObj.setDate(yesterdayDateObj.getDate() - 1);
    const yesterdayDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(yesterdayDateObj);

    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);

    // Process customers
    customers.forEach(customer => {
      const route = customer.route;
      if (route && routeMap[route]) {
        routeMap[route].totalCustomers += 1;

        if (getTodayEffectiveStatus(customer) === "ON") {
          routeMap[route].activeCustomers += 1;
        }

        if (getTodayEffectiveStatus(customer, yesterdayDate) === "ON") {
          routeMap[route].yesterdayActiveCustomers += 1;
        }

        const agentId = customer.assignedDeliverymen;
        if (agentId) {
          routeMap[route].agentsAssigned[agentId] = (routeMap[route].agentsAssigned[agentId] || 0) + 1;
        }

        // Calculate Potential Achieved today
        const last8Days = customer.last8Days || {};
        const todayEntry = last8Days[todayDate];
        if (todayEntry) {
          const status = String(typeof todayEntry === "string" ? todayEntry : todayEntry?.status || "").trim().toLowerCase();
          if (status === "delivered") {
            const trays = todayEntry.traysDelivered ?? todayEntry.trays ?? todayEntry.quantity ?? todayEntry?.deliveredTrays ?? 0;
            const numTrays = Number(trays);
            if (Number.isFinite(numTrays) && numTrays > 0) {
              routeMap[route].potentialAchieved += numTrays;
            }
          }
        }

        // Calculate yesterday's stats
        if (!customer.createdAt || new Date(customer.createdAt) < todayStart) {
          routeMap[route].yesterdayTotalCustomers += 1;
        }

        const yesterdayEntry = last8Days[yesterdayDate];
        if (yesterdayEntry) {
          const status = String(typeof yesterdayEntry === "string" ? yesterdayEntry : yesterdayEntry?.status || "").trim().toLowerCase();
          if (status === "delivered") {
            const trays = yesterdayEntry.traysDelivered ?? yesterdayEntry.trays ?? yesterdayEntry.quantity ?? yesterdayEntry?.deliveredTrays ?? 0;
            const numTrays = Number(trays);
            if (Number.isFinite(numTrays) && numTrays > 0) {
              routeMap[route].yesterdayPotentialAchieved += numTrays;
            }
          }
        }
      }
    });

    // Finalize route details
    const finalizedRoutes = Object.values(routeMap).map(routeInfo => {
      let mostCommonAgent = null;
      let maxCount = 0;

      for (const [agentId, count] of Object.entries(routeInfo.agentsAssigned)) {
        if (count > maxCount) {
          mostCommonAgent = agentId;
          maxCount = count;
        }
      }

      if (mostCommonAgent) {
        const agentObj = agents.find(a => a.id === mostCommonAgent || a.name === mostCommonAgent);
        routeInfo.assignedAgent = mostCommonAgent;
        routeInfo.assignedAgentName = agentObj ? (agentObj.name || agentObj.display_name) : mostCommonAgent;
      }

      return {
        ...routeInfo
      };
    });

    // Sort routes by selected sort criteria (default: Route Name)
    return finalizedRoutes.sort((a, b) => {
      if (sortBy === "priority") {
        const orderA = a.priority ? (a.priority.order || 99) : 99;
        const orderB = b.priority ? (b.priority.order || 99) : 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      } else {
        // Default: Route Name
        const nameComparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        if (nameComparison !== 0) return nameComparison;
        const orderA = a.priority ? (a.priority.order || 99) : 99;
        const orderB = b.priority ? (b.priority.order || 99) : 99;
        return orderA - orderB;
      }
    });
  }, [routes, customers, agents, categoryPeaks, availablePriorities, sortBy]);

  // Compute Agent stats for Right Sidebar
  const agentStats = useMemo(() => {
    return agents.map(agent => {
      const assigned = customers.filter(c =>
        c.assignedDeliverymen === agent.id ||
        c.assignedDeliverymen === agent.name
      );
      const customersAssigned = assigned.length;
      const activeCustomers = assigned.filter(c => getTodayEffectiveStatus(c) === "ON").length;

      // Dynamically compute the routes from the actual assigned customers
      // to ensure it is always in sync, rather than relying on the DB field
      // which might not have been cleared from previous agents.
      const computedRoutes = [...new Set(assigned.map(c => c.route).filter(Boolean))].join(", ");

      return {
        ...agent,
        customersAssigned,
        activeCustomers,
        isActive: agent.active !== false,
        displayRoute: computedRoutes
      };
    });
  }, [agents, customers]);

  const totalCustomersAssigned = routeData.reduce((sum, route) => sum + route.totalCustomers, 0);
  const totalActiveCustomers = routeData.reduce((sum, route) => sum + route.activeCustomers, 0);
  const totalAchievedPotential = routeData.reduce((sum, route) => sum + (route.potentialAchieved || 0), 0);
  const totalYesterdayCustomers = routeData.reduce((sum, route) => sum + (route.yesterdayTotalCustomers || 0), 0);
  const totalYesterdayAchieved = routeData.reduce((sum, route) => sum + (route.yesterdayPotentialAchieved || 0), 0);
  const totalYesterdayActive = routeData.reduce((sum, route) => sum + (route.yesterdayActiveCustomers || 0), 0);

  const getInitials = (name) => {
    if (!name) return "UN";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const handleAssignAgent = async () => {
    if (!assignSelectedRoute || !assignSelectedAgent) return;
    setIsAssigning(true);

    try {
      // Find all customers in this route
      const customersInRoute = customers.filter(c => c.route === assignSelectedRoute);

      if (customersInRoute.length === 0) {
        alert("No customers found in this route.");
        setIsAssigning(false);
        return;
      }

      // Update each customer to have the newly selected agent
      // We will perform API calls concurrently in batches
      const batchSize = 10;
      for (let i = 0; i < customersInRoute.length; i += batchSize) {
        const batch = customersInRoute.slice(i, i + batchSize);
        await Promise.all(batch.map(customer => {
          return axios.put(`${ADMIN_PATH}/customer/assign-agent`, {
            id: customer.id,
            assignedDeliverymen: assignSelectedAgent,
            deliveredBy: assignSelectedAgent
          });
        }));
      }

      // Also assign the route to the delivery agent
      await axios.put(`${ADMIN_PATH}/delivery/assign-route`, {
        uid: assignSelectedAgent,
        route: assignSelectedRoute
      });

      // Clear the cache so next reload fetches fresh data
      invalidateClientUserInfoCache();

      // Update customers local state without full reload
      const updatedCustomers = customers.map(c => {
        if (c.route === assignSelectedRoute) {
          return {
            ...c,
            assignedDeliverymen: assignSelectedAgent
          };
        }
        return c;
      });
      setCustomers(updatedCustomers);

      // Update agents local state to sync with backend behavior
      const updatedAgents = agents.map(a => {
        let currentRoute = a.route || "";
        if (a.id === assignSelectedAgent) {
          let newRouteValue = assignSelectedRoute;
          if (currentRoute) {
            const routesList = currentRoute.split(",").map(r => r.trim()).filter(Boolean);
            if (!routesList.includes(assignSelectedRoute)) {
              routesList.push(assignSelectedRoute);
            }
            newRouteValue = routesList.join(",");
          }
          return {
            ...a,
            route: newRouteValue
          };
        } else {
          if (currentRoute) {
            const routesList = currentRoute.split(",").map(r => r.trim()).filter(Boolean);
            if (routesList.includes(assignSelectedRoute)) {
              const updatedList = routesList.filter(r => r !== assignSelectedRoute);
              return {
                ...a,
                route: updatedList.join(",")
              };
            }
          }
          return a;
        }
      });
      setAgents(updatedAgents);

      alert("Agent assigned successfully!");

    } catch (err) {
      console.error("Error assigning agent to route:", err);
      alert("Failed to assign agent. Check console for details.");
    } finally {
      setIsAssigning(false);
    }
  };

  const addRoutePrompt = async () => {
    const name = prompt("Enter new Route name:");
    if (!name) return;

    try {
      await axios.post(`${ADMIN_PATH}/routes/add`, { name });
      setRoutes((prev) => {
        const hasRoute = prev.some(r => (typeof r === "string" ? r : r.name) === name);
        if (hasRoute) return prev;
        return [...prev, { name, description: "", priorityId: null, priority: null, priorityCode: "C" }];
      });
      alert("Route Added");
    } catch (error) {
      alert(error.response?.data?.message || "Failed to add route");
    }
  };

  const saveRouteName = async (oldName) => {
    if (isSavingRoute) return;

    const newName = editRouteValue.trim();
    if (!newName || newName === oldName) {
      setEditingRoute(null);
      return;
    }

    setIsSavingRoute(true);
    try {
      await axios.put(`${ADMIN_PATH}/routes/update`, { oldName, newName });

      setRoutes((prev) => {
        return prev.map(r => {
          if (typeof r === "string") {
            return r === oldName ? newName : r;
          }
          return r.name === oldName ? { ...r, name: newName } : r;
        }).sort((a, b) => {
          const nameA = typeof a === "string" ? a : a.name;
          const nameB = typeof b === "string" ? b : b.name;
          const pA = typeof a === "string" ? "C" : a.priority || "C";
          const pB = typeof b === "string" ? "C" : b.priority || "C";
          if (pA !== pB) return pA.localeCompare(pB);
          return nameA.localeCompare(nameB);
        });
      });

      setCustomers(prev => prev.map(c => c.route === oldName ? { ...c, route: newName } : c));

      setAgents(prev => prev.map(a => {
        if (!a.route) return a;
        const routesList = a.route.split(",").map(r => r.trim());
        if (routesList.includes(oldName)) {
          return {
            ...a,
            route: routesList.map(r => r === oldName ? newName : r).join(",")
          };
        }
        return a;
      }));

      setEditingRoute(null);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to update route");
    } finally {
      setIsSavingRoute(false);
    }
  };

  const handlePriorityChange = async (routeName, newPriorityId) => {
    try {
      await axios.put(`${ADMIN_PATH}/routes/update`, {
        oldName: routeName,
        newName: routeName,
        priorityId: newPriorityId,
      });

      setRoutes((prev) => {
        return prev.map(r => {
          const rName = typeof r === "string" ? r : r.name;
          if (rName !== routeName) return r;
          // Find the priority object from availablePriorities
          const newPriority = availablePriorities.find(p => p.id === newPriorityId) || null;
          return typeof r === "string"
            ? { name: r, priorityId: newPriorityId, priority: newPriority, priorityCode: newPriority?.code || "C" }
            : { ...r, priorityId: newPriorityId, priority: newPriority, priorityCode: newPriority?.code || "C" };
        }).sort((a, b) => {
          const orderA = (typeof a === "string" ? null : a.priority)?.order || 99;
          const orderB = (typeof b === "string" ? null : b.priority)?.order || 99;
          if (orderA !== orderB) return orderA - orderB;
          const nameA = typeof a === "string" ? a : a.name;
          const nameB = typeof b === "string" ? b : b.name;
          return nameA.localeCompare(nameB);
        });
      });
      invalidateClientUserInfoCache();
    } catch (error) {
      console.error("Error updating priority:", error);
      alert(error.response?.data?.message || "Failed to update priority");
    }
  };

  const renderEfficiencyDiff = (current, previous, asPill = false) => {
    if (current === 0) {
      if (asPill) {
        return (
          <span className="text-[11px] font-semibold text-gray-500 bg-gray-50 border border-gray-200/60 rounded-full px-2 py-0.5 inline-flex items-center gap-0.5 mt-1.5 whitespace-nowrap">
            <span>─</span> <span>0.00</span>
          </span>
        );
      }
      return <span className="text-sm font-bold text-gray-400 ml-2 inline-flex items-center gap-1 whitespace-nowrap">▬ 0.00</span>;
    }
    if (previous === 0 && current === 0) return null;
    
    const diff = (current - previous).toFixed(2);
    const numDiff = parseFloat(diff);
    if (numDiff > 0) {
      if (asPill) {
        return (
          <span className="text-[13px] font-bold text-green-500 mt-1 block whitespace-nowrap">
            <span>▲</span> <span>{diff}</span>
          </span>
        );
      }
      return <span className="text-sm font-bold text-green-500 ml-2 inline-flex items-center gap-1 whitespace-nowrap"><span>▲</span> <span>{diff}</span></span>;
    } else if (numDiff < 0) {
      const absDiff = Math.abs(numDiff).toFixed(2);
      if (asPill) {
        return (
          <span className="text-[13px] font-bold text-red-500 mt-1 block whitespace-nowrap">
            <span>▼</span> <span>{absDiff}</span>
          </span>
        );
      }
      return <span className="text-sm font-bold text-red-500 ml-2 inline-flex items-center gap-1 whitespace-nowrap"><span>▼</span> <span>{absDiff}</span></span>;
    }
    if (asPill) {
      return (
        <span className="text-[13px] font-bold text-gray-400 mt-1 block whitespace-nowrap">
          <span>▬</span> <span>{diff}</span>
        </span>
      );
    }
    return <span className="text-sm font-bold text-gray-400 ml-2 inline-flex items-center gap-1 whitespace-nowrap"><span>▬</span> <span>{diff}</span></span>;
  };

  const renderCountDiff = (current, previous, asPill = false) => {
    if (current === 0 && previous === 0) return null;
    const diff = current - previous;
    if (diff === 0) {
      if (asPill) {
        return (
          <span className="text-[13px] font-bold text-gray-400 mt-1 block whitespace-nowrap">
            <span>▬</span> <span>0</span>
          </span>
        );
      }
      return <span className="text-sm font-bold text-gray-400 ml-2 inline-flex items-center gap-1 whitespace-nowrap"><span>▬</span> <span>0</span></span>;
    } else if (diff > 0) {
      if (asPill) {
        return (
          <span className="text-[13px] font-bold text-green-500 mt-1 block whitespace-nowrap">
            <span>▲</span> <span>{diff}</span>
          </span>
        );
      }
      return <span className="text-sm font-bold text-green-500 ml-2 inline-flex items-center gap-1 whitespace-nowrap"><span>▲</span> <span>{diff}</span></span>;
    } else {
      const absDiff = Math.abs(diff);
      if (asPill) {
        return (
          <span className="text-[13px] font-bold text-red-500 mt-1 block whitespace-nowrap">
            <span>▼</span> <span>{absDiff}</span>
          </span>
        );
      }
      return <span className="text-sm font-bold text-red-500 ml-2 inline-flex items-center gap-1 whitespace-nowrap"><span>▼</span> <span>{absDiff}</span></span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 w-full font-sans">
      {/* HEADER & STATS */}
      <div className="mb-8 flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Route Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Organize delivery routes and assign agents to ensure efficient coverage and no overlaps.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={addRoutePrompt}
            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-sm transition-colors h-fit"
          >
            + Add Route
          </button>
          <div className="bg-white p-4 rounded-xl shadow border-l-4 border-green-500">
            <p className="text-sm text-gray-600">Total Active</p>
            <p className="text-2xl font-bold text-green-600">
              {loading ? "…" : totalActiveCustomers}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Customers</p>
              <div className="flex items-end">
                <p className="text-3xl font-bold text-gray-800">{totalCustomersAssigned}</p>
                {renderCountDiff(totalCustomersAssigned, totalYesterdayCustomers)}
              </div>
              <p className="text-xs text-blue-500 mt-1">Across All Routes</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600 text-2xl">
              <FiUsers />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Active Customers</p>
              <div className="flex items-end">
                <p className="text-3xl font-bold text-gray-800">{totalActiveCustomers}</p>
                {renderCountDiff(totalActiveCustomers, totalYesterdayActive)}
              </div>
              <p className="text-xs text-green-500 mt-1">Ready for Delivery</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-green-600 text-2xl">
              <FiTarget />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Potential Achieved</p>
              <div className="flex items-end">
                <p className="text-3xl font-bold text-gray-800">{totalAchievedPotential}</p>
                {totalAchievedPotential > 0 && renderCountDiff(totalAchievedPotential, totalYesterdayAchieved)}
              </div>
              <p className="text-xs text-purple-500 mt-1">Across All Routes</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg text-purple-600 text-2xl">
              <FiTrendingUp />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Route Efficiency</p>
              <div className="flex items-end">
                <p className="text-3xl font-bold text-gray-800">
                  {totalCustomersAssigned > 0 ? (totalAchievedPotential / totalCustomersAssigned).toFixed(2) : 0}
                </p>
                {renderEfficiencyDiff(
                  totalCustomersAssigned > 0 ? (totalAchievedPotential / totalCustomersAssigned) : 0,
                  totalYesterdayCustomers > 0 ? (totalYesterdayAchieved / totalYesterdayCustomers) : 0
                )}
              </div>
              <p className="text-xs text-orange-500 mt-1">Achieved / Total Customers</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg text-orange-600 text-2xl">
              <FiTrendingUp />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col xl:flex-row gap-5 items-start w-full">
        {/* LEFT PANEL - ALL ROUTES (EXPANDED TO FULL AVAILABLE WIDTH) */}
        <div className="flex-1 min-w-0 w-full bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3">
            <h2 className="text-lg font-bold text-gray-800">All Routes</h2>
            <div className="flex items-center gap-2">
              <label htmlFor="sort-routes" className="text-xs font-semibold text-gray-500 whitespace-nowrap">
                Sort By:
              </label>
              <select
                id="sort-routes"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-xs font-semibold text-gray-700 shadow-2xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="routeName">Route Name</option>
                <option value="priority">Priority</option>
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 p-2 sm:p-3">
            <div className="w-full">
              {/* Header */}
              <div className="flex items-center px-3 py-2 mb-2 text-[11px] font-bold text-gray-500 sticky top-0 z-10 bg-gray-50 border-l-4 border-transparent">
                <div style={{ width: "90px", flexShrink: 0 }} className="pr-2">Priority</div>
                <div className="flex-1 min-w-0 pr-2">Route Name</div>
                <div className="w-14 sm:w-16 text-center flex-shrink-0 leading-tight">
                  <div>Total</div>
                  <div className="text-[10px] font-semibold text-gray-400">Customers</div>
                </div>
                <div className="w-14 sm:w-16 text-center flex-shrink-0 leading-tight">
                  <div>Active</div>
                  <div className="text-[10px] font-semibold text-gray-400">Customers</div>
                </div>
                <div className="w-14 sm:w-16 text-center flex-shrink-0 leading-tight">
                  <div>Best</div>
                  <div className="text-[10px] font-semibold text-gray-400">Potential</div>
                </div>
                <div className="w-14 sm:w-16 text-center flex-shrink-0 leading-tight">
                  <div>Potential</div>
                  <div className="text-[10px] font-semibold text-gray-400">Achieved</div>
                </div>
                <div className="w-14 sm:w-16 text-center flex-shrink-0 leading-tight">
                  <div>Route</div>
                  <div className="text-[10px] font-semibold text-gray-400">Efficiency</div>
                </div>
                <div style={{ width: "115px", flexShrink: 0 }} className="pl-2">Assigned Agent</div>
              </div>

              {/* Rows */}
              <div className="flex flex-col gap-2">
                {loading ? (
                  <div className="text-center py-10 text-gray-500 text-xs">Loading...</div>
                ) : routeData.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 text-xs">No routes found.</div>
                ) : (
                  routeData.map((route, i) => {
                    const colors = [
                      { border: "border-l-blue-500", text: "text-blue-600" },
                      { border: "border-l-green-500", text: "text-green-600" },
                      { border: "border-l-orange-500", text: "text-orange-600" },
                      { border: "border-l-purple-500", text: "text-purple-600" },
                      { border: "border-l-teal-500", text: "text-teal-600" },
                      { border: "border-l-pink-500", text: "text-pink-600" },
                    ];
                    const color = colors[i % colors.length];

                    return (
                      <div key={route.name} className={`flex items-center bg-white shadow-xs border border-gray-100 border-l-4 ${color.border} rounded-xl px-3 py-2.5 hover:shadow-md transition-all`}>
                        {/* Column 1: Priority */}
                        <div style={{ width: "90px", flexShrink: 0 }} className="pr-2 flex items-center">
                          <select
                            value={route.priorityId || ""}
                            onChange={(e) => handlePriorityChange(route.name, e.target.value)}
                            className="w-full border border-gray-200 rounded-md px-1.5 py-1 bg-white font-bold cursor-pointer outline-none focus:ring-1 focus:ring-blue-500 text-[11px] shadow-2xs transition-colors"
                            style={{ color: route.priority?.color || "#6b7280" }}
                          >
                            <option value="">None</option>
                            {availablePriorities.filter(p => p.active !== false).map(p => (
                              <option key={p.id} value={p.id} style={{ color: p.color }}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Column 2: Route Name */}
                        <div className="flex-1 min-w-0 pr-2">
                          {editingRoute === route.name ? (
                            <div className="flex flex-col gap-1 pr-1">
                              <input
                                type="text"
                                value={editRouteValue}
                                onChange={(e) => setEditRouteValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveRouteName(route.name);
                                  else if (e.key === 'Escape' && !isSavingRoute) setEditingRoute(null);
                                }}
                                className={`border rounded px-2 py-1 text-xs outline-none font-bold ${color.text} w-full ${isSavingRoute ? 'opacity-50 cursor-not-allowed' : ''}`}
                                autoFocus
                                disabled={isSavingRoute}
                              />
                              <div className="flex gap-2 text-xs">
                                <button onClick={() => saveRouteName(route.name)} disabled={isSavingRoute} className={`text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded ${isSavingRoute ? 'opacity-50 cursor-not-allowed' : 'hover:text-green-800'}`}>
                                  {isSavingRoute ? 'Saving...' : 'Save'}
                                </button>
                                <button onClick={() => setEditingRoute(null)} disabled={isSavingRoute} className={`text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded ${isSavingRoute ? 'opacity-50 cursor-not-allowed' : 'hover:text-gray-700'}`}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start gap-1">
                                <p className={`font-bold text-xs sm:text-[13px] leading-snug break-words ${color.text}`} title={route.name}>{route.name}</p>
                                <button onClick={() => { setEditingRoute(route.name); setEditRouteValue(route.name); }} className="flex-shrink-0 text-gray-400 hover:text-blue-500 transition-colors mt-0.5" title="Rename route">
                                  <FiEdit2 size={11} />
                                </button>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-400 font-medium">
                                <span>Route {i + 1}</span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Stat Columns */}
                        <div className="w-14 sm:w-16 text-center flex-shrink-0 flex flex-col justify-center items-center text-xs font-semibold text-gray-800">
                          <span>{route.totalCustomers}</span>
                          {renderCountDiff(route.totalCustomers, route.yesterdayTotalCustomers, true)}
                        </div>
                        <div className="w-14 sm:w-16 text-center flex-shrink-0 flex flex-col justify-center items-center text-xs font-bold text-green-600">
                          <span>{route.activeCustomers}</span>
                          {renderCountDiff(route.activeCustomers, route.yesterdayActiveCustomers, true)}
                        </div>
                        <div className="w-14 sm:w-16 text-center flex-shrink-0 flex flex-col justify-center items-center text-xs font-bold text-orange-500">
                          <span>{route.bestPotential > 0 ? `T(${route.bestPotential})` : '-'}</span>
                        </div>
                        <div className="w-14 sm:w-16 text-center flex-shrink-0 flex flex-col justify-center items-center text-xs font-bold text-purple-600">
                          <span>{route.potentialAchieved > 0 ? route.potentialAchieved : '-'}</span>
                          {route.potentialAchieved > 0 && renderCountDiff(route.potentialAchieved, route.yesterdayPotentialAchieved, true)}
                        </div>
                        <div className="w-14 sm:w-16 text-center flex-shrink-0 flex flex-col justify-center items-center text-xs font-bold text-teal-600">
                          <span>{route.totalCustomers > 0 ? (route.potentialAchieved / route.totalCustomers).toFixed(2) : '-'}</span>
                          {renderEfficiencyDiff(
                            route.totalCustomers > 0 ? (route.potentialAchieved / route.totalCustomers) : 0,
                            route.yesterdayTotalCustomers > 0 ? (route.yesterdayPotentialAchieved / route.yesterdayTotalCustomers) : 0,
                            true
                          )}
                        </div>

                        {/* Assigned Agent Column */}
                        <div style={{ width: "115px", flexShrink: 0 }} className="pl-2 flex items-center min-w-0">
                          {route.assignedAgent === "Unassigned" ? (
                            <span className="text-red-500 font-semibold text-[11px]">Unassigned</span>
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-[9px] flex-shrink-0">
                                {getInitials(route.assignedAgentName)}
                              </div>
                              <span className="text-gray-700 text-[11px] font-medium truncate" title={route.assignedAgentName}>{route.assignedAgentName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-sm font-medium text-gray-700 rounded-b-xl mt-auto">
            <div className="flex flex-col items-center flex-1">
              <span className="text-gray-500 text-xs">Total Routes</span>
              <span className="text-base font-bold text-gray-800">{routeData.length}</span>
            </div>
            <div className="flex flex-col items-center flex-1 border-l border-gray-300">
              <span className="text-gray-500 text-xs">Total Customers</span>
              <span className="text-base font-bold text-gray-800">{routeData.reduce((sum, r) => sum + r.totalCustomers, 0)}</span>
            </div>
            <div className="flex flex-col items-center flex-1 border-l border-gray-300 text-blue-600">
              <span className="text-gray-500 text-xs text-blue-600/70">Assigned Agents</span>
              <span className="text-base font-bold">{routeData.filter(r => r.assignedAgent !== "Unassigned").length}/{routeData.length}</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - ASSIGN AGENT PANEL (COMPACT 275px) */}
        <div className="w-full xl:w-[275px] flex-shrink-0 flex flex-col gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 flex flex-col">
            <h2 className="text-base font-bold text-gray-800 mb-4">Assign Agent to Route</h2>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Select Route</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={assignSelectedRoute}
                onChange={(e) => setAssignSelectedRoute(e.target.value)}
              >
                <option value="">Choose a route</option>
                {routes.map(r => {
                  const routeName = typeof r === "string" ? r : r.name;
                  return (
                    <option key={routeName} value={routeName}>{routeName}</option>
                  );
                })}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Select Agent</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={assignSelectedAgent}
                onChange={(e) => setAssignSelectedAgent(e.target.value)}
              >
                <option value="">Choose an agent</option>
                {agentStats.filter(a => a.isActive).map(a => (
                  <option key={a.id} value={a.id}>{a.name || a.display_name}</option>
                ))}
              </select>
            </div>

            <div className="border border-gray-100 rounded-lg p-2 mb-4 max-h-[380px] overflow-y-auto">
              <p className="text-xs font-bold text-gray-700 mb-2 px-1">Agents with Customers ({agentStats.filter(a => a.customersAssigned > 0).length})</p>
              <div className="flex flex-col gap-1.5">
                {agentStats.filter(a => a.customersAssigned > 0).map((agent, i) => {
                  const isSelected = assignSelectedAgent === agent.id;
                  const colors = [
                    "bg-teal-100 text-teal-700", "bg-orange-100 text-orange-700",
                    "bg-red-100 text-red-700", "bg-purple-100 text-purple-700",
                    "bg-blue-100 text-blue-700", "bg-pink-100 text-pink-700"
                  ];
                  const colorClass = colors[i % colors.length];

                  return (
                    <div
                      key={agent.id}
                      onClick={() => setAssignSelectedAgent(agent.id)}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${colorClass}`}>
                          {getInitials(agent.name || agent.display_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{agent.name || agent.display_name}</p>
                          <p className="text-[10px] text-gray-400">{agent.customersAssigned} Customers</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-semibold border border-emerald-200 flex-shrink-0">
                        Available
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleAssignAgent}
              disabled={isAssigning || !assignSelectedRoute || !assignSelectedAgent}
              className={`w-full py-2.5 rounded-lg text-white font-bold text-xs shadow-sm transition-all ${
                isAssigning || !assignSelectedRoute || !assignSelectedAgent
                  ? "bg-blue-300 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 cursor-pointer"
              }`}
            >
              {isAssigning ? "Assigning..." : "Assign Agent"}
            </button>
          </div>

          {/* COMPACT ASSIGNED AGENTS CARDS */}
          <div className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col max-h-[800px]">
            <h2 className="text-base font-bold text-gray-800 mb-4">Assigned Deliverymen</h2>
            {agentStats.filter(a => a.customersAssigned > 0).length === 0 ? (
              <p className="text-sm text-gray-500">No deliverymen are currently assigned to any customers.</p>
            ) : (
              <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                {agentStats.filter(a => a.customersAssigned > 0).map((agent, i) => {
                  const colors = [
                    "bg-blue-50 border-blue-200 text-blue-800",
                    "bg-green-50 border-green-200 text-green-800",
                    "bg-orange-50 border-orange-200 text-orange-800",
                    "bg-purple-50 border-purple-200 text-purple-800",
                  ];
                  const colorClass = colors[i % colors.length];

                  return (
                    <div key={agent.id} className={`border rounded-xl p-3 flex flex-col gap-2 shadow-sm ${colorClass}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-xs shadow-sm">
                          {getInitials(agent.name || agent.display_name)}
                        </div>
                        <div className="overflow-hidden flex-1">
                          <h3 className="font-bold text-sm truncate">{agent.name || agent.display_name}</h3>
                          <p className="text-[10px] font-medium opacity-80 break-words whitespace-normal" title={agent.displayRoute}>
                            {agent.displayRoute}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 text-xs font-semibold">
                        <div className="flex-1 bg-white/70 px-2 py-1.5 rounded-lg flex justify-between items-center">
                          <span className="opacity-80">Total</span>
                          <span>{agent.customersAssigned}</span>
                        </div>
                        <div className="flex-1 bg-white/70 px-2 py-1.5 rounded-lg flex justify-between items-center">
                          <span className="opacity-80">Active</span>
                          <span className="text-green-700">{agent.activeCustomers}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
