import React, { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import { ADMIN_PATH } from "../constant";
import { getCachedUserInfo } from "../utils/customerInfoClientCache";
import {
  FiPlus, FiEdit2, FiTrash2, FiX, FiMapPin, FiUsers, FiUserCheck, FiTarget,
  FiCalendar, FiCheck, FiAlertCircle, FiChevronRight, FiClock
} from "react-icons/fi";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const hexToRgb = (hex) => {
  if (!hex || !hex.startsWith("#") || hex.length < 7) {
    return { r: 59, g: 130, b: 246 }; // fallback blue
  }
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return { r, g, b };
};

const colorWithAlpha = (hex, alpha) => {
  try {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch {
    return hex;
  }
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function Badge({ active }) {
  return active !== false ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm">
      <FiCheck size={11} /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
      <FiAlertCircle size={11} /> Inactive
    </span>
  );
}

function RouteCard({ route, color }) {
  return (
    <div
      className="flex items-center justify-between px-3.5 py-3 rounded-xl bg-white border border-gray-100/80 shadow-sm hover:shadow transition-all group"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-xs"
          style={{ backgroundColor: color }}
        >
          <FiMapPin size={13} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-800 truncate">{route.name}</p>
          {route.description ? (
            <p className="text-xs text-gray-500 truncate">{route.description}</p>
          ) : (
            <p className="text-xs text-gray-400 italic">No description</p>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-2 text-xs text-gray-500 font-medium">
        <div className="text-right">
          <span className="text-[11px] text-gray-400 mr-0.5">Cust:</span>
          <span className="font-bold text-gray-700">{route.customerCount || 0}</span>
        </div>
        <span className="text-gray-200">|</span>
        <div className="text-right">
          <span className="text-[11px] text-gray-400 mr-0.5">Achieved:</span>
          <span className="font-bold text-emerald-600">{route.potentialAchieved || 0}</span>
          <span className="text-[10px] text-emerald-700 font-bold ml-1">
            ({route.peakPotential > 0 ? Math.round(((route.potentialAchieved || 0) / route.peakPotential) * 100) : 0}%)
          </span>
        </div>
        <span className="text-gray-200">|</span>
        <div className="text-right">
          <span className="text-[11px] text-gray-400 mr-0.5">Agents:</span>
          <span className="font-bold text-gray-700">{route.agentCount || 0}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Add / Edit Priority Modal ────────────────────────────────────────────────

function PriorityModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    description: initial?.description || "",
    color: initial?.color || "#22c55e",
    active: initial?.active !== false,
    order: initial?.order ?? 1,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handle = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) {
      setError("Priority Name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || "Failed to save priority.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-800">
            {initial ? "Edit Priority Window" : "Add New Priority Window"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <FiX size={20} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Priority Name *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                value={form.name}
                onChange={e => handle("name", e.target.value)}
                placeholder="e.g. Alpha, Priority A, Express"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Display Order</label>
              <input
                type="number"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.order}
                onChange={e => handle("order", Number(e.target.value))}
                min={1}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description / Subtitle</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.description}
              onChange={e => handle("description", e.target.value)}
              placeholder="e.g. Express / Urgent Deliveries"
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="w-10 h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                  value={form.color}
                  onChange={e => handle("color", e.target.value)}
                />
                <span className="text-sm text-gray-600 font-mono">{form.color}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
              <button
                type="button"
                onClick={() => handle("active", !form.active)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  form.active
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                    : "bg-gray-100 text-gray-500 border-gray-200"
                }`}
              >
                {form.active ? "Active" : "Inactive"}
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : initial ? "Update Priority" : "Add Priority"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Route Modal ──────────────────────────────────────────────────────────

function AddRouteModal({ priority, allRoutes, onClose, onSuccess }) {
  const [tab, setTab] = useState("existing"); // "existing" | "new"
  const [selectedRoute, setSelectedRoute] = useState("");
  const [newRouteName, setNewRouteName] = useState("");
  const [newRouteDesc, setNewRouteDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const unassignedRoutes = useMemo(() =>
    allRoutes.filter(r => r.priorityId !== priority.id),
    [allRoutes, priority.id]
  );

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      if (tab === "existing") {
        if (!selectedRoute) {
          setError("Please select a route.");
          setSaving(false);
          return;
        }
        await axios.put(`${ADMIN_PATH}/routes/update`, {
          oldName: selectedRoute,
          newName: selectedRoute,
          priorityId: priority.id,
        });
      } else {
        if (!newRouteName.trim()) {
          setError("Route name is required.");
          setSaving(false);
          return;
        }
        await axios.post(`${ADMIN_PATH}/routes/add`, {
          name: newRouteName.trim(),
          description: newRouteDesc.trim(),
          priorityId: priority.id,
        });
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || "Failed to save route.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-150">
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-gray-100"
          style={{ borderTopColor: priority.color, borderTopWidth: 4 }}
        >
          <div>
            <h2 className="text-base font-bold text-gray-800">Add Route</h2>
            <p className="text-xs text-gray-500">to <span className="font-semibold" style={{ color: priority.color }}>{priority.name}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><FiX size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 bg-gray-50/50">
          {["existing", "new"].map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); }}
              className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
                tab === t
                  ? "border-b-2 bg-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              style={tab === t ? { borderBottomColor: priority.color, color: priority.color } : {}}
            >
              {t === "existing" ? "Existing Route" : "Create Route"}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 space-y-3">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          )}
          {tab === "existing" ? (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Select Route</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                value={selectedRoute}
                onChange={e => setSelectedRoute(e.target.value)}
              >
                <option value="">Choose a route…</option>
                {unassignedRoutes.map(r => (
                  <option key={r.id || r.name} value={r.name}>{r.name}{r.description ? ` — ${r.description}` : ""}</option>
                ))}
              </select>
              {unassignedRoutes.length === 0 && (
                <p className="text-xs text-gray-400 mt-2">All routes are already assigned to this priority.</p>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Route Name *</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  value={newRouteName}
                  onChange={e => setNewRouteName(e.target.value)}
                  placeholder="e.g. R0042"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  value={newRouteDesc}
                  onChange={e => setNewRouteDesc(e.target.value)}
                  placeholder="e.g. Koramangala 6th Block"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 font-medium">Cancel</button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg shadow-sm transition-colors disabled:opacity-50"
            style={{ backgroundColor: priority.color }}
          >
            {saving ? "Saving…" : tab === "existing" ? "Assign Route" : "Create & Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Calendar Modal ───────────────────────────────────────────────────────────

function CalendarModal({ priorities, routes, onClose }) {
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <FiCalendar className="text-blue-600" size={20} />
            <h2 className="text-lg font-bold text-gray-800">Priority Route Delivery Calendar</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><FiX size={20} /></button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-7 gap-2 mb-3">
            {DAY_LABELS.map(d => (
              <div key={d} className="text-center text-xs font-bold text-gray-500 uppercase tracking-wide">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {DAYS.map((day, i) => {
              const dayRoutes = routes.filter(r => r.weeklySchedule && r.weeklySchedule[day]);
              return (
                <div key={day} className="bg-gray-50 rounded-xl p-2.5 min-h-[140px] border border-gray-100">
                  <p className="text-[11px] font-bold text-gray-400 mb-2 text-center uppercase">{DAY_LABELS[i]}</p>
                  <div className="flex flex-col gap-1.5">
                    {dayRoutes.length === 0 ? (
                      <p className="text-[10px] text-gray-300 text-center mt-3">—</p>
                    ) : dayRoutes.map(r => {
                      const color = r.priority?.color || "#6b7280";
                      return (
                        <div
                          key={r.id || r.name}
                          className="text-[10px] font-semibold rounded px-1.5 py-1 text-white truncate shadow-2xs"
                          style={{ backgroundColor: color }}
                          title={`${r.name}${r.description ? ` (${r.description})` : ""}`}
                        >
                          {r.name}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {routes.filter(r => r.weeklySchedule).length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <FiClock size={36} className="mx-auto mb-2 opacity-40 text-blue-500" />
              <p className="text-sm font-medium text-gray-600">Weekly Route Schedules Overview</p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                Customer delivery schedules configured in Route Management automatically display active days here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────

function DeleteConfirm({ priority, onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <FiTrash2 className="text-red-500" size={18} />
          </div>
          <div>
            <h3 className="font-bold text-gray-800">Delete {priority.name}?</h3>
            <p className="text-xs text-gray-500">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-5">
          All routes assigned to this priority will become <strong>Unassigned (None)</strong>.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 font-medium cursor-pointer">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Deleting…" : "Delete Priority"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Priority Column ──────────────────────────────────────────────────────────

function getCustomerPeakPotential(customer) {
  if (!customer) return 0;
  const raw = customer.Peak_Potential || customer.potential;
  if (typeof raw === "number" && raw > 0) return raw;
  if (typeof raw === "string") {
    const num = Number(raw.replace(/[^\d.]/g, ""));
    if (Number.isFinite(num) && num > 0) return num;
  }
  const last8Days = customer.last8Days || {};
  let maxTrays = 0;
  Object.values(last8Days).forEach((entry) => {
    if (!entry) return;
    const status = String(typeof entry === "string" ? entry : entry?.status || "").trim().toLowerCase();
    if (status !== "delivered") return;
    const trays = Number(entry.traysDelivered ?? entry.trays ?? entry.quantity ?? entry?.deliveredTrays ?? 0);
    if (Number.isFinite(trays) && trays > maxTrays) maxTrays = trays;
  });
  return maxTrays;
}

function PriorityColumn({ priority, routes, onEdit, onDelete, onAddRoute }) {
  const color = priority.color || "#3b82f6";
  const bgLight = colorWithAlpha(color, 0.04);
  const bgMed   = colorWithAlpha(color, 0.12);

  const agentSet = new Set(routes.flatMap(r => r.agents || []));
  const agentCount = agentSet.size || routes.reduce((s, r) => s + (r.agentCount || 0), 0);
  const totalCustomers = routes.reduce((s, r) => s + (r.customerCount || 0), 0);
  const totalPotentialAchieved = routes.reduce((s, r) => s + (r.potentialAchieved || 0), 0);
  const totalPeakPotential = routes.reduce((s, r) => s + (r.peakPotential || 0), 0);
  const totalLastWeekPotential = routes.reduce((s, r) => s + (r.lastWeekPotential || 0), 0);

  const achievementPercentage = totalPeakPotential > 0
    ? Math.round((totalPotentialAchieved / totalPeakPotential) * 100)
    : 0;

  const wowPercentage = totalLastWeekPotential === 0
    ? (totalPotentialAchieved > 0 ? 100 : 0)
    : (((totalPotentialAchieved - totalLastWeekPotential) / totalLastWeekPotential) * 100).toFixed(1);

  return (
    <div
      className="flex flex-col h-[520px] rounded-2xl border shadow-sm bg-white overflow-hidden w-full transition-all hover:shadow-md"
      style={{ borderColor: colorWithAlpha(color, 0.35) }}
    >
      {/* Column top header */}
      <div className="p-4 flex-shrink-0" style={{ backgroundColor: bgLight, borderBottom: `1px solid ${colorWithAlpha(color, 0.18)}` }}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <h3 className="font-bold text-gray-900 text-base leading-tight truncate" title={priority.name}>{priority.name}</h3>
            <Badge active={priority.active} />
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center shadow-2xs"
              style={{ backgroundColor: colorWithAlpha(color, 0.15), color }}
              title="Priority window status"
            >
              <FiClock size={14} />
            </div>
            <button
              onClick={() => onEdit(priority)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/80 transition-all cursor-pointer"
              title="Edit priority"
            >
              <FiEdit2 size={13} />
            </button>
            <button
              onClick={() => onDelete(priority)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-white/80 transition-all cursor-pointer"
              title="Delete priority"
            >
              <FiTrash2 size={13} />
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500 mb-3 truncate">{priority.description || "Priority delivery window"}</p>

        {/* Stats card */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white border border-gray-100 shadow-2xs min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bgMed, color }}>
              <FiMapPin size={13} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-400 font-medium truncate">Total Routes</p>
              <p className="text-sm sm:text-base font-bold text-gray-800 leading-tight">{routes.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white border border-gray-100 shadow-2xs min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bgMed, color }}>
              <FiUsers size={13} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-400 font-medium truncate">Total Customers</p>
              <p className="text-sm sm:text-base font-bold text-gray-800 leading-tight">{totalCustomers}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white border border-gray-100 shadow-2xs min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bgMed, color }}>
              <FiUserCheck size={13} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-gray-400 font-medium truncate">Assigned Agents</p>
              <p className="text-sm sm:text-base font-bold text-gray-800 leading-tight">{agentCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white border border-gray-100 shadow-2xs min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bgMed, color }}>
              <FiTarget size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-gray-400 font-medium truncate">Potential Achieved</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm sm:text-base font-bold text-emerald-600 leading-tight">
                  {totalPotentialAchieved} <span className="text-[10px] text-gray-400 font-normal">trays</span>
                </p>
                <span
                  className="text-[11px] font-bold px-1.5 py-0.5 rounded-md leading-none inline-flex items-center"
                  style={{
                    backgroundColor: achievementPercentage >= 100 ? '#ecfdf5' : achievementPercentage >= 70 ? '#fffbeb' : '#fef2f2',
                    color: achievementPercentage >= 100 ? '#059669' : achievementPercentage >= 70 ? '#d97706' : '#dc2626',
                  }}
                  title={totalPeakPotential > 0 ? `Target Peak: ${totalPeakPotential} trays` : `Target Peak: ${totalCustomers * 10} trays`}
                >
                  {achievementPercentage}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Routes list section - internal scroll */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-gray-50/40 min-h-0">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1">Routes ({routes.length})</p>
        {routes.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl bg-white/60">
            <FiMapPin size={24} className="mx-auto mb-1.5 opacity-25" style={{ color }} />
            <p className="text-xs font-semibold text-gray-500">No routes in this window</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Click "+ Add Route" below to assign</p>
          </div>
        ) : (
          routes.map(route => (
            <RouteCard key={route.id || route.name} route={route} color={color} />
          ))
        )}
      </div>

      {/* Add Route button */}
      <div className="p-3.5 bg-white border-t border-gray-100 flex-shrink-0">
        <button
          onClick={() => onAddRoute(priority)}
          disabled={priority.active === false}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold border-2 border-dashed transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          style={{
            color,
            borderColor: colorWithAlpha(color, 0.4),
            backgroundColor: "transparent",
          }}
          onMouseEnter={e => { if (priority.active !== false) e.currentTarget.style.backgroundColor = bgLight; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <FiPlus size={16} />
          Add Route
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PriorityWindow() {
  const [priorities, setPriorities] = useState([]);
  const [routes, setRoutes]         = useState([]);
  const [agents, setAgents]         = useState([]);
  const [customers, setCustomers]   = useState([]);
  const [categoryPeaks, setCategoryPeaks] = useState({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // Modals
  const [priorityModal, setPriorityModal] = useState(null); // null | { mode: "add" | "edit", data? }
  const [addRouteFor, setAddRouteFor]     = useState(null); // priority object
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [calendarOpen, setCalendarOpen]   = useState(false);

  // ── Single API Call (silent background sync support) ─────────────────────────

  const loadData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const [dashRes, agentsRes, userInfoData, peakRes] = await Promise.all([
        axios.get(`${ADMIN_PATH}/priority-dashboard`),
        axios.get(`${ADMIN_PATH}/get-del-partner`).catch(() => ({ data: [] })),
        getCachedUserInfo().catch(() => ({ customers: [] })),
        axios.get(`${ADMIN_PATH}/category-peak-potentials`).catch(() => ({ data: {} })),
      ]);
      setPriorities(dashRes.data?.priorities || []);
      setRoutes(dashRes.data?.routes || []);
      setAgents(agentsRes.data || []);
      setCategoryPeaks(peakRes.data || {});

      const rawCustomers = Array.isArray(userInfoData?.customers)
        ? userInfoData.customers
        : Array.isArray(userInfoData)
          ? userInfoData
          : [];
      setCustomers(rawCustomers);
    } catch (e) {
      console.error("PriorityWindow load error:", e);
      if (showSpinner) {
        setError(e.response?.data?.message || e.message || "Failed to connect to backend server.");
      }
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const todayDate = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }, []);

  const lastWeekDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }, []);

  // Build agent-count per route from agents list
  const agentCountByRoute = useMemo(() => {
    const map = {};
    agents.forEach(agent => {
      if (!agent.route) return;
      agent.route.split(",").map(r => r.trim()).filter(Boolean).forEach(routeName => {
        map[routeName] = (map[routeName] || 0) + 1;
      });
    });
    return map;
  }, [agents]);

  // Build customer-count, today's potential-achieved, and last-week potential per route
  const routeStatsFromCustomers = useMemo(() => {
    const custMap = {};
    const potMap = {};
    const custPeakMap = {};
    const lastWeekPotMap = {};

    customers.forEach(customer => {
      const route = (customer.route || customer.routeName || "").toString().trim();
      if (!route) return;

      custMap[route] = (custMap[route] || 0) + 1;
      custMap[route.toLowerCase()] = (custMap[route.toLowerCase()] || 0) + 1;

      // Customer Peak Potential sum
      const cPeak = getCustomerPeakPotential(customer);
      custPeakMap[route] = (custPeakMap[route] || 0) + cPeak;
      custPeakMap[route.toLowerCase()] = (custPeakMap[route.toLowerCase()] || 0) + cPeak;

      const last8Days = customer.last8Days || {};

      // Today's delivered trays
      const todayEntry = last8Days[todayDate];
      if (todayEntry) {
        const status = String(typeof todayEntry === "string" ? todayEntry : todayEntry?.status || "").trim().toLowerCase();
        if (status === "delivered") {
          const trays = todayEntry.traysDelivered ?? todayEntry.trays ?? todayEntry.quantity ?? todayEntry?.deliveredTrays ?? 0;
          const numTrays = Number(trays);
          if (Number.isFinite(numTrays) && numTrays > 0) {
            potMap[route] = (potMap[route] || 0) + numTrays;
            potMap[route.toLowerCase()] = (potMap[route.toLowerCase()] || 0) + numTrays;
          }
        }
      }

      // Last week's delivered trays (7 days ago)
      const lastWeekEntry = last8Days[lastWeekDate];
      if (lastWeekEntry) {
        const status = String(typeof lastWeekEntry === "string" ? lastWeekEntry : lastWeekEntry?.status || "").trim().toLowerCase();
        if (status === "delivered") {
          const trays = lastWeekEntry.traysDelivered ?? lastWeekEntry.trays ?? lastWeekEntry.quantity ?? lastWeekEntry?.deliveredTrays ?? 0;
          const numTrays = Number(trays);
          if (Number.isFinite(numTrays) && numTrays > 0) {
            lastWeekPotMap[route] = (lastWeekPotMap[route] || 0) + numTrays;
            lastWeekPotMap[route.toLowerCase()] = (lastWeekPotMap[route.toLowerCase()] || 0) + numTrays;
          }
        }
      }
    });

    return {
      customerCountByRoute: custMap,
      customerPeakByRoute: custPeakMap,
      potentialAchievedByRoute: potMap,
      lastWeekPotentialByRoute: lastWeekPotMap,
    };
  }, [customers, todayDate, lastWeekDate]);

  // Group routes by priorityId
  const routesByPriority = useMemo(() => {
    const map = {};
    priorities.forEach(p => { map[p.id] = []; });
    routes.forEach(r => {
      if (r.priorityId && map[r.priorityId]) {
        const rName = (r.name || "").toString().trim();
        const clientCount = routeStatsFromCustomers.customerCountByRoute[rName] ?? routeStatsFromCustomers.customerCountByRoute[rName.toLowerCase()];
        const count = clientCount !== undefined ? clientCount : (r.customerCount || 0);

        const clientPot = routeStatsFromCustomers.potentialAchievedByRoute[rName] ?? routeStatsFromCustomers.potentialAchievedByRoute[rName.toLowerCase()];
        const potAchieved = clientPot !== undefined ? clientPot : (r.potentialAchieved || 0);

        const lastWeekPot = routeStatsFromCustomers.lastWeekPotentialByRoute[rName] ?? routeStatsFromCustomers.lastWeekPotentialByRoute[rName.toLowerCase()] ?? 0;
        const catPeak = Number(categoryPeaks[`ROUTE_${rName.toUpperCase()}`]) || 0;
        const custPeak = routeStatsFromCustomers.customerPeakByRoute[rName] ?? routeStatsFromCustomers.customerPeakByRoute[rName.toLowerCase()] ?? 0;
        const peakPot = Math.max(catPeak, custPeak);

        map[r.priorityId].push({
          ...r,
          customerCount: count,
          potentialAchieved: potAchieved,
          lastWeekPotential: lastWeekPot,
          peakPotential: peakPot,
          agentCount: agentCountByRoute[r.name] || 0,
        });
      }
    });
    return map;
  }, [priorities, routes, agentCountByRoute, routeStatsFromCustomers, categoryPeaks]);

  // ── Priority actions (Silent Background Refresh) ───────────────────────────

  const handleAddPriority = async (form) => {
    await axios.post(`${ADMIN_PATH}/priorities/add`, form);
    await loadData(false);
  };

  const handleEditPriority = async (form) => {
    await axios.put(`${ADMIN_PATH}/priorities/update`, {
      id: priorityModal.data.id,
      ...form,
    });
    await loadData(false);
  };

  const handleDeletePriority = async () => {
    setDeleteLoading(true);
    try {
      await axios.delete(`${ADMIN_PATH}/priorities/delete`, {
        data: { id: deleteTarget.id },
      });
      setDeleteTarget(null);
      await loadData(false);
    } catch (e) {
      alert(e.response?.data?.message || "Failed to delete priority.");
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full bg-slate-50">
      {/* Top Header */}
      <div className="px-8 pt-6 pb-5 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1 font-medium">
              <a href="/admin/routes" className="hover:text-blue-600 transition-colors">Route Management</a>
              <FiChevronRight size={11} />
              <span className="text-gray-700 font-semibold">Priority Window</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Priority Window</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage and view priority delivery windows for each route.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCalendarOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-xs cursor-pointer bg-white"
            >
              <FiCalendar className="text-blue-600" size={16} />
              View Calendar
            </button>
            <button
              onClick={() => setPriorityModal({ mode: "add" })}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-all cursor-pointer"
            >
              <FiPlus size={16} />
              Add Priority
            </button>
          </div>
        </div>
      </div>

      {/* Kanban Board Columns Container - 3 in 1 Row Grid */}
      <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-80">
            <div className="flex flex-col items-center gap-3">
              <div className="w-9 h-9 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm font-medium text-gray-500">Loading priority windows…</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-80">
            <div className="text-center max-w-md bg-white p-8 rounded-2xl border border-red-100 shadow-sm">
              <FiAlertCircle size={40} className="mx-auto mb-3 text-red-500" />
              <p className="text-base text-gray-800 font-bold">Backend Server Offline</p>
              <p className="text-xs text-gray-500 mt-1 mb-4 leading-relaxed">
                Could not connect to the backend server at <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">{ADMIN_PATH}</code>. Please make sure the backend server is running (<code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">npm run dev</code> in backend).
              </p>
              <button
                onClick={loadData}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
              >
                Retry Connection
              </button>
            </div>
          </div>
        ) : priorities.length === 0 ? (
          <div className="flex items-center justify-center h-80">
            <div className="text-center">
              <FiMapPin size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="text-base text-gray-600 font-semibold">No priority windows created yet</p>
              <p className="text-sm text-gray-400 mt-1">Click "Add Priority" to create your first delivery window.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-6 w-full">
            {priorities.map(priority => (
              <PriorityColumn
                key={priority.id}
                priority={priority}
                routes={routesByPriority[priority.id] || []}
                onEdit={p => setPriorityModal({ mode: "edit", data: p })}
                onDelete={p => setDeleteTarget(p)}
                onAddRoute={p => setAddRouteFor(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {priorityModal && (
        <PriorityModal
          initial={priorityModal.mode === "edit" ? priorityModal.data : null}
          onClose={() => setPriorityModal(null)}
          onSave={priorityModal.mode === "add" ? handleAddPriority : handleEditPriority}
        />
      )}

      {addRouteFor && (
        <AddRouteModal
          priority={addRouteFor}
          allRoutes={routes}
          onClose={() => setAddRouteFor(null)}
          onSuccess={() => loadData(false)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          priority={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeletePriority}
          loading={deleteLoading}
        />
      )}

      {calendarOpen && (
        <CalendarModal
          priorities={priorities}
          routes={routes}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </div>
  );
}
