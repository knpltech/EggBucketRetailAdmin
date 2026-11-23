import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { ADMIN_PATH } from "../constant";
import {
  Award,
  Target,
  Truck,
  UserCheck,
  TrendingUp,
  Search,
  Filter,
  RefreshCw,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  CalendarDays,
  Smartphone,
  ChevronRight,
  Layers,
  DollarSign,
  Package,
  Zap,
  Info,
} from "lucide-react";

// Timezone and date helpers (Asia/Kolkata)
const INDIA_TZ = "Asia/Kolkata";

function getDateKey(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: INDIA_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch (e) {
    // fallback
  }
  return d.toISOString().slice(0, 10);
}

// Target cycle is fixed from Sunday to Saturday.
// Start day Sunday, end day Saturday. Resets every Saturday at midnight.
function getWeekRange(date = new Date()) {
  const d = new Date(date);
  
  // Resolve weekday in Indian Standard Time (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const dayStr = new Intl.DateTimeFormat("en-US", { timeZone: INDIA_TZ, weekday: "short" }).format(d);
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = weekdayMap[dayStr] ?? d.getDay();

  // Sunday start (offset back by 'day' days)
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - day);

  // Saturday end (Sunday + 6 days)
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);

  return {
    from: getDateKey(sunday),
    to: getDateKey(saturday),
  };
}

function getLastWeekRange() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return getWeekRange(d);
}

function getMonthRange() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: getDateKey(firstDay),
    to: getDateKey(lastDay),
  };
}

// Default fallback settings matching the mobile screenshot
const DEFAULT_CONFIG = {
  routes: {
    enabled: true,
    title: "Weekly Incentive Target",
    description: "Complete more trays and earn more!",
    goalTrays: 1000,
    goalReward: 2000,
    slabs: [
      { tier: 1, trayTarget: 700, incentive: 700 },
      { tier: 2, trayTarget: 800, incentive: 1000 },
      { tier: 3, trayTarget: 900, incentive: 1300 },
      { tier: 4, trayTarget: 1000, incentive: 2000 },
    ],
  },
  sales: {
    enabled: true,
    title: "Weekly Incentive Target",
    description: "Complete more trays and earn more!",
    goalTrays: 1000,
    goalReward: 1800,
    slabs: [
      { tier: 1, trayTarget: 500, incentive: 500 },
      { tier: 2, trayTarget: 700, incentive: 800 },
      { tier: 3, trayTarget: 900, incentive: 1200 },
      { tier: 4, trayTarget: 1000, incentive: 1800 },
    ],
  },
};

export default function IncentiveManagement() {
  // Settings State
  const [settings, setSettings] = useState(DEFAULT_CONFIG);
  const [initialSettings, setInitialSettings] = useState(DEFAULT_CONFIG);
  const [savingSettings, setSavingSettings] = useState(false);

  // Table Data & Filters
  const initialWeek = useMemo(() => getWeekRange(), []);
  const [preset, setPreset] = useState("this_week");
  const [fromDate, setFromDate] = useState(initialWeek.from);
  const [toDate, setToDate] = useState(initialWeek.to);
  const [roleFilter, setRoleFilter] = useState("all"); // 'all' | 'delivery' | 'sales'
  const [searchQuery, setSearchQuery] = useState("");

  // Progress State
  const [progressData, setProgressData] = useState([]);
  const [summary, setSummary] = useState({
    totalAgents: 0,
    activeAgents: 0,
    totalDeliveredTrays: 0,
    totalIncentiveEarned: 0,
    goalAchievedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Interactive Live Preview Simulation (Tray slider)
  const [previewTestTrays, setPreviewTestTrays] = useState(126);

  // Toast Notification
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 4000);
  };

  // Auth token helper
  const getAuthHeader = () => {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // 1. Fetch Incentive Settings
  const fetchSettings = useCallback(async () => {
    try {
      const res = await axios.get(`${ADMIN_PATH}/incentive-settings`, {
        headers: getAuthHeader(),
      });
      if (res.data?.success && res.data?.settings) {
        setSettings(res.data.settings);
        setInitialSettings(JSON.parse(JSON.stringify(res.data.settings)));
      }
    } catch (err) {
      console.warn("Could not fetch remote settings, using default:", err?.message);
    }
  }, []);

  // 2. Fetch Live Agent Progress
  const fetchProgress = useCallback(
    async (from = fromDate, to = toDate, role = roleFilter) => {
      try {
        setRefreshing(true);
        const res = await axios.get(`${ADMIN_PATH}/incentive-progress`, {
          params: { fromDate: from, toDate: to, role },
          headers: getAuthHeader(),
        });

        if (res.data?.success) {
          setProgressData(res.data.agents || []);
          if (res.data.summary) {
            setSummary(res.data.summary);
          }
          if (res.data.settings) {
            setSettings(res.data.settings);
          }
        }
      } catch (err) {
        console.error("Error fetching incentive progress:", err);
        showToast("Failed to fetch live agent progress", "error");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fromDate, toDate, roleFilter]
  );

  useEffect(() => {
    fetchSettings();
    fetchProgress(fromDate, toDate, roleFilter);
  }, [fetchSettings, fetchProgress]);

  // Handle slab field edit for Routes App by milestone tier (1..4)
  const handleSlabChange = (tier, field, value) => {
    // If user cleared the input (empty string), preserve "" so input stays clear and doesn't snap to 0
    let cleanVal = value;
    if (value === "" || value === null || value === undefined) {
      cleanVal = "";
    } else {
      const parsed = Number(value);
      // If valid number, use parsed number (which also automatically strips accidental leading 0s like "0700" -> 700)
      cleanVal = isNaN(parsed) ? "" : Math.max(0, parsed);
    }

    setSettings((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.routes) copy.routes = {};
      if (!Array.isArray(copy.routes.slabs) || copy.routes.slabs.length === 0) {
        copy.routes.slabs = JSON.parse(JSON.stringify(DEFAULT_CONFIG.routes?.slabs || []));
      }

      // Locate slab by exact tier so index never shifts
      let slabItem = copy.routes.slabs.find((s) => Number(s.tier) === tier);
      if (!slabItem) {
        const fallbackIdx = tier - 1;
        if (copy.routes.slabs[fallbackIdx]) {
          slabItem = copy.routes.slabs[fallbackIdx];
          slabItem.tier = tier;
        } else {
          slabItem = { tier, trayTarget: 0, incentive: 0 };
          copy.routes.slabs.push(slabItem);
        }
      }

      slabItem[field] = cleanVal;

      // If tier 4 (Weekly Goal), keep goalTrays & goalReward synchronized
      if (tier === 4) {
        const numVal = cleanVal === "" ? "" : (Number(cleanVal) || 0);
        if (field === "trayTarget") copy.routes.goalTrays = numVal;
        if (field === "incentive") copy.routes.goalReward = numVal;
      }

      return copy;
    });
  };

  // Save Routes Settings to Backend
  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      const routesConfig = settings.routes || DEFAULT_CONFIG.routes;
      const rawSlabs = routesConfig.slabs || DEFAULT_CONFIG.routes?.slabs || [];
      const formattedSlabs = [1, 2, 3, 4].map((tierNum) => {
        const s = rawSlabs.find((item) => Number(item.tier) === tierNum) || {};
        return {
          tier: tierNum,
          trayTarget: s.trayTarget === "" || s.trayTarget === undefined ? 0 : Math.max(0, Number(s.trayTarget) || 0),
          incentive: s.incentive === "" || s.incentive === undefined ? 0 : Math.max(0, Number(s.incentive) || 0),
        };
      });

      const tier4 = formattedSlabs.find((s) => s.tier === 4);
      const goalTrays = tier4 ? tier4.trayTarget : (Number(routesConfig.goalTrays) || 1000);
      const goalReward = tier4 ? tier4.incentive : (Number(routesConfig.goalReward) || 2000);

      const payload = {
        routes: {
          ...routesConfig,
          slabs: formattedSlabs,
          goalTrays,
          goalReward,
        },
      };

      const res = await axios.post(`${ADMIN_PATH}/incentive-settings`, payload, {
        headers: getAuthHeader(),
      });

      if (res.data?.success) {
        showToast("Routes incentive targets saved & synced with Routes App!");
        setSettings((prev) => ({ ...prev, routes: payload.routes }));
        setInitialSettings((prev) => ({ ...prev, routes: payload.routes }));
        // Re-fetch progress to re-evaluate milestones with new target slabs
        fetchProgress(fromDate, toDate, roleFilter);
      } else {
        showToast(res.data?.message || "Failed to save settings", "error");
      }
    } catch (err) {
      console.error("Error saving incentive settings:", err);
      showToast(err.response?.data?.message || "Error saving incentive settings", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  // Reset to Defaults
  const handleResetDefaults = () => {
    if (window.confirm("Reset milestone targets to default values?")) {
      setSettings((prev) => ({
        ...prev,
        routes: JSON.parse(JSON.stringify(DEFAULT_CONFIG.routes)),
      }));
      showToast("Reset Routes configuration to default. Click 'Save' to apply.");
    }
  };

  // Filtered Table Rows
  const filteredAgents = useMemo(() => {
    return progressData.filter((agent) => {
      // Role filter
      if (roleFilter !== "all" && agent.role !== roleFilter) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = (agent.name || "").toLowerCase().includes(query);
        const matchesOutlet = (agent.outlet || "").toLowerCase().includes(query);
        const matchesPhone = (agent.phone || "").toLowerCase().includes(query);
        if (!matchesName && !matchesOutlet && !matchesPhone) return false;
      }
      return true;
    });
  }, [progressData, roleFilter, searchQuery]);

  // Routes App active configuration
  const activeConfig = settings.routes || DEFAULT_CONFIG.routes;

  // Milestone slabs for Routes App, kept strictly in stable Tier order (1, 2, 3, 4)
  const configSlabs = useMemo(() => {
    const rawSlabs = activeConfig?.slabs || DEFAULT_CONFIG.routes?.slabs || [];
    return [1, 2, 3, 4].map((tierNum) => {
      const existing = rawSlabs.find((s) => Number(s.tier) === tierNum);
      if (existing) return existing;
      const fallback = DEFAULT_CONFIG.routes?.slabs?.find((s) => s.tier === tierNum);
      return fallback || { tier: tierNum, trayTarget: 0, incentive: 0 };
    });
  }, [activeConfig?.slabs]);

  // Calculation slabs sorted by target for preview simulation only
  const calculationSlabs = useMemo(() => {
    return [...configSlabs]
      .map((s) => ({
        tier: Number(s.tier) || 1,
        trayTarget: s.trayTarget === "" ? 0 : Number(s.trayTarget) || 0,
        incentive: s.incentive === "" ? 0 : Number(s.incentive) || 0,
      }))
      .filter((s) => s.trayTarget > 0)
      .sort((a, b) => a.trayTarget - b.trayTarget);
  }, [configSlabs]);

  // Goal & Reward for preview
  const tier4Slab = configSlabs.find((s) => Number(s.tier) === 4);
  const previewGoal = tier4Slab && tier4Slab.trayTarget !== ""
    ? (Number(tier4Slab.trayTarget) || 0)
    : (Number(activeConfig.goalTrays) || 1000);
  const previewReward = tier4Slab && tier4Slab.incentive !== ""
    ? (Number(tier4Slab.incentive) || 0)
    : (Number(activeConfig.goalReward) || 2000);
  const previewProgressPercent =
    previewGoal > 0 ? Math.min(100, Math.round((previewTestTrays / previewGoal) * 100)) : 0;

  // Find preview remaining trays for next tier
  let previewTraysLeft = 0;
  let previewNextTarget = calculationSlabs[0]?.trayTarget || previewGoal;
  let previewEarned = 0;

  if (calculationSlabs.length > 0) {
    for (let i = calculationSlabs.length - 1; i >= 0; i--) {
      if (previewTestTrays >= calculationSlabs[i].trayTarget) {
        previewEarned = calculationSlabs[i].incentive;
        if (i < calculationSlabs.length - 1) {
          previewNextTarget = calculationSlabs[i + 1].trayTarget;
          previewTraysLeft = Math.max(0, previewNextTarget - previewTestTrays);
        } else {
          previewTraysLeft = 0;
        }
        break;
      }
      if (i === 0 && previewTestTrays < calculationSlabs[0].trayTarget) {
        previewTraysLeft = Math.max(0, calculationSlabs[0].trayTarget - previewTestTrays);
      }
    }
  } else {
    previewTraysLeft = Math.max(0, previewGoal - previewTestTrays);
  }

  // Quick Preset Handlers
  const handlePresetChange = (newPreset) => {
    setPreset(newPreset);
    let range = { from: fromDate, to: toDate };
    if (newPreset === "this_week") {
      range = getWeekRange();
    } else if (newPreset === "today") {
      const today = getDateKey();
      range = { from: today, to: today };
    } else if (newPreset === "last_week") {
      range = getLastWeekRange();
    } else if (newPreset === "this_month") {
      range = getMonthRange();
    }
    setFromDate(range.from);
    setToDate(range.to);
    fetchProgress(range.from, range.to, roleFilter);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed top-5 right-5 z-50 animate-bounce transition-all duration-300">
          <div
            className={`px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-sm font-semibold border ${
              toast.type === "error"
                ? "bg-red-50 text-red-800 border-red-200"
                : "bg-emerald-50 text-emerald-800 border-emerald-200"
            }`}
          >
            {toast.type === "error" ? (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-gray-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              Incentive Management
              <span className="text-xs px-2.5 py-0.5 font-semibold bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                Live Sync
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Configure 4-tier milestone incentive numbers for Routes App, and track delivery progress.
            </p>
          </div>
        </div>

        {/* Quick info chip */}
        <div className="flex items-center gap-2 self-start md:self-auto bg-gray-50 px-3.5 py-2 rounded-xl border border-gray-200 text-xs text-gray-600">
          <Smartphone className="w-4 h-4 text-amber-600" />
          <span>App Targets:</span>
          <span className="font-semibold text-gray-900">Routes App (Delivery)</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span className="text-emerald-700 font-medium">Ready</span>
        </div>
      </div>

      {/* SECTION 1: 4-INCENTIVE NUMBERS CONTROL PANEL */}
      <div className="bg-white rounded-2xl shadow-xs border border-gray-200/80 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50/70 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-bold text-gray-900">
                4-Tier Incentive Numbers Control Panel (Routes App)
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Changes applied here will update the "Weekly Incentive Target" card in the Routes App immediately.
            </p>
          </div>

          {/* Routes App Badge */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-800 rounded-xl border border-orange-200 text-xs font-bold shadow-2xs">
              <Truck className="w-4 h-4 text-orange-600" />
              <span>Routes App (Delivery)</span>
            </span>
          </div>
        </div>

        {/* Control Panel Body: Configuration Form & Mobile Live Preview */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: 4 Milestone Inputs Form (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-200/60 flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900">
                <span className="font-bold">Dynamic Routes App Settings:</span> Specify the 4 milestone targets in trays
                and the cash incentive (₹) awarded when that milestone is unlocked by the delivery agent during the week.
              </div>
            </div>

            {/* 4 Milestone Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {configSlabs.map((slab) => {
                const tierNum = Number(slab.tier) || 1;
                const isGoal = tierNum === 4;
                return (
                  <div
                    key={tierNum}
                    className={`rounded-xl p-4 border transition-all ${
                      isGoal
                        ? "bg-gradient-to-br from-amber-500/10 via-amber-50 to-white border-amber-300 shadow-xs ring-1 ring-amber-300/50"
                        : "bg-gray-50/70 border-gray-200 hover:border-gray-300 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            isGoal
                              ? "bg-amber-500 text-white shadow-xs"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {tierNum}
                        </span>
                        <span className="text-xs font-bold text-gray-800">
                          Milestone {tierNum} {isGoal && "(Weekly Goal 👑)"}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        Tier {tierNum}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                          Target Trays
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="10"
                            placeholder="0"
                            value={slab.trayTarget ?? ""}
                            onChange={(e) => handleSlabChange(tierNum, "trayTarget", e.target.value)}
                            className="w-full pl-2.5 pr-8 py-1.5 text-sm font-bold text-gray-900 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition"
                          />
                          <span className="absolute right-2.5 top-2 text-[10px] font-semibold text-gray-400">
                            trays
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                          Reward (₹)
                        </label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-xs font-bold text-gray-400">
                            ₹
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            placeholder="0"
                            value={slab.incentive ?? ""}
                            onChange={(e) => handleSlabChange(tierNum, "incentive", e.target.value)}
                            className="w-full pl-6 pr-2.5 py-1.5 text-sm font-bold text-emerald-700 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action Buttons: Save & Reset */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition flex items-center gap-1.5 cursor-pointer border border-gray-300"
              >
                <RotateCcw className="w-3.5 h-3.5 text-gray-500" />
                <span>Reset to Defaults</span>
              </button>

              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white text-xs font-bold rounded-xl shadow-md shadow-amber-500/20 transition flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-60"
              >
                {savingSettings ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving to Routes App...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Routes Incentive Settings</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Live Mobile Screen Replica (5 cols) */}
          <div className="lg:col-span-5 bg-gradient-to-b from-gray-50 to-gray-100/70 p-5 rounded-2xl border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-gray-700" />
                <span className="text-xs font-bold text-gray-800">
                  Live Mobile App UI Preview
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                Routes App (Delivery)
              </span>
            </div>

            {/* Mobile Card Recreation matching attached screenshot */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-200/90 relative overflow-hidden">
              {/* Profile Header Preview */}
              <div className="flex items-center gap-3 pb-3 mb-3 border-b border-gray-100">
                <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-base shadow-xs">
                  T
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900 leading-tight">
                    Tapas Singha
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Delivery Executive
                  </p>
                </div>
              </div>

              {/* The "Weekly Incentive Target" Card */}
              <div className="rounded-xl p-4 bg-gradient-to-br from-amber-50/70 via-orange-50/30 to-amber-100/30 border border-amber-200/70">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 leading-tight">
                        Weekly Incentive Target
                      </h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Complete more trays and earn more!
                      </p>
                    </div>
                  </div>

                  {/* Goal Pill */}
                  <div className="bg-white px-3 py-1.5 rounded-xl border border-amber-200 shadow-2xs text-right shrink-0">
                    <span className="text-[10px] font-bold text-gray-400 block leading-tight">
                      Goal: {previewGoal.toLocaleString()} trays
                    </span>
                    <span className="text-xs font-extrabold text-amber-600">
                      👑 ₹{previewReward.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Counter & Trays Left */}
                <div className="flex items-baseline justify-between mt-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-amber-600 tracking-tight">
                      {previewTestTrays}
                    </span>
                    <span className="text-xs font-semibold text-gray-500">
                      / {previewGoal.toLocaleString()} trays
                    </span>
                  </div>

                  {previewTraysLeft > 0 ? (
                    <span className="text-xs font-bold text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full">
                      {previewTraysLeft} trays left
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      🎉 Goal Achieved!
                    </span>
                  )}
                </div>

                {/* Visual Progress Bar with 4 Milestone Markers */}
                <div className="mt-4 pt-1">
                  <div className="relative w-full h-2.5 bg-gray-200 rounded-full">
                    {/* Active Fill */}
                    <div
                      className="absolute left-0 top-0 h-2.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-300"
                      style={{ width: `${previewProgressPercent}%` }}
                    ></div>

                    {/* Progress Slider Knob */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-orange-500 shadow-sm transition-all duration-300"
                      style={{
                        left: `calc(${previewProgressPercent}% - 8px)`,
                      }}
                    ></div>
                  </div>

                  {/* 4 Milestones markers below slider */}
                  <div className="flex justify-between items-start mt-2 text-center">
                    {configSlabs.map((slab) => {
                      const tierNum = Number(slab.tier) || 1;
                      return (
                        <div key={tierNum} className="flex-1 px-0.5">
                          <span className="block text-[10px] font-bold text-gray-700">
                            {slab.trayTarget !== "" && slab.trayTarget !== undefined
                              ? Number(slab.trayTarget).toLocaleString()
                              : "-"}
                          </span>
                          <span className="block text-[10px] font-bold text-amber-700">
                            ₹{slab.incentive !== "" && slab.incentive !== undefined
                              ? Number(slab.incentive).toLocaleString()
                              : 0}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Interactive preview slider to test numbers */}
              <div className="mt-4 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span className="font-semibold">Simulate Agent Trays:</span>
                  <span className="font-bold text-gray-800">{previewTestTrays} trays</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(1200, previewGoal + 200)}
                  value={previewTestTrays}
                  onChange={(e) => setPreviewTestTrays(Number(e.target.value))}
                  className="w-full accent-amber-600 cursor-pointer h-1.5 bg-gray-200 rounded-lg"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: LIVE INCENTIVE & DELIVERIES TABLE */}
      <div className="space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-gray-500 block">
                Total Trays Delivered
              </span>
              <span className="text-2xl font-black text-gray-900 mt-1 block">
                {summary.totalDeliveredTrays.toLocaleString()}
              </span>
              <span className="text-[11px] text-gray-400 mt-0.5 block">
                Across all active delivery routes
              </span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Package className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-gray-500 block">
                Active Delivering Agents
              </span>
              <span className="text-2xl font-black text-gray-900 mt-1 block">
                {summary.activeAgents}{" "}
                <span className="text-sm font-normal text-gray-400">
                  / {summary.totalAgents}
                </span>
              </span>
              <span className="text-[11px] text-gray-400 mt-0.5 block">
                Agents with completed deliveries
              </span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Truck className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-gray-500 block">
                Goal Achievers (100%+)
              </span>
              <span className="text-2xl font-black text-emerald-600 mt-1 block">
                {summary.goalAchievedCount}
              </span>
              <span className="text-[11px] text-emerald-700 font-medium mt-0.5 block">
                Unlocked top ₹ tier reward 👑
              </span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <Award className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-gray-500 block">
                Total Incentive Earned
              </span>
              <span className="text-2xl font-black text-amber-600 mt-1 block">
                ₹{summary.totalIncentiveEarned.toLocaleString()}
              </span>
              <span className="text-[11px] text-gray-400 mt-0.5 block">
                Payable based on achieved tiers
              </span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Search input & Role Filter */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search agent or outlet..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs font-medium text-gray-900 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white outline-none transition"
              />
            </div>

            {/* Role Filter Tabs */}
            <div className="inline-flex p-1 bg-gray-100 rounded-xl border border-gray-200 text-xs">
              <button
                type="button"
                onClick={() => setRoleFilter("all")}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  roleFilter === "all"
                    ? "bg-white text-gray-900 shadow-2xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                All Agents
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("delivery")}
                className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                  roleFilter === "delivery"
                    ? "bg-white text-gray-900 shadow-2xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Routes (Delivery)
              </button>
            </div>
          </div>

          {/* Right: Date Presets, Custom Date, and Refresh */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            {/* Date Preset Buttons */}
            <div className="inline-flex p-1 bg-gray-100 rounded-xl border border-gray-200 text-xs font-medium">
              <button
                type="button"
                onClick={() => handlePresetChange("this_week")}
                title="Target cycle: Sunday to Saturday (resets Saturday midnight)"
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  preset === "this_week"
                    ? "bg-white font-bold text-gray-900 shadow-2xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                This Week (Sun - Sat)
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange("today")}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  preset === "today"
                    ? "bg-white font-bold text-gray-900 shadow-2xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange("last_week")}
                title="Previous cycle: Sunday to Saturday"
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  preset === "last_week"
                    ? "bg-white font-bold text-gray-900 shadow-2xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Last Week (Sun - Sat)
              </button>
              <button
                type="button"
                onClick={() => handlePresetChange("this_month")}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  preset === "this_month"
                    ? "bg-white font-bold text-gray-900 shadow-2xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                This Month
              </button>
            </div>

            {/* Custom Date Pickers */}
            <div className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-300 rounded-xl px-2.5 py-1 text-xs">
              <CalendarDays className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setPreset("custom");
                  setFromDate(e.target.value);
                }}
                className="bg-transparent border-none outline-none font-semibold text-gray-900 text-xs"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setPreset("custom");
                  setToDate(e.target.value);
                }}
                className="bg-transparent border-none outline-none font-semibold text-gray-900 text-xs"
              />
              <button
                type="button"
                onClick={() => fetchProgress(fromDate, toDate, roleFilter)}
                className="bg-amber-600 text-white font-bold text-[11px] px-2 py-0.5 rounded-lg hover:bg-amber-700 transition cursor-pointer"
              >
                Apply
              </button>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => fetchProgress(fromDate, toDate, roleFilter)}
              disabled={refreshing}
              title="Refresh"
              className="p-2 border border-gray-300 hover:bg-gray-100 rounded-xl text-gray-600 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-amber-600" : ""}`} />
            </button>
          </div>
        </div>

        {/* Progress Table */}
        <div className="bg-white rounded-2xl shadow-xs border border-gray-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Delivery Agent</th>
                  <th className="py-3.5 px-4">App</th>
                  <th className="py-3.5 px-4 text-right">Quantity Delivered</th>
                  <th className="py-3.5 px-4 text-right">Set Target</th>
                  <th className="py-3.5 px-4 min-w-[180px]">Progress (%)</th>
                  <th className="py-3.5 px-4 text-center">Milestone Tier</th>
                  <th className="py-3.5 px-4 text-right">Incentive Earned</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-500 mb-2" />
                      <span>Loading agent incentive data...</span>
                    </td>
                  </tr>
                ) : filteredAgents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400">
                      <Target className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                      <p className="font-semibold text-gray-600">No agents match the selected filters</p>
                      <p className="text-xs text-gray-400 mt-1">Try broadening your date range or search query.</p>
                    </td>
                  </tr>
                ) : (
                  filteredAgents.map((agent) => {
                    const isDelivery = agent.role === "delivery";
                    const isGoalAchieved = agent.deliveredQuantity >= agent.targetTrays;

                    // Progress color coding
                    let progressColor = "bg-amber-500";
                    let textColor = "text-amber-700";
                    if (isGoalAchieved) {
                      progressColor = "bg-emerald-500";
                      textColor = "text-emerald-700";
                    } else if (agent.progressPercent >= 50) {
                      progressColor = "bg-blue-500";
                      textColor = "text-blue-700";
                    }

                    return (
                      <tr
                        key={agent.id || agent.uid || agent.name}
                        className="hover:bg-amber-50/20 transition-colors"
                      >
                        {/* Col 1: Sales and Delivery Agent who made deliveries */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-xs ${
                                isDelivery ? "bg-amber-500" : "bg-blue-600"
                              }`}
                            >
                              {(agent.name || "A").slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-gray-900 leading-tight">
                                {agent.name || "Unknown Agent"}
                              </div>
                              <div className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                                <span>Outlet: {agent.outlet || "Main"}</span>
                                {agent.phone && (
                                  <>
                                    <span>•</span>
                                    <span>{agent.phone}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Col 2: Role / App */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {isDelivery ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <Truck className="w-3 h-3 text-amber-600" />
                              Routes App
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                              <UserCheck className="w-3 h-3 text-blue-600" />
                              Sales App
                            </span>
                          )}
                        </td>

                        {/* Col 3: Quantity Delivered */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span className="font-black text-gray-900 text-sm">
                            {agent.deliveredQuantity.toLocaleString()}
                          </span>
                          <span className="text-[11px] font-semibold text-gray-400 ml-1">
                            trays
                          </span>
                        </td>

                        {/* Col 4: Set Target */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span className="font-bold text-gray-700">
                            {agent.targetTrays.toLocaleString()}
                          </span>
                          <span className="text-[11px] text-gray-400 ml-1">trays</span>
                        </td>

                        {/* Col 5: Progress in % with visual bar */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className={`font-black ${textColor}`}>
                                {agent.progressPercent}%
                              </span>
                              {agent.traysLeft > 0 ? (
                                <span className="text-gray-400 text-[10px]">
                                  {agent.traysLeft} left to next tier
                                </span>
                              ) : (
                                <span className="text-emerald-600 font-bold text-[10px]">
                                  Target met!
                                </span>
                              )}
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-2 rounded-full transition-all duration-500 ${progressColor}`}
                                style={{ width: `${Math.min(100, agent.progressPercent)}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>

                        {/* Col 6: Milestone Tier Reached */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {agent.currentTier > 0 ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                agent.currentTier === 4
                                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                                  : "bg-gray-100 text-gray-800 border border-gray-200"
                              }`}
                            >
                              <span>Tier {agent.currentTier}</span>
                              {agent.currentTier === 4 && <span>👑</span>}
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-gray-400">
                              Below Tier 1
                            </span>
                          )}
                        </td>

                        {/* Col 7: Incentive Earned */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span
                            className={`font-black text-sm ${
                              agent.earnedIncentive > 0 ? "text-emerald-600" : "text-gray-400"
                            }`}
                          >
                            ₹{agent.earnedIncentive.toLocaleString()}
                          </span>
                        </td>

                        {/* Col 8: Status */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {isGoalAchieved ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Goal Achieved
                            </span>
                          ) : agent.currentTier >= 1 ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 inline-flex items-center gap-1">
                              <TrendingUp className="w-3 h-3 text-blue-600" />
                              On Track
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" />
                              In Progress
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer Summary */}
          {!loading && filteredAgents.length > 0 && (
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-2">
              <span>
                Showing <strong className="text-gray-900">{filteredAgents.length}</strong> active personnel
              </span>
              <div className="flex items-center gap-4">
                <span>
                  Delivered Total:{" "}
                  <strong className="text-gray-900">
                    {filteredAgents.reduce((sum, a) => sum + a.deliveredQuantity, 0).toLocaleString()} trays
                  </strong>
                </span>
                <span>
                  Total Incentive:{" "}
                  <strong className="text-emerald-700">
                    ₹{filteredAgents.reduce((sum, a) => sum + a.earnedIncentive, 0).toLocaleString()}
                  </strong>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
