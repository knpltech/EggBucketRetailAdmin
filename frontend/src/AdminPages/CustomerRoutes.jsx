import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FiUsers, FiMapPin, FiSearch } from "react-icons/fi";
import { ADMIN_PATH } from "../constant";
import { getCachedUserInfo, invalidateClientUserInfoCache } from "../utils/customerInfoClientCache";

export default function CustomerRoutes() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [zones, setZones] = useState([]);
  const [agents, setAgents] = useState([]);

  // Filtering and Selection

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedZone, setSelectedZone] = useState("ALL");
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

        const [routesRes, zonesRes, agentsRes] = await Promise.all([
          axios.get(`${ADMIN_PATH}/routes`),
          axios.get(`${ADMIN_PATH}/zones`),
          axios.get(`${ADMIN_PATH}/get-del-partner`),
        ]);

        setRoutes(routesRes.data || []);
        setZones(zonesRes.data || []);
        setAgents(agentsRes.data || []);
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
        zone: null,
        customers: 0,
        agentsAssigned: {},
        assignedAgent: "Unassigned",
        assignedAgentName: "Unassigned"
      };
    });

    // Process customers
    customers.forEach(customer => {
      const route = customer.route;
      if (route && routeMap[route]) {
        routeMap[route].customers += 1;
        
        if (!routeMap[route].zone && customer.zone) {
          routeMap[route].zone = customer.zone;
        }

        const agentId = customer.assignedDeliverymen;
        if (agentId) {
          routeMap[route].agentsAssigned[agentId] = (routeMap[route].agentsAssigned[agentId] || 0) + 1;
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
        ...routeInfo,
        zone: routeInfo.zone || "UNASSIGNED"
      };
    });
  }, [routes, customers, agents]);

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

  // Handle Search and Filters
  const filteredRoutes = useMemo(() => {
    return routeData.filter(route => {
      const matchesSearch = route.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesZone = selectedZone === "ALL" || route.zone === selectedZone;
      return matchesSearch && matchesZone;
    });
  }, [routeData, searchQuery, selectedZone]);

  const totalCustomersAssigned = routeData.reduce((sum, route) => sum + route.customers, 0);

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
      <div className="mb-8 flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Route Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Organize delivery routes and assign agents to ensure efficient coverage and no overlaps.
          </p>
        </div>
        <button
          onClick={addRoutePrompt}
          className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-sm transition-colors self-start md:self-auto"
        >
          + Add Route
        </button>
      </div>

      <div className="mb-8">
        <div className="flex gap-6 mt-6">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex-1 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Routes</p>
              <p className="text-3xl font-bold text-gray-800">{routes.length}</p>
              <p className="text-xs text-green-500 mt-1">{routes.length} Active Routes</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600 text-2xl">
              <FiMapPin />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex-1 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Agents</p>
              <p className="text-3xl font-bold text-gray-800">{agents.length}</p>
              <p className="text-xs text-green-500 mt-1">{agents.filter(a => a.active !== false).length} Active Agents</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-green-600 text-2xl">
              <FiUsers />
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex-1 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Customers Assigned</p>
              <p className="text-3xl font-bold text-gray-800">{totalCustomersAssigned}</p>
              <p className="text-xs text-green-500 mt-1">Across All Routes</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg text-orange-600 text-2xl">
              <FiUsers />
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
          
          <div className="p-4 flex gap-4 border-b border-gray-100">
            <div className="relative flex-1">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search routes..." 
                className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select 
              className="border rounded-lg px-4 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500 w-48"
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
            >
              <option value="ALL">All Zones</option>
              {zones.map(z => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 shadow-sm">
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-700">Route Name</th>
                  <th className="px-6 py-4 font-semibold text-gray-700">Zone</th>
                  <th className="px-6 py-4 font-semibold text-gray-700 text-center">Customers</th>
                  <th className="px-6 py-4 font-semibold text-gray-700">Assigned Agent</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4" className="text-center py-10 text-gray-500">Loading...</td>
                  </tr>
                ) : filteredRoutes.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center py-10 text-gray-500">No routes found.</td>
                  </tr>
                ) : (
                  filteredRoutes.map((route, i) => (
                    <tr key={route.name} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-blue-600 border-l-4 border-l-transparent hover:border-l-blue-600">
                        {route.name}
                      </td>
                      <td className="px-6 py-4 text-gray-600">{route.zone}</td>
                      <td className="px-6 py-4 text-center font-medium text-gray-800">{route.customers}</td>
                      <td className="px-6 py-4">
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
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-sm font-medium text-gray-700 rounded-b-xl mt-auto">
             <div className="flex flex-col items-center flex-1">
                <span className="text-gray-500 text-xs">Total Routes</span>
                <span className="text-lg">{filteredRoutes.length}</span>
             </div>
             <div className="flex flex-col items-center flex-1 border-l border-gray-300">
                <span className="text-gray-500 text-xs">Total Customers</span>
                <span className="text-lg">{filteredRoutes.reduce((sum, r) => sum + r.customers, 0)}</span>
             </div>
             <div className="flex flex-col items-center flex-1 border-l border-gray-300 text-blue-600">
                <span className="text-gray-500 text-xs text-blue-600/70">Assigned Agents</span>
                <span className="text-lg">{filteredRoutes.filter(r => r.assignedAgent !== "Unassigned").length}/{filteredRoutes.length}</span>
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
