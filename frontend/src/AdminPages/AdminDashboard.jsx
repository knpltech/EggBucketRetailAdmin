import React, { useState } from "react";
import { Link, useNavigate, useLocation, Outlet } from "react-router-dom";
import {
  FiMenu,
  FiInfo,
  FiUsers,
  FiTruck,
  FiUserCheck,
  FiUserPlus,
  FiUser,
  FiFileText,
  FiRefreshCw,
  FiCompass,
  FiDollarSign,
  FiTrendingUp,
  FiLayers,
  FiPhoneCall,
  FiMapPin,
  FiClock,
  FiMap,
  FiLogOut,
} from "react-icons/fi";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("adminSidebarCollapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("adminSidebarCollapsed", String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem("loggedIn");
    localStorage.removeItem("userType");
    localStorage.removeItem("authToken");
    navigate("/");
  };

  const navItems = [
    { label: "About", path: "/admin", icon: FiInfo },
    { label: "Customer Info", path: "/admin/customers", icon: FiUsers },
    { label: "Add Delivery Partner", path: "/admin/add-delivery", icon: FiTruck },
    { label: "Add Sales Partner", path: "/admin/add-sales", icon: FiUserCheck },
    { label: "Add Customer", path: "/admin/add-customer", icon: FiUserPlus },
    { label: "View Personnel", path: "/admin/personnel", icon: FiUser },
    { label: "Report", path: "/admin/report", icon: FiFileText },
    { label: "Customer Retention", path: "/admin/customer-retention", icon: FiRefreshCw },
    { label: "Dummy AI Suggestions", path: "/admin/dummy-ai-suggestions", icon: FiCompass },
    { label: "Collections", path: "/admin/collections", icon: FiDollarSign },
    { label: "Business Statistics", path: "/admin/business-statistics", icon: FiTrendingUp },
    { label: "Customer Management", path: "/admin/customer-management", icon: FiLayers },
    { label: "Calling Customers", path: "/admin/prime-customers", icon: FiPhoneCall },
    { label: "Route Management", path: "/admin/routes", icon: FiMapPin },
    { label: "Priority Window", path: "/admin/priority-window", icon: FiClock },
    { label: "Customer Map", path: "/admin/customer-map-for-delivery", icon: FiMap },
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          isCollapsed ? "w-[68px]" : "w-[235px]"
        } transition-all duration-300 ease-in-out flex-shrink-0 min-h-0 bg-gradient-to-b from-gray-800 to-gray-900 text-white flex flex-col shadow-xl z-10`}
      >
        {/* Logo Section */}
        <div
          className={`flex items-center h-16 border-b border-gray-700 bg-gray-900 flex-none px-3 ${
            isCollapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!isCollapsed ? (
            <div className="flex items-center space-x-2 overflow-hidden">
              <img src="/logo.png" alt="EggBucket Logo" className="h-9 w-auto flex-shrink-0" />
              <span className="text-xl font-bold text-white whitespace-nowrap">EggBucket</span>
            </div>
          ) : (
            <img src="/logo.png" alt="EggBucket Logo" className="h-8 w-auto" />
          )}
        </div>

        {/* Menu Bar with Hide/Collapse Toggle Button */}
        <div
          className={`flex items-center px-3 py-2 border-b border-gray-700/50 bg-gray-800/60 ${
            isCollapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!isCollapsed && (
            <span className="text-xs font-bold tracking-wider text-gray-400 uppercase pl-1">
              MENU
            </span>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition-colors focus:outline-none"
            title={isCollapsed ? "Expand sidebar" : "Hide sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Hide sidebar"}
          >
            <FiMenu className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1 mt-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={isCollapsed ? item.label : undefined}
                className={`rounded-lg transition-all duration-200 flex items-center ${
                  isCollapsed
                    ? "justify-center p-2.5"
                    : "px-3 py-2 space-x-3 text-sm"
                } ${
                  isActive
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white font-medium shadow-md"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                <Icon className={`flex-shrink-0 ${isCollapsed ? "w-5 h-5" : "w-4 h-4"}`} />
                {!isCollapsed && (
                  <>
                    <span className="flex-1 leading-6 truncate">{item.label}</span>
                    {isActive && (
                      <span className="w-2 h-2 bg-white rounded-full flex-shrink-0"></span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Logout Section */}
        <div className="flex-none p-3 border-t border-gray-700 bg-gray-900/35">
          <button
            onClick={handleLogout}
            title={isCollapsed ? "Logout" : undefined}
            className={`w-full rounded-lg bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium shadow-md transition-all duration-200 flex items-center justify-center ${
              isCollapsed ? "p-2.5" : "px-4 py-2.5 space-x-2"
            }`}
          >
            <FiLogOut className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow min-w-0 p-4 overflow-y-auto overflow-x-hidden bg-white rounded-tl-3xl rounded-bl-3xl shadow-lg transition-all duration-300">
        <div className="w-full bg-white">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
