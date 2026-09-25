import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FiUsers, FiMapPin, FiTarget, FiTrendingUp, FiEdit2, FiEye, FiChevronDown, FiChevronRight, FiLayers, FiRotateCcw } from "react-icons/fi";
import { ADMIN_PATH } from "../constant";
import { getCachedUserInfo, invalidateClientUserInfoCache } from "../utils/customerInfoClientCache";
import SubRouteOptimizationModal from "../components/SubRouteOptimizationModal";
import { computeSubRouteReassignments } from "../utils/subRouteOptimization";
import {
  getTodayEffectiveStatus,
  computeDeliveryGap,
  normalizeDeliveryGap,
  getDeliveryGapNumber,
  computeCurrentCategory,
  normalizePeakFrequency,
} from "../utils/dummyAiSuggestionEngine";

const extractParentRoute = (routeName) => {
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

export default function CustomerRoutes() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [agents, setAgents] = useState([]);
  const [availablePriorities, setAvailablePriorities] = useState([]);

  // Filtering and Selection
  const [sortBy, setSortBy] = useState("routeName");
  const [assignSelectedRoute, setAssignSelectedRoute] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isOptimizationModalOpen, setIsOptimizationModalOpen] = useState(false);
  const [selectedResetAgent, setSelectedResetAgent] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // Parent route collapse state
  const [collapsedParents, setCollapsedParents] = useState({});
  const toggleParentCollapse = (parentKey) =>
    setCollapsedParents((prev) => ({ ...prev, [parentKey]: !prev[parentKey] }));
  const expandAll = () => setCollapsedParents({});
  const collapseAll = () => {
    const allCollapsed = {};
    groupedRoutes.forEach((g) => {
      allCollapsed[g.parentKey] = true;
    });
    setCollapsedParents(allCollapsed);
  };

  // Delivery Gap expandable state per route
  const [expandedRouteGaps, setExpandedRouteGaps] = useState({});
  const toggleRouteGaps = (routeName) =>
    setExpandedRouteGaps((prev) => ({ ...prev, [routeName]: !prev[routeName] }));

  // D0-D7 Category expandable state per route
  const [expandedRouteCategories, setExpandedRouteCategories] = useState({});
  const toggleRouteCategories = (routeName) =>
    setExpandedRouteCategories((prev) => ({ ...prev, [routeName]: !prev[routeName] }));

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

        const [routesRes, agentsRes, prioritiesRes] = await Promise.all([
          axios.get(`${ADMIN_PATH}/routes`),
          axios.get(`${ADMIN_PATH}/get-del-partner`),
          axios.get(`${ADMIN_PATH}/priorities`).catch(() => ({ data: [] })),
        ]);

        const fetchedRoutes = routesRes.data || [];
        const fetchedPriorities = (prioritiesRes.data || []).sort((a, b) => (a.order || 99) - (b.order || 99));
        setRoutes(fetchedRoutes);
        setAgents(agentsRes.data || []);
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
        potentialAchieved: 0,
        yesterdayTotalCustomers: 0,
        yesterdayPotentialAchieved: 0,
        yesterdayActiveCustomers: 0,
        agentsAssigned: {},
        assignedAgents: [],
        assignedAgent: "Unassigned",
        assignedAgentName: "Unassigned",
        categoryCounts: {
          D0: 0,
          D1: 0,
          D2: 0,
          D3: 0,
          D4: 0,
          D5: 0,
          D6: 0,
          D7: 0,
        },
        gapCounts: {
          G0: 0,
          G1: 0,
          G2: 0,
          G3: 0,
          G4: 0,
          G5: 0,
          G6: 0,
          G7: 0,
          G8: 0,
          G9: 0,
          G10: 0,
          "G10+": 0,
          "G15+": 0,
          "G20+": 0,
          "G30+": 0,
        }
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
    todayStart.setHours(0, 0, 0, 0);

    // Process customers
    customers.forEach(customer => {
      const route = customer.route;
      if (route && routeMap[route]) {
        routeMap[route].totalCustomers += 1;

        // Track D0-D7 Category Counts
        const rawCategory = computeCurrentCategory(customer.last8Days);
        const categoryStr = normalizePeakFrequency(rawCategory);
        if (routeMap[route].categoryCounts[categoryStr] !== undefined) {
          routeMap[route].categoryCounts[categoryStr] += 1;
        } else {
          routeMap[route].categoryCounts.D0 += 1;
        }

        // Track Delivery Gap Counts
        const rawGap = computeDeliveryGap(customer.last8Days, todayDate, customer);
        const gapStr = normalizeDeliveryGap(rawGap);
        const gapNum = getDeliveryGapNumber(gapStr);

        if (gapNum === 0) routeMap[route].gapCounts.G0 += 1;
        if (gapNum === 1) routeMap[route].gapCounts.G1 += 1;
        if (gapNum === 2) routeMap[route].gapCounts.G2 += 1;
        if (gapNum === 3) routeMap[route].gapCounts.G3 += 1;
        if (gapNum === 4) routeMap[route].gapCounts.G4 += 1;
        if (gapNum === 5) routeMap[route].gapCounts.G5 += 1;
        if (gapNum === 6) routeMap[route].gapCounts.G6 += 1;
        if (gapNum === 7) routeMap[route].gapCounts.G7 += 1;
        if (gapNum === 8) routeMap[route].gapCounts.G8 += 1;
        if (gapNum === 9) routeMap[route].gapCounts.G9 += 1;
        if (gapNum === 10) routeMap[route].gapCounts.G10 += 1;
        if (gapNum >= 10) routeMap[route].gapCounts["G10+"] += 1;
        if (gapNum >= 15) routeMap[route].gapCounts["G15+"] += 1;
        if (gapNum >= 20) routeMap[route].gapCounts["G20+"] += 1;
        if (gapNum >= 30) routeMap[route].gapCounts["G30+"] += 1;

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

    // Finalize route details (supports multiple agents per sub-route)
    const finalizedRoutes = Object.values(routeMap).map(routeInfo => {
      const rName = routeInfo.name;
      const assignedAgentsMap = new Map();

      // 1. From agents list where agent is ACTIVE and agent.route includes rName (comma separated)
      agents.forEach(agent => {
        const isAgentActive = agent.active === true || agent.active === "true";
        if (isAgentActive && agent.route) {
          const list = agent.route.split(",").map(r => r.trim()).filter(Boolean);
          if (list.includes(rName)) {
            const agentId = agent.id || agent.uid;
            assignedAgentsMap.set(agentId, {
              id: agentId,
              name: agent.name || agent.display_name || "Agent",
              phone: agent.phone || "",
              active: true,
              customerCount: routeInfo.agentsAssigned[agentId] || 0,
            });
          }
        }
      });

      // 2. Also from customer.assignedDeliverymen (only if agent is active)
      Object.keys(routeInfo.agentsAssigned).forEach(agentId => {
        if (agentId && !assignedAgentsMap.has(agentId)) {
          const foundAgent = agents.find(a => (a.id === agentId || a.uid === agentId || a.name === agentId));
          const isAgentActive = foundAgent ? (foundAgent.active === true || foundAgent.active === "true") : false;
          if (isAgentActive) {
            assignedAgentsMap.set(agentId, {
              id: agentId,
              name: foundAgent ? (foundAgent.name || foundAgent.display_name) : agentId,
              phone: foundAgent ? (foundAgent.phone || "") : "",
              active: true,
              customerCount: routeInfo.agentsAssigned[agentId] || 0,
            });
          }
        }
      });

      const assignedAgentsList = Array.from(assignedAgentsMap.values());
      routeInfo.assignedAgents = assignedAgentsList;

      if (assignedAgentsList.length === 0) {
        routeInfo.assignedAgent = "Unassigned";
        routeInfo.assignedAgentName = "Unassigned";
      } else if (assignedAgentsList.length === 1) {
        routeInfo.assignedAgent = assignedAgentsList[0].id;
        routeInfo.assignedAgentName = assignedAgentsList[0].name;
      } else {
        routeInfo.assignedAgent = assignedAgentsList.map(a => a.id).join(",");
        routeInfo.assignedAgentName = assignedAgentsList.map(a => a.name).join(", ");
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
  }, [routes, customers, agents, availablePriorities, sortBy]);

  // Group routes into Parent Routes with aggregated statistics
  const groupedRoutes = useMemo(() => {
    const groups = {};

    routeData.forEach((route) => {
      const parentKey = extractParentRoute(route.name);
      if (!groups[parentKey]) {
        groups[parentKey] = {
          parentKey,
          routes: [],
          totalCustomers: 0,
          activeCustomers: 0,
          potentialAchieved: 0,
          yesterdayTotalCustomers: 0,
          yesterdayPotentialAchieved: 0,
          yesterdayActiveCustomers: 0,
          assignedAgentsMap: {},
          uniqueAgentsSet: new Map(),
          highestPriority: null,
        };
      }
      const group = groups[parentKey];
      group.routes.push(route);
      group.totalCustomers += route.totalCustomers;
      group.activeCustomers += route.activeCustomers;
      group.potentialAchieved += (route.potentialAchieved || 0);
      group.yesterdayTotalCustomers += (route.yesterdayTotalCustomers || 0);
      group.yesterdayPotentialAchieved += (route.yesterdayPotentialAchieved || 0);
      group.yesterdayActiveCustomers += (route.yesterdayActiveCustomers || 0);

      (route.assignedAgents || []).forEach(ag => {
        group.assignedAgentsMap[ag.name] = (group.assignedAgentsMap[ag.name] || 0) + 1;
        group.uniqueAgentsSet.set(ag.id, ag);
      });

      const routeOrder = route.priority ? (route.priority.order || 99) : 99;
      const currentHighestOrder = group.highestPriority ? (group.highestPriority.order || 99) : 99;
      if (route.priority && routeOrder < currentHighestOrder) {
        group.highestPriority = route.priority;
      }
    });

    const groupList = Object.values(groups).map((group) => {
      // Sort sub-routes within group by priority order first, then by route name
      group.routes.sort((a, b) => {
        const orderA = a.priority && Number.isFinite(a.priority.order) ? a.priority.order : 999;
        const orderB = b.priority && Number.isFinite(b.priority.order) ? b.priority.order : 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      });

      // Analyze agents in this group
      const uniqueAgents = Array.from(group.uniqueAgentsSet.values());
      group.assignedAgents = uniqueAgents;
      if (uniqueAgents.length === 0) {
        group.agentSummary = "Unassigned";
        group.agentSummaryType = "none";
        group.agentNames = [];
      } else if (uniqueAgents.length === 1) {
        group.agentSummary = uniqueAgents[0].name;
        group.agentSummaryType = "single";
        group.agentNames = [uniqueAgents[0].name];
      } else {
        group.agentSummary = `${uniqueAgents.length} Agents`;
        group.agentSummaryType = "multiple";
        group.agentNames = uniqueAgents.map(a => a.name);
      }

      return group;
    });

    return groupList.sort((a, b) => {
      if (sortBy === "priority") {
        const orderA = a.highestPriority ? (a.highestPriority.order || 99) : 99;
        const orderB = b.highestPriority ? (b.highestPriority.order || 99) : 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.parentKey.localeCompare(b.parentKey, undefined, { numeric: true, sensitivity: "base" });
      } else {
        const nameComparison = a.parentKey.localeCompare(b.parentKey, undefined, { numeric: true, sensitivity: "base" });
        if (nameComparison !== 0) return nameComparison;
        const orderA = a.highestPriority ? (a.highestPriority.order || 99) : 99;
        const orderB = b.highestPriority ? (b.highestPriority.order || 99) : 99;
        return orderA - orderB;
      }
    });
  }, [routeData, sortBy]);

  // Compute Agent stats for Right Sidebar (ONLY ACTIVE AGENTS)
  const agentStats = useMemo(() => {
    return agents
      .filter(agent => agent.active === true || agent.active === "true")
      .map(agent => {
        const assigned = customers.filter(c =>
          c.assignedDeliverymen === agent.id ||
          c.assignedDeliverymen === agent.name ||
          c.assignedDeliverymen === agent.uid
        );
        const customersAssigned = assigned.length;
        const activeCustomers = assigned.filter(c => getTodayEffectiveStatus(c) === "ON").length;

        // Routes can come from assigned customers OR direct agent.route assignments
        const routesFromCustomers = assigned.map(c => c.route).filter(Boolean);
        const routesFromDoc = agent.route ? agent.route.split(",").map(r => r.trim()).filter(Boolean) : [];
        const computedRoutes = [...new Set([...routesFromCustomers, ...routesFromDoc])].join(", ");

        return {
          ...agent,
          customersAssigned,
          activeCustomers,
          isActive: true,
          displayRoute: computedRoutes || "No routes"
        };
      });
  }, [agents, customers]);


  // Compute pending sub-route optimizations based on D-category and Delivery Gap
  const optimizationData = useMemo(() => {
    if (!customers || customers.length === 0 || !routes || routes.length === 0) {
      return { stats: {}, pendingChanges: [], allAnalyses: [] };
    }
    const todayDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    return computeSubRouteReassignments(customers, routes, todayDate);
  }, [customers, routes]);

  const handleOptimizationSuccess = (appliedChanges) => {
    const changeMap = new Map();
    appliedChanges.forEach((item) => {
      changeMap.set(item.customerId, item.targetRoute);
    });

    setCustomers((prev) =>
      prev.map((c) => {
        if (changeMap.has(c.id)) {
          return {
            ...c,
            route: changeMap.get(c.id),
          };
        }
        return c;
      })
    );

    alert(`Successfully updated sub-routes for ${appliedChanges.length} customer(s)!`);
  };

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

  const handleUnassignAgentFromRoute = async (agentId, routeNameOrParent) => {
    if (!agentId || !routeNameOrParent) return;

    let targetRouteNames = [];
    if (routeNameOrParent.startsWith("PARENT:")) {
      const parentKey = routeNameOrParent.replace("PARENT:", "");
      const group = groupedRoutes.find((g) => g.parentKey === parentKey);
      if (group) {
        targetRouteNames = group.routes.map((r) => r.name);
      }
    } else {
      targetRouteNames = [routeNameOrParent];
    }

    if (targetRouteNames.length === 0) return;

    const agentObj = agents.find((a) => a.id === agentId || a.uid === agentId || a.name === agentId);
    const agentName = agentObj ? (agentObj.name || agentObj.display_name) : "Agent";
    const agentUid = agentObj?.uid || agentObj?.id || agentId;

    if (!window.confirm(`Are you sure you want to unassign ${agentName} from ${targetRouteNames.join(", ")}?`)) {
      return;
    }

    try {
      for (const rName of targetRouteNames) {
        await axios.put(`${ADMIN_PATH}/delivery/unassign-route`, {
          uid: agentUid,
          route: rName,
        });
      }

      // Update agents state locally
      setAgents((prev) =>
        prev.map((a) => {
          if (a.id === agentId || a.uid === agentId || a.name === agentName || a.id === agentUid) {
            const currentRoute = a.route || "";
            const list = currentRoute.split(",").map((r) => r.trim()).filter(Boolean);
            const updated = list.filter((r) => !targetRouteNames.includes(r));
            return { ...a, route: updated.join(",") };
          }
          return a;
        })
      );

      // Also clear local customer state so customer.assignedDeliverymen doesn't keep agent in routeData
      setCustomers((prev) =>
        prev.map((c) => {
          if (
            targetRouteNames.includes(c.route) &&
            (c.assignedDeliverymen === agentId ||
              c.assignedDeliverymen === agentName ||
              c.assignedDeliverymen === agentUid ||
              c.deliveredBy === agentId ||
              c.deliveredBy === agentName ||
              c.deliveredBy === agentUid)
          ) {
            return {
              ...c,
              assignedDeliverymen: "",
              deliveredBy: "",
            };
          }
          return c;
        })
      );

      // Invalidate cache
      invalidateClientUserInfoCache();
    } catch (err) {
      console.error("Error unassigning agent from route:", err);
      alert("Failed to unassign agent. Check console for details.");
    }
  };

  const handleResetRoutes = async (targetAgentId) => {
    if (!targetAgentId) return;

    const isAll = targetAgentId === "ALL";
    const targetAgent = agents.find((a) => a.id === targetAgentId || a.uid === targetAgentId || a.name === targetAgentId);
    const agentName = isAll ? "All Agents" : (targetAgent?.name || targetAgent?.display_name || "this agent");

    const confirmMsg = isAll
      ? "⚠️ Are you sure you want to RESET ALL ROUTES for ALL delivery agents? All route assignments will be cleared."
      : `⚠️ Are you sure you want to reset and clear all assigned routes for ${agentName}?`;

    if (!window.confirm(confirmMsg)) {
      setSelectedResetAgent("");
      return;
    }

    setIsResetting(true);
    try {
      await axios.post(`${ADMIN_PATH}/delivery/reset-routes`, {
        agentId: isAll ? "ALL" : (targetAgent?.uid || targetAgent?.id || targetAgentId),
      });

      // Update local agents state
      setAgents((prev) =>
        prev.map((a) => {
          if (isAll || a.id === targetAgentId || a.uid === targetAgentId || a.name === targetAgent?.name) {
            return { ...a, route: "" };
          }
          return a;
        })
      );

      // Update local customers state
      setCustomers((prev) =>
        prev.map((c) => {
          if (
            isAll ||
            c.assignedDeliverymen === targetAgentId ||
            c.assignedDeliverymen === targetAgent?.name ||
            c.assignedDeliverymen === targetAgent?.uid ||
            c.deliveredBy === targetAgentId ||
            c.deliveredBy === targetAgent?.name ||
            c.deliveredBy === targetAgent?.uid
          ) {
            return {
              ...c,
              assignedDeliverymen: "",
              deliveredBy: "",
            };
          }
          return c;
        })
      );

      invalidateClientUserInfoCache();
      alert(isAll ? "Successfully reset routes for all agents!" : `Successfully reset routes for ${agentName}!`);
    } catch (err) {
      console.error("Error resetting routes:", err);
      alert("Failed to reset routes. Check console for details.");
    } finally {
      setIsResetting(false);
      setSelectedResetAgent("");
    }
  };

  const handleSelectRoute = (routeVal) => {
    setAssignSelectedRoute(routeVal);
    setSelectedAgentIds([]); // Clean state: do not auto-select any agent
  };

  const toggleAgentSelection = (agentId) => {
    setSelectedAgentIds((prev) => {
      if (prev.includes(agentId)) {
        return prev.filter((id) => id !== agentId);
      } else {
        return [...prev, agentId];
      }
    });
  };

  const handleAssignAgent = async () => {
    if (!assignSelectedRoute) {
      alert("Please select a route first.");
      return;
    }

    let targetRouteNames = [];
    const isParentAssign = assignSelectedRoute.startsWith("PARENT:");
    if (isParentAssign) {
      const parentKey = assignSelectedRoute.replace("PARENT:", "");
      const group = groupedRoutes.find((g) => g.parentKey === parentKey);
      if (group) {
        targetRouteNames = group.routes.map((r) => r.name);
      }
    } else {
      targetRouteNames = [assignSelectedRoute];
    }

    if (targetRouteNames.length === 0) {
      alert("No routes found to assign.");
      return;
    }

    setIsAssigning(true);

    try {
      await axios.put(`${ADMIN_PATH}/delivery/set-route-agents`, {
        routes: targetRouteNames,
        agentIds: selectedAgentIds,
        assignToCustomers: true,
      });

      // Update local agents state:
      // Agents in selectedAgentIds have targetRouteNames added.
      // Agents not in selectedAgentIds have targetRouteNames removed.
      setAgents((prev) =>
        prev.map((a) => {
          const aId = a.id || a.uid;
          const isSelected =
            selectedAgentIds.includes(aId) ||
            (a.uid && selectedAgentIds.includes(a.uid)) ||
            (a.name && selectedAgentIds.includes(a.name));

          const currentRoute = a.route || "";
          let routesList = currentRoute ? currentRoute.split(",").map((r) => r.trim()).filter(Boolean) : [];

          if (isSelected) {
            targetRouteNames.forEach((rName) => {
              if (!routesList.includes(rName)) {
                routesList.push(rName);
              }
            });
          } else {
            routesList = routesList.filter((r) => !targetRouteNames.includes(r));
          }

          return {
            ...a,
            route: routesList.join(","),
          };
        })
      );

      // Update local customers state: distribute customers across selected agents
      let targetCustCount = 0;
      setCustomers((prev) =>
        prev.map((c) => {
          if (targetRouteNames.includes(c.route)) {
            if (selectedAgentIds.length === 0) {
              return { ...c, assignedDeliverymen: "", deliveredBy: "" };
            } else if (selectedAgentIds.length === 1) {
              const primary = selectedAgentIds[0];
              return { ...c, assignedDeliverymen: primary, deliveredBy: primary };
            } else {
              const assignedAgentId = selectedAgentIds[targetCustCount % selectedAgentIds.length];
              targetCustCount++;
              return { ...c, assignedDeliverymen: assignedAgentId, deliveredBy: assignedAgentId };
            }
          }
          return c;
        })
      );

      invalidateClientUserInfoCache();

      const routeLabel = isParentAssign
        ? `all ${targetRouteNames.length} sub-routes of ${assignSelectedRoute.replace("PARENT:", "")}`
        : targetRouteNames[0];

      alert(
        selectedAgentIds.length === 0
          ? `Cleared all agents from ${routeLabel}.`
          : `Successfully assigned ${selectedAgentIds.length} agent(s) to ${routeLabel}!`
      );
    } catch (err) {
      console.error("Error updating route agents:", err);
      alert(err.response?.data?.message || "Failed to update route assignments. Check console for details.");
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

  // Compute Overall Delivery Gap summary across all routes
  const _overallGapCounts = useMemo(() => {
    const counts = {
      G0: 0,
      G1: 0,
      G2: 0,
      G3: 0,
      G4: 0,
      G5: 0,
      G6: 0,
      G7: 0,
      "G7+": 0,
      "G10+": 0,
      "G15+": 0,
      "G20+": 0,
      "G30+": 0,
      total: 0
    };

    const todayDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    customers.forEach(customer => {
      if (!customer.route) return;
      counts.total += 1;
      const rawGap = computeDeliveryGap(customer.last8Days, todayDate, customer);
      const gapStr = normalizeDeliveryGap(rawGap);
      const gapNum = getDeliveryGapNumber(gapStr);

      if (gapNum === 0) counts.G0 += 1;
      if (gapNum === 1) counts.G1 += 1;
      if (gapNum === 2) counts.G2 += 1;
      if (gapNum === 3) counts.G3 += 1;
      if (gapNum === 4) counts.G4 += 1;
      if (gapNum === 5) counts.G5 += 1;
      if (gapNum === 6) counts.G6 += 1;
      if (gapNum === 7) counts.G7 += 1;
      if (gapNum >= 7) counts["G7+"] += 1;
      if (gapNum >= 10) counts["G10+"] += 1;
      if (gapNum >= 15) counts["G15+"] += 1;
      if (gapNum >= 20) counts["G20+"] += 1;
      if (gapNum >= 30) counts["G30+"] += 1;
    });

    return counts;
  }, [customers]);

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
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={addRoutePrompt}
            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-sm transition-colors h-fit cursor-pointer flex items-center gap-1.5"
          >
            <span>+ Add Route</span>
          </button>

          {/* RESET ROUTES BUTTON & AGENT SELECTOR */}
          <div className="relative flex items-center h-fit">
            <div className="flex items-center bg-white border border-red-200 hover:border-red-300 rounded-lg shadow-2xs overflow-hidden transition-all h-[41px]">
              <div className="px-3 flex items-center gap-1.5 text-red-600 font-bold text-xs pointer-events-none">
                <FiRotateCcw className={isResetting ? "animate-spin text-sm" : "text-sm"} />
                <span>Reset Routes</span>
              </div>
              <select
                disabled={isResetting}
                value={selectedResetAgent}
                onChange={(e) => handleResetRoutes(e.target.value)}
                className="bg-red-50 hover:bg-red-100/80 text-red-700 font-semibold text-xs px-2.5 py-2.5 border-l border-red-200 outline-none cursor-pointer transition-colors"
                title="Select an agent or All Agents to reset their assigned routes"
              >
                <option value="">{isResetting ? "Resetting..." : "Choose an agent"}</option>
                <option value="ALL" className="font-bold text-red-700">All Agents</option>
                {agents.filter(a => a.active === true || a.active === "true").map((a) => (
                  <option key={a.id} value={a.id} className="text-gray-800">
                    {a.name || a.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow border-l-4 border-green-500">
            <p className="text-sm text-gray-600">Total Active</p>
            <p className="text-2xl font-bold text-green-600">
              {loading ? "…" : totalActiveCustomers}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6">
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

      {/* MAIN CONTENT AREA */}
      <div className="flex flex-col xl:flex-row gap-5 items-start w-full">
        {/* LEFT PANEL - ALL ROUTES (EXPANDED TO FULL AVAILABLE WIDTH) */}
        <div className="flex-1 min-w-0 w-full bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-800">All Routes</h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {groupedRoutes.length} Groups • {routeData.length} Sub-routes
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsOptimizationModalOpen(true)}
                className="text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                title="Automatically reassign customers between sub-routes based on D-category and Delivery Gap"
              >
                <span>Auto-Sort Sub-Routes</span>
                {optimizationData.stats.totalChanges > 0 && (
                  <span className="ml-0.5 bg-amber-400 text-slate-900 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                    {optimizationData.stats.totalChanges}
                  </span>
                )}
              </button>
              <div className="h-4 w-[1px] bg-gray-300 mx-0.5 hidden sm:block"></div>
              <button
                type="button"
                onClick={expandAll}
                className="text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="text-[11px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 border border-gray-200 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
              >
                Collapse All
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-x-hidden bg-gray-50 p-2 sm:p-3">
            <div className="w-full">
              {/* Header */}
              <div className="flex items-center px-3 py-2 mb-2 text-[11px] font-bold text-gray-500 sticky top-0 z-10 bg-gray-50 border-l-4 border-transparent">
                <div style={{ width: "95px", flexShrink: 0 }} className="pr-2">Priority / Code</div>
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
                  <div>Potential</div>
                  <div className="text-[10px] font-semibold text-gray-400">Achieved</div>
                </div>
                <div className="w-14 sm:w-16 text-center flex-shrink-0 leading-tight">
                  <div>Route</div>
                  <div className="text-[10px] font-semibold text-gray-400">Efficiency</div>
                </div>
                <div style={{ width: "145px", flexShrink: 0 }} className="pl-2">Assigned Agent(s)</div>
              </div>

              {/* Grouped Rows */}
              <div className="flex flex-col gap-3">
                {loading ? (
                  <div className="text-center py-10 text-gray-500 text-xs">Loading...</div>
                ) : groupedRoutes.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 text-xs">No routes found.</div>
                ) : (
                  groupedRoutes.map((group, groupIdx) => {
                    const isParentCollapsed = !!collapsedParents[group.parentKey];
                    const borderColors = [
                      "border-l-blue-500",
                      "border-l-green-500",
                      "border-l-orange-500",
                      "border-l-purple-500",
                      "border-l-teal-500",
                      "border-l-pink-500",
                    ];
                    const bgAccents = [
                      "from-blue-50/60 via-white to-white",
                      "from-emerald-50/60 via-white to-white",
                      "from-amber-50/60 via-white to-white",
                      "from-purple-50/60 via-white to-white",
                      "from-teal-50/60 via-white to-white",
                      "from-pink-50/60 via-white to-white",
                    ];
                    const themeBorder = borderColors[groupIdx % borderColors.length];
                    const themeBg = bgAccents[groupIdx % bgAccents.length];

                    return (
                      <div
                        key={group.parentKey}
                        className="flex flex-col bg-white shadow-xs border border-gray-200 rounded-xl overflow-hidden transition-all hover:shadow-md"
                      >
                        {/* PARENT ROUTE HEADER ROW */}
                        <div
                          className={`flex items-center w-full px-4 py-3 bg-gradient-to-r ${themeBg} border-l-4 ${themeBorder} cursor-pointer hover:bg-gray-50/80 transition-colors select-none`}
                          onClick={() => toggleParentCollapse(group.parentKey)}
                        >
                          {/* Column 1: Parent Code & Collapse Chevron */}
                          <div style={{ width: "95px", flexShrink: 0 }} className="pr-3 flex items-center gap-1.5">
                            <span className="text-gray-500 hover:text-gray-800 transition-transform">
                              {isParentCollapsed ? <FiChevronRight size={16} /> : <FiChevronDown size={16} />}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-slate-800 text-white shadow-2xs">
                              {group.parentKey}
                            </span>
                          </div>

                          {/* Column 2: Parent Name, sub-route pills & quick assign button */}
                          <div className="flex-1 min-w-0 pr-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-bold text-xs sm:text-[14px] text-gray-900 tracking-tight">
                                Route {group.parentKey}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-full px-2 py-0.5 shadow-2xs">
                                {group.routes.length} sub-{group.routes.length === 1 ? "route" : "routes"}
                              </span>
                              <div className="hidden md:flex items-center gap-1 flex-wrap">
                                {group.routes.map(r => {
                                  const subNameClean = r.name.replace(group.parentKey, "").replace(/^[\s-]+/, "") || r.name;
                                  return (
                                    <span
                                      key={r.name}
                                      className="text-[10px] font-medium text-gray-600 bg-gray-100/90 border border-gray-200/60 rounded px-1.5 py-0.5 truncate max-w-[110px]"
                                      title={r.name}
                                    >
                                      {subNameClean}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectRoute(`PARENT:${group.parentKey}`);
                              }}
                              className={`flex-shrink-0 text-[10px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-1 rounded-md border transition-all flex items-center gap-1 cursor-pointer ${
                                assignSelectedRoute === `PARENT:${group.parentKey}`
                                  ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                                  : "bg-white text-blue-600 border-blue-200 hover:bg-blue-50"
                              }`}
                              title={`Assign delivery agent to all ${group.routes.length} sub-routes`}
                            >
                              <span>Assign All</span>
                            </button>
                          </div>

                          {/* Stat Columns (Aggregated across sub-routes) */}
                          <div className="w-14 sm:w-16 text-center flex-shrink-0 flex flex-col justify-center items-center text-xs font-bold text-gray-800">
                            <span>{group.totalCustomers}</span>
                            {renderCountDiff(group.totalCustomers, group.yesterdayTotalCustomers, true)}
                          </div>
                          <div className="w-14 sm:w-16 text-center flex-shrink-0 flex flex-col justify-center items-center text-xs font-bold text-green-600">
                            <span>{group.activeCustomers}</span>
                            {renderCountDiff(group.activeCustomers, group.yesterdayActiveCustomers, true)}
                          </div>
                          <div className="w-14 sm:w-16 text-center flex-shrink-0 flex flex-col justify-center items-center text-xs font-bold text-purple-600">
                            <span>{group.potentialAchieved > 0 ? group.potentialAchieved : '-'}</span>
                            {group.potentialAchieved > 0 && renderCountDiff(group.potentialAchieved, group.yesterdayPotentialAchieved, true)}
                          </div>
                          <div className="w-14 sm:w-16 text-center flex-shrink-0 flex flex-col justify-center items-center text-xs font-bold text-teal-600">
                            <span>{group.totalCustomers > 0 ? (group.potentialAchieved / group.totalCustomers).toFixed(2) : '-'}</span>
                            {renderEfficiencyDiff(
                              group.totalCustomers > 0 ? (group.potentialAchieved / group.totalCustomers) : 0,
                              group.yesterdayTotalCustomers > 0 ? (group.yesterdayPotentialAchieved / group.yesterdayTotalCustomers) : 0,
                              true
                            )}
                          </div>

                          {/* Assigned Agent Column */}
                          <div style={{ width: "145px", flexShrink: 0 }} className="pl-2 flex items-center min-w-0">
                            {group.agentSummaryType === "none" ? (
                              <span className="text-red-500 font-semibold text-[11px] bg-red-50 border border-red-200/60 rounded px-1.5 py-0.5">Unassigned</span>
                            ) : group.agentSummaryType === "single" ? (
                              <div className="flex items-center gap-1.5 min-w-0" title={group.agentSummary}>
                                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                                  {getInitials(group.agentSummary)}
                                </div>
                                <span className="text-[11px] font-medium text-gray-700 truncate">
                                  {group.agentSummary}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 min-w-0" title={group.agentNames.join(", ")}>
                                <span
                                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 truncate cursor-pointer hover:bg-blue-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectRoute(`PARENT:${group.parentKey}`);
                                  }}
                                >
                                  {group.agentSummary}
                                </span>
                                <div className="flex -space-x-1.5 overflow-hidden flex-shrink-0">
                                  {group.assignedAgents.slice(0, 3).map((a) => (
                                    <div
                                      key={a.id}
                                      className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[8px] border border-white"
                                      title={a.name}
                                    >
                                      {getInitials(a.name)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* EXPANDED SUB-ROUTES LIST */}
                        {!isParentCollapsed && (
                          <div className="bg-slate-50/70 p-2 sm:p-3 flex flex-col gap-2 border-t border-gray-100">
                            {group.routes.map((route, subIdx) => {
                              const isExpanded = !!expandedRouteGaps[route.name];
                              const isCatExpanded = !!expandedRouteCategories[route.name];
                              const routeAgents = route.assignedAgents || [];

                              return (
                                <div
                                  key={route.name}
                                  className="flex flex-col bg-white shadow-2xs border border-gray-200 rounded-lg px-3 py-2.5 hover:shadow-xs transition-all"
                                >
                                  <div className="flex items-center w-full">
                                    {/* Column 1: Priority */}
                                    <div style={{ width: "95px", flexShrink: 0 }} className="pr-3 flex items-center">
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

                                    {/* Column 2: Route Name & View Gaps / D0-D7 Buttons */}
                                    <div className="flex-1 min-w-0 pr-3">
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
                                            className="border border-blue-400 rounded px-2 py-1 text-xs outline-none font-bold text-gray-800 w-full"
                                            autoFocus
                                            disabled={isSavingRoute}
                                          />
                                          <div className="flex gap-2 text-xs">
                                            <button
                                              onClick={() => saveRouteName(route.name)}
                                              disabled={isSavingRoute}
                                              className={`text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded cursor-pointer ${isSavingRoute ? 'opacity-50 cursor-not-allowed' : 'hover:text-green-800'}`}
                                            >
                                              {isSavingRoute ? 'Saving...' : 'Save'}
                                            </button>
                                            <button
                                              onClick={() => setEditingRoute(null)}
                                              disabled={isSavingRoute}
                                              className={`text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded cursor-pointer ${isSavingRoute ? 'opacity-50 cursor-not-allowed' : 'hover:text-gray-700'}`}
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="flex items-start gap-1.5">
                                            <p className="font-bold text-xs sm:text-[13px] leading-snug break-words text-gray-800" title={route.name}>
                                              {route.name}
                                            </p>
                                            <button
                                              onClick={() => { setEditingRoute(route.name); setEditRouteValue(route.name); }}
                                              className="flex-shrink-0 text-gray-400 hover:text-blue-500 transition-colors mt-0.5 cursor-pointer"
                                              title="Rename route"
                                            >
                                              <FiEdit2 size={11} />
                                            </button>
                                          </div>
                                          <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400 font-medium flex-wrap">
                                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold">
                                              Sub-route {subIdx + 1}
                                            </span>
                                            <button
                                              onClick={() => toggleRouteGaps(route.name)}
                                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                                                isExpanded
                                                  ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                                                  : "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"
                                              }`}
                                              title="Click to view delivery gap breakdown"
                                            >
                                              <FiEye size={10} />
                                              <span>{isExpanded ? "Hide Gaps" : "View Gaps"}</span>
                                            </button>
                                            <button
                                              onClick={() => toggleRouteCategories(route.name)}
                                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                                                isCatExpanded
                                                  ? "bg-purple-600 text-white border-purple-600 shadow-2xs"
                                                  : "bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100"
                                              }`}
                                              title="Click to view D0-D7 category breakdown"
                                            >
                                              <FiEye size={10} />
                                              <span>{isCatExpanded ? "Hide D0-D7" : "View D0-D7"}</span>
                                            </button>
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

                                    {/* Assigned Agent Column (supports multiple agents per sub-route) */}
                                    <div style={{ width: "145px", flexShrink: 0 }} className="pl-2 flex items-center min-w-0">
                                      {routeAgents.length === 0 ? (
                                        <span className="text-red-500 font-semibold text-[11px] bg-red-50 border border-red-200/60 rounded px-1.5 py-0.5">
                                          Unassigned
                                        </span>
                                      ) : routeAgents.length === 1 ? (
                                        <div className="flex items-center gap-1.5 min-w-0 group w-full" title={routeAgents[0].name}>
                                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                                            {getInitials(routeAgents[0].name)}
                                          </div>
                                          <span className="text-[11px] font-medium text-gray-700 truncate">
                                            {routeAgents[0].name}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleUnassignAgentFromRoute(routeAgents[0].id, route.name);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-xs ml-auto transition-opacity cursor-pointer p-0.5"
                                            title={`Unassign ${routeAgents[0].name} from ${route.name}`}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1.5 min-w-0 w-full" title={routeAgents.map(a => a.name).join(", ")}>
                                          <span
                                            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 truncate cursor-pointer hover:bg-blue-100 transition-colors"
                                            onClick={() => setAssignSelectedRoute(route.name)}
                                          >
                                            {routeAgents.length} Agents
                                          </span>
                                          <div className="flex -space-x-1.5 overflow-hidden flex-shrink-0">
                                            {routeAgents.slice(0, 3).map((a) => (
                                              <div
                                                key={a.id}
                                                className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[8px] border border-white shadow-2xs"
                                                title={a.name}
                                              >
                                                {getInitials(a.name)}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Expanded Single-Row Delivery Gaps */}
                                  {isExpanded && (
                                    <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center gap-2 overflow-x-auto text-xs py-1.5 px-2 bg-slate-50/80 rounded-lg">
                                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap pl-1">
                                        Delivery Gaps:
                                      </span>
                                      <div className="flex items-center gap-2 flex-nowrap min-w-max">
                                        {["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G10+", "G15+", "G20+"].map((g) => {
                                          const count = route.gapCounts?.[g] || 0;
                                          return (
                                            <span
                                              key={g}
                                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-all ${
                                                count > 0
                                                  ? "bg-white text-gray-800 border border-gray-200 shadow-2xs font-bold"
                                                  : "bg-gray-100/70 text-gray-400 border border-gray-200/50 font-normal"
                                              }`}
                                            >
                                              <span className="text-gray-600 font-semibold">{g}</span>
                                              <span className={count > 0 ? "text-blue-600 font-extrabold" : "text-gray-400"}>
                                                ({count})
                                              </span>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* Expanded Single-Row D0-D7 Categories */}
                                  {isCatExpanded && (
                                    <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center gap-2 overflow-x-auto text-xs py-1.5 px-2 bg-purple-50/60 rounded-lg">
                                      <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider whitespace-nowrap pl-1">
                                        Categories (D0-D7):
                                      </span>
                                      <div className="flex items-center gap-2 flex-nowrap min-w-max">
                                        {["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"].map((d) => {
                                          const count = route.categoryCounts?.[d] || 0;
                                          return (
                                            <span
                                              key={d}
                                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-all ${
                                                count > 0
                                                  ? "bg-white text-gray-800 border border-purple-200 shadow-2xs font-bold"
                                                  : "bg-gray-100/70 text-gray-400 border border-gray-200/50 font-normal"
                                              }`}
                                            >
                                              <span className="text-gray-600 font-semibold">{d}</span>
                                              <span className={count > 0 ? "text-purple-600 font-extrabold" : "text-gray-400"}>
                                                ({count})
                                              </span>
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-sm font-medium text-gray-700 rounded-b-xl mt-auto">
            <div className="flex flex-col items-center flex-1">
              <span className="text-gray-500 text-xs">Total Parent Routes</span>
              <span className="text-base font-bold text-gray-800">
                {groupedRoutes.length} <span className="text-xs font-semibold text-gray-500">({routeData.length} Sub-routes)</span>
              </span>
            </div>
            <div className="flex flex-col items-center flex-1 border-l border-gray-300">
              <span className="text-gray-500 text-xs">Total Customers</span>
              <span className="text-base font-bold text-gray-800">{routeData.reduce((sum, r) => sum + r.totalCustomers, 0)}</span>
            </div>
            <div className="flex flex-col items-center flex-1 border-l border-gray-300 text-blue-600">
              <span className="text-gray-500 text-xs text-blue-600/70">Assigned Sub-routes</span>
              <span className="text-base font-bold">{routeData.filter(r => (r.assignedAgents && r.assignedAgents.length > 0)).length}/{routeData.length}</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - ASSIGN AGENT PANEL (COMPACT 280px) */}
        <div className="w-full xl:w-[280px] flex-shrink-0 flex flex-col gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-800">Assign Route</h2>
              {selectedAgentIds.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                  {selectedAgentIds.length} Selected
                </span>
              )}
            </div>

            {/* 1. Select Route */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1">1. Select Route</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                value={assignSelectedRoute}
                onChange={(e) => handleSelectRoute(e.target.value)}
              >
                <option value="">Choose a route</option>
                {groupedRoutes.map((group) => (
                  <optgroup key={group.parentKey} label={`Route ${group.parentKey} (${group.routes.length} sub-routes)`}>
                    {group.routes.length > 1 && (
                      <option value={`PARENT:${group.parentKey}`} className="font-bold text-blue-700">
                        Assign All {group.parentKey} ({group.routes.length} sub-routes)
                      </option>
                    )}
                    {group.routes.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.name} {r.assignedAgents?.length ? `(${r.assignedAgents.length} agents)` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {assignSelectedRoute.startsWith("PARENT:") && (
                <div className="mt-1.5 p-1.5 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-700 font-semibold flex items-center gap-1">
                  <span>
                    Will apply to all {groupedRoutes.find(g => g.parentKey === assignSelectedRoute.replace("PARENT:", ""))?.routes.length || 0} sub-routes of {assignSelectedRoute.replace("PARENT:", "")}!
                  </span>
                </div>
              )}
            </div>

            {/* 2. Multi-Select Delivery Agents */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-700">
                  2. Select Agent(s)
                </label>
                {assignSelectedRoute && selectedAgentIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedAgentIds([])}
                    className="text-[10px] text-gray-400 hover:text-red-600 font-medium cursor-pointer"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              {!assignSelectedRoute ? (
                <p className="text-[11px] text-gray-400 italic bg-gray-50 p-3 rounded-lg border border-gray-100 text-center">
                  Select a route above to view and assign agents.
                </p>
              ) : (
                <div className="border border-gray-200 rounded-lg p-1.5 max-h-[280px] overflow-y-auto flex flex-col gap-1.5 bg-slate-50/50">
                  {agentStats.map((agent, i) => {
                    const agentId = agent.id || agent.uid;
                    const isSelected = selectedAgentIds.includes(agent.id) || (agent.uid && selectedAgentIds.includes(agent.uid));
                    const colors = [
                      "bg-teal-100 text-teal-700", "bg-orange-100 text-orange-700",
                      "bg-red-100 text-red-700", "bg-purple-100 text-purple-700",
                      "bg-blue-100 text-blue-700", "bg-pink-100 text-pink-700"
                    ];
                    const colorClass = colors[i % colors.length];

                    return (
                      <div
                        key={agent.id}
                        onClick={() => toggleAgentSelection(agentId)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all select-none ${
                          isSelected
                            ? "bg-blue-50/90 border border-blue-400 shadow-2xs ring-1 ring-blue-400/50"
                            : "bg-white hover:bg-gray-50 border border-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                          />
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0 ${colorClass}`}>
                            {getInitials(agent.name || agent.display_name)}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs truncate ${isSelected ? "font-bold text-blue-900" : "font-semibold text-gray-800"}`}>
                              {agent.name || agent.display_name}
                            </p>
                            <p className="text-[10px] text-gray-400">{agent.customersAssigned} Customers</p>
                          </div>
                        </div>

                        {isSelected ? (
                          <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[9px] font-bold flex-shrink-0">
                            Assigned
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded text-[9px] font-medium flex-shrink-0">
                            Select
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Main Action Button */}
            <button
              onClick={handleAssignAgent}
              disabled={isAssigning || !assignSelectedRoute || selectedAgentIds.length === 0}
              className={`w-full py-2.5 rounded-lg text-white font-bold text-xs shadow-sm transition-all mt-1 ${
                isAssigning || !assignSelectedRoute || selectedAgentIds.length === 0
                  ? "bg-blue-300 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 cursor-pointer active:scale-[0.99]"
              }`}
            >
              {isAssigning
                ? "Assigning..."
                : !assignSelectedRoute
                ? "Select a Route First"
                : selectedAgentIds.length === 0
                ? "Select Agent(s) to Assign"
                : selectedAgentIds.length === 1
                ? "Assign 1 Agent to Route"
                : `Assign ${selectedAgentIds.length} Agents to Route`}
            </button>

            {assignSelectedRoute && selectedAgentIds.length === 0 && (
              <button
                type="button"
                onClick={handleAssignAgent}
                disabled={isAssigning}
                className="mt-2 text-center text-[11px] text-gray-400 hover:text-red-600 font-medium underline transition-colors cursor-pointer"
              >
                Unassign all agents from this route
              </button>
            )}
          </div>

          {/* COMPACT ASSIGNED AGENTS CARDS */}
          <div className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col">
            <h2 className="text-base font-bold text-gray-800 mb-4">Assigned Deliverymen</h2>
            {agentStats.filter(a => (a.displayRoute && a.displayRoute !== "No routes") || a.customersAssigned > 0).length === 0 ? (
              <p className="text-sm text-gray-500">No deliverymen are currently assigned to any routes.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {agentStats.filter(a => (a.displayRoute && a.displayRoute !== "No routes") || a.customersAssigned > 0).map((agent, i) => {
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

      {/* AUTO-OPTIMIZE SUB-ROUTES MODAL */}
      <SubRouteOptimizationModal
        isOpen={isOptimizationModalOpen}
        onClose={() => setIsOptimizationModalOpen(false)}
        pendingChanges={optimizationData.pendingChanges}
        stats={optimizationData.stats}
        onSuccess={handleOptimizationSuccess}
      />
    </div>
  );
}
