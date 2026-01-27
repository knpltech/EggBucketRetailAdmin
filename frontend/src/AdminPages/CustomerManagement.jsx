import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FiUsers } from "react-icons/fi";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { ADMIN_PATH } from "../constant";

// CATEGORY NAMES
const TABS = [
  "ALL",
  "ONBOARDING",
  "REGULAR",
  "FOLLOW-UP",
  "RETENTION",
  "Time Constraint",
  "OTHERS",
];
const CATEGORIES = [
  "ONBOARDING",
  "REGULAR",
  "FOLLOW-UP",
  "RETENTION",
  "Time Constraint",
  "OTHERS",
];

export default function CustomerManagement() {
  const [customers, setCustomers] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ALL");
  const [sortBy, setSortBy] = useState("name");

  const [payingId, setPayingId] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [assigningZoneId, setAssigningZoneId] = useState(null);
  const [savingRemarkId, setSavingRemarkId] = useState(null);

  const isAll = activeTab === "ALL";
  const canDownloadExcel = activeTab !== "ALL";

  // ================= LOAD =================
  const loadCustomers = async () => {
    const res = await axios.get(`${ADMIN_PATH}/user-info`);
    setCustomers(Array.isArray(res.data) ? res.data : []);
  };

  const loadZones = async () => {
    const res = await axios.get(`${ADMIN_PATH}/zones`);
    setZones(res.data || []);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadCustomers(), loadZones()]);
      setLoading(false);
    };
    init();
  }, []);

  // ================= FILTER + SORT =================
const filtered = useMemo(() => {
  let list;

  if (activeTab === "ALL") {
    list = [...customers];
  } else if (activeTab === "ONBOARDING") {
    list = customers.filter(
      (c) =>
        !c.category ||
        c.category === "" ||
        c.category === null ||
        c.category === "ONBOARDING"
    );
  } else {
    list = customers.filter((c) => c.category === activeTab);
  }

  if (sortBy === "name") {
    list.sort((a, b) =>
      getName(a).toLowerCase().localeCompare(getName(b).toLowerCase())
    );
  } else if (sortBy === "remarks") {
    const withRemarks = list.filter(
      (c) => c.remarks && c.remarks.trim() !== ""
    );

    const withoutRemarks = list.filter(
      (c) => !c.remarks || c.remarks.trim() === ""
    );

    // Sort customers WITH remarks A-Z
    withRemarks.sort((a, b) =>
      a.remarks.trim().toLowerCase().localeCompare(
        b.remarks.trim().toLowerCase()
      )
    );

    // Sort customers WITHOUT remarks by name
    withoutRemarks.sort((a, b) =>
      getName(a).toLowerCase().localeCompare(getName(b).toLowerCase())
    );

    // First show customers with remarks, then without remarks
    return [...withRemarks, ...withoutRemarks];
  } else {
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  return list;
}, [customers, activeTab, sortBy]);

  // ================= ACTIONS =================
  const changeCategory = async (id, category) => {
    if (!category || movingId === id) return;
    try {
      setMovingId(id);
      await axios.post(`${ADMIN_PATH}/customer/status`, { id, category });
      await loadCustomers();
    } finally {
      setMovingId(null);
    }
  };

  const assignZone = async (id, zone) => {
    if (!zone || assigningZoneId === id) return;
    try {
      setAssigningZoneId(id);
      await axios.post(`${ADMIN_PATH}/customer/status`, { id, zone });
      await loadCustomers();
    } finally {
      setAssigningZoneId(null);
    }
  };

  const markPaidOnce = async (c) => {
    if (c.paid || payingId === c.id) return;
    try {
      setPayingId(c.id);
      await axios.post(`${ADMIN_PATH}/customer/status`, {
        id: c.id,
        paid: true,
      });
      await loadCustomers();
    } finally {
      setPayingId(null);
    }
  };

  const updateRemarkLocal = (id, value) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, remarks: value } : c))
    );
  };

  const saveRemarks = async (id, remarks) => {
    try {
      setSavingRemarkId(id);
      await axios.post(`${ADMIN_PATH}/customer/status`, { id, remarks });
      await loadCustomers();
    } finally {
      setSavingRemarkId(null);
    }
  };

  // ================= RESET =================
  const resetAll = async () => {
    if (!window.confirm("This will reset ALL customers and zones. Continue?"))
      return;
    await axios.post(`${ADMIN_PATH}/customer/reset-all`);
    setZones([]);
    await loadCustomers();
    alert("Reset done");
  };

  // ================= ADD ZONE =================
  const addZonePrompt = async () => {
    const name = prompt("Enter new Zone name:");
    if (!name) return;
    await axios.post(`${ADMIN_PATH}/zones/add`, { name });
    await loadZones();
    alert("Zone added");
  };

  // ================= EXCEL =================
  const downloadExcel = () => {
    if (!canDownloadExcel) return;

    const data = filtered.map((c) => ({
      "Customer ID": c.custid || c.id,
      Name: getName(c),
      Zone: c.zone || "",
      Remarks: c.remarks || "",
      Paid: c.paid ? "Yes" : "No",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab);
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf]), `${activeTab}.xlsx`);
  };

  // ================= UI =================
  return (
    <div className="min-h-screen bg-gray-50 p-6 w-full">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Customer Management</h1>

        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500 flex items-center gap-4">
          <FiUsers className="text-3xl text-blue-500" />
          <div>
            <p className="text-sm text-gray-600">Total Customers</p>
            <p className="text-2xl font-bold">
              {loading ? "…" : filtered.length}
            </p>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border rounded-lg px-4 py-2"
          >
            <option value="name">Customer Name</option>
            <option value="date">Created Date</option>
            { !isAll &&<option value="remarks">Remarks A-Z</option>}
          </select>

          {isAll && (
            <button
              onClick={addZonePrompt}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg"
            >
              Add Zone
            </button>
          )}

          {canDownloadExcel && (
            <button
              onClick={downloadExcel}
              className="bg-green-600 text-white px-4 py-2 rounded-lg"
            >
              Download {activeTab} Excel
            </button>
          )}

          <button
            onClick={resetAll}
            className="bg-red-600 text-white px-4 py-2 rounded-lg"
          >
            Reset All
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-xl border ${
              activeTab === t ? "bg-black text-white" : "bg-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm table-fixed text-center">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3">Image</th>
              <th className="p-3">Customer ID</th>
              <th className="p-3">Name</th>
              <th className="p-3">Zone</th>
              {isAll && <th className="p-3">Category</th>}
              {isAll && <th className="p-3">Paid</th>}
              {!isAll && <th className="p-3">Remarks</th>}
              <th className="p-3">Move</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-3">
                  <img
                    src={getImage(c)}
                    className="w-10 h-10 rounded-full object-cover mx-auto"
                  />
                </td>
                <td className="p-3 font-medium">{c.custid || c.id}</td>
                <td className="p-3 font-medium">{getName(c)}</td>

                {/* ZONE */}
                <td className="p-3">
                  {isAll ? (
                    c.zone ? (
                      c.zone
                    ) : (
                      <select
                        disabled={assigningZoneId === c.id}
                        className="border rounded-lg px-3 py-2 disabled:opacity-50"
                        defaultValue=""
                        onChange={(e) => assignZone(c.id, e.target.value)}
                      >
                        <option value="">Assign</option>
                        {zones.map((z) => (
                          <option key={z} value={z}>
                            {z}
                          </option>
                        ))}
                      </select>
                    )
                  ) : (
                    c.zone || "UNASSIGNED"
                  )}
                </td>

                {/* CATEGORY + PAID ONLY IN ALL */}
                {isAll && (
                  <>
                    <td className="p-3">{c.category || "UNASSIGNED"}</td>
                    <td className="p-3">
                      <button
                        disabled={c.paid || payingId === c.id}
                        onClick={() => markPaidOnce(c)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          c.paid
                            ? "bg-green-600 text-white"
                            : payingId === c.id
                              ? "bg-red-400 text-white opacity-60 cursor-not-allowed"
                              : "bg-red-500 text-white"
                        }`}
                      >
                        {c.paid
                          ? "PAID"
                          : payingId === c.id
                            ? "PROCESSING..."
                            : "UNPAID"}
                      </button>
                    </td>
                  </>
                )}

                {/* REMARKS IN NON-ALL */}
                {!isAll && (
                  <td className="p-3">
                    <input
                      value={c.remarks || ""}
                      disabled={savingRemarkId === c.id}
                      onChange={(e) =>updateRemarkLocal(c.id, e.target.value)}
                      onBlur={(e) => saveRemarks(c.id, e.target.value)}
                      className="border rounded-lg px-3 py-2 w-full disabled:opacity-50"
                    />
                  </td>
                )}

                {/* MOVE */}
                <td className="p-3">
                  {isAll ? (
                    !c.category && (
                      <select
                        disabled={movingId === c.id}
                        className="border rounded-lg px-3 py-2 disabled:opacity-50"
                        defaultValue=""
                        onChange={(e) => changeCategory(c.id, e.target.value)}
                      >
                        <option value="">Move</option>
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    )
                  ) : (
                    <select
                      disabled={movingId === c.id}
                      className="border rounded-lg px-3 py-2 disabled:opacity-50"
                      defaultValue=""
                      onChange={(e) => changeCategory(c.id, e.target.value)}
                    >
                      <option value="">Move</option>
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// HELPERS
function getName(c) {
  return c.name || c.customerName || "Unknown";
}

function getImage(c) {
  return c.imageUrl || c.image || "https://via.placeholder.com/48";
}
