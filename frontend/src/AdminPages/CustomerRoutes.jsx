import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FiUsers, FiMapPin, FiTarget, FiTrendingUp } from "react-icons/fi";
import { ADMIN_PATH } from "../constant";
import { getCachedUserInfo, invalidateClientUserInfoCache } from "../utils/customerInfoClientCache";
import { getTodayEffectiveStatus } from "../utils/aiSuggestionEngine";

export default function CustomerRoutes() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [agents, setAgents] = useState([]);
  const [categoryPeaks, setCategoryPeaks] = useState({});

  // Filtering and Selection
  const [assignSelectedRoute, setAssignSelectedRoute] = useState("");
  const [assignSelectedAgent, setAssignSelectedAgent] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

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

        const [routesRes, agentsRes, peakRes] = await Promise.all([
          axios.get(`${ADMIN_PATH}/routes`),
          axios.get(`${ADMIN_PATH}/get-del-partner`),
          axios.get(`${ADMIN_PATH}/category-peak-potentials`).catch(() => ({ data: {} })),
        ]);

        setRoutes(routesRes.data || []);
        setAgents(agentsRes.data || []);
        setCategoryPeaks(peakRes.data || {});
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

    // Initialize all routes
    routes.forEach(routeName => {
      routeMap[routeName] = {
        name: routeName,
        totalCustomers: 0,
        activeCustomers: 0,
        bestPotential: Number(categoryPeaks[`ROUTE_${routeName.toUpperCase()}`]) || 0,
        potentialAchieved: 0,
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

    // Process customers
    customers.forEach(customer => {
      const route = customer.route;
      if (route && routeMap[route]) {
        routeMap[route].totalCustomers += 1;
        
        if (getTodayEffectiveStatus(customer) === "ON") {
          routeMap[route].activeCustomers += 1;
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
      }
    });

    // Finalize route details
    return Object.values(routeMap).map(routeInfo => {
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
  }, [routes, customers, agents, categoryPeaks]);

  // Compute Agent stats for Right Sidebar
  const agentStats = useMemo(() => {
    return agents.map(agent => {
      const customersAssigned = customers.filter(c => 
        c.assignedDeliverymen === agent.id || 
        c.assignedDeliverymen === agent.name
      ).length;

      return {
        ...agent,
        customersAssigned,
        isActive: agent.active !== false
      };
    });
  }, [agents, customers]);

  const totalCustomersAssigned = routeData.reduce((sum, route) => sum + route.totalCustomers, 0);
  const totalActiveCustomers = routeData.reduce((sum, route) => sum + route.activeCustomers, 0);
  const totalBestPotential = routeData.reduce((sum, route) => sum + (route.bestPotential || 0), 0);
  const totalAchievedPotential = routeData.reduce((sum, route) => sum + (route.potentialAchieved || 0), 0);

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
        const updated = prev.includes(name) ? prev : [...prev, name];
        return updated.sort((a, b) => a.localeCompare(b));
      });
      alert("Route Added");
    } catch (error) {
      alert(error.response?.data?.message || "Failed to add route");
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
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-6">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Routes</p>
              <p className="text-3xl font-bold text-gray-800">{routes.length}</p>
              <p className="text-xs text-green-500 mt-1">{routes.length} Active Routes</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600 text-2xl">
              <FiMapPin />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Agents</p>
              <p className="text-3xl font-bold text-gray-800">{agents.length}</p>
              <p className="text-xs text-green-500 mt-1">{agents.filter(a => a.active !== false).length} Active Agents</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-green-600 text-2xl">
              <FiUsers />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Customers Assigned</p>
              <p className="text-3xl font-bold text-gray-800">{totalCustomersAssigned}</p>
              <p className="text-xs text-green-500 mt-1">Across All Routes</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg text-orange-600 text-2xl">
              <FiUsers />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Potential</p>
              <p className="text-3xl font-bold text-gray-800">T({totalBestPotential})</p>
              <p className="text-xs text-orange-500 mt-1">Across All Routes</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg text-orange-600 text-2xl">
              <FiTarget />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Achieved</p>
              <p className="text-3xl font-bold text-gray-800">{totalAchievedPotential}</p>
              <p className="text-xs text-purple-500 mt-1">Across All Routes</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg text-purple-600 text-2xl">
              <FiTrendingUp />
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-6">
        {/* LEFT PANEL - ALL ROUTES */}
        <div className="flex-[2] bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <div className="p-5 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800">All Routes</h2>
          </div>
          <div className="flex-1 overflow-auto bg-gray-50 p-4">
            {/* Header */}
            <div className="flex items-center px-6 py-2 mb-2 text-sm font-semibold text-gray-500 sticky top-0 z-10">
              <div className="flex-[1.5]">Route Name</div>
              <div className="flex-1 text-center">Total</div>
              <div className="flex-1 text-center">Active</div>
              <div className="flex-1 text-center">Best Potential</div>
              <div className="flex-1 text-center">Achieved</div>
              <div className="flex-[1.5] pl-6">Assigned Agent</div>
            </div>
            
            {/* Rows */}
            <div className="flex flex-col gap-3">
              {loading ? (
                <div className="text-center py-10 text-gray-500">Loading...</div>
              ) : routeData.length === 0 ? (
                <div className="text-center py-10 text-gray-500">No routes found.</div>
              ) : (
                routeData.map((route, i) => {
                  const colors = [
                    { border: "border-l-blue-500", text: "text-blue-500" },
                    { border: "border-l-green-500", text: "text-green-500" },
                    { border: "border-l-orange-500", text: "text-orange-500" },
                    { border: "border-l-purple-500", text: "text-purple-500" },
                    { border: "border-l-teal-500", text: "text-teal-500" },
                    { border: "border-l-pink-500", text: "text-pink-500" },
                  ];
                  const color = colors[i % colors.length];

                  return (
                    <div key={route.name} className={`flex items-center bg-white shadow-sm border border-gray-100 border-l-4 ${color.border} rounded-xl p-4 hover:shadow-md transition-shadow`}>
                      <div className="flex-[1.5]">
                        <p className={`font-bold text-base ${color.text}`}>{route.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Route {i + 1}</p>
                      </div>
                      <div className="flex-1 text-center font-medium text-gray-800">{route.totalCustomers}</div>
                      <div className="flex-1 text-center font-bold text-green-600">{route.activeCustomers}</div>
                      <div className="flex-1 text-center font-bold text-orange-500">{route.bestPotential > 0 ? `T(${route.bestPotential})` : '-'}</div>
                      <div className="flex-1 text-center font-bold text-purple-600">{route.potentialAchieved > 0 ? route.potentialAchieved : '-'}</div>
                      <div className="flex-[1.5] pl-6 flex items-center">
                        {route.assignedAgent === "Unassigned" ? (
                           <span className="text-red-500 font-medium">Unassigned</span>
                        ) : (
                           <div className="flex items-center gap-2">
                             <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                               {getInitials(route.assignedAgentName)}
                             </div>
                             <span className="text-gray-700 font-medium">{route.assignedAgentName}</span>
                           </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-sm font-medium text-gray-700 rounded-b-xl mt-auto">
             <div className="flex flex-col items-center flex-1">
                <span className="text-gray-500 text-xs">Total Routes</span>
                <span className="text-lg">{routeData.length}</span>
             </div>
             <div className="flex flex-col items-center flex-1 border-l border-gray-300">
                <span className="text-gray-500 text-xs">Total Customers</span>
                <span className="text-lg">{routeData.reduce((sum, r) => sum + r.totalCustomers, 0)}</span>
             </div>
             <div className="flex flex-col items-center flex-1 border-l border-gray-300 text-blue-600">
                <span className="text-gray-500 text-xs text-blue-600/70">Assigned Agents</span>
                <span className="text-lg">{routeData.filter(r => r.assignedAgent !== "Unassigned").length}/{routeData.length}</span>
             </div>
          </div>
        </div>

        {/* RIGHT PANEL - ASSIGN AGENT */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col max-h-[800px]">
          <h2 className="text-lg font-bold text-gray-800 mb-6">Assign Agent to Route</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Route</label>
            <select 
              className="w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
              value={assignSelectedRoute}
              onChange={(e) => setAssignSelectedRoute(e.target.value)}
            >
              <option value="">Choose a route</option>
              {routes.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Agent</label>
            <select 
              className="w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
              value={assignSelectedAgent}
              onChange={(e) => setAssignSelectedAgent(e.target.value)}
            >
              <option value="">Choose an agent</option>
              {agentStats.map(a => (
                <option key={a.id} value={a.id}>{a.name || a.display_name}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-auto border border-gray-100 rounded-lg p-2 mb-6">
            <p className="text-sm font-semibold text-gray-800 mb-3 px-2">Available Agents ({agentStats.length})</p>
            <div className="flex flex-col gap-2">
              {agentStats.map((agent, i) => {
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
                    className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${colorClass}`}>
                        {getInitials(agent.name || agent.display_name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{agent.name || agent.display_name}</p>
                        <p className="text-xs text-gray-500">{agent.customersAssigned} Customers</p>
                      </div>
                    </div>
                    <div>
                      {agent.isActive ? (
                        <span className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-xs font-medium border border-green-200">
                          Available
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium border border-gray-200">
                          Offline
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button 
            onClick={handleAssignAgent}
            disabled={isAssigning || !assignSelectedRoute || !assignSelectedAgent}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAssigning ? "Assigning..." : "Assign Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
