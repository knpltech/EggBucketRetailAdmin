import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { FiChevronDown, FiUsers } from "react-icons/fi";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { ADMIN_PATH } from "../constant";

const TABS = ["ALL", "CATEGORY A", "CATEGORY B", "CATEGORY C", "CATEGORY D", "CATEGORY E"];
const CATEGORIES = ["CATEGORY A", "CATEGORY B", "CATEGORY C", "CATEGORY D", "CATEGORY E"];

export default function CustomerManagement() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");

  // ================= LOAD =================
  const loadCustomers = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${ADMIN_PATH}/user-info`);
      setCustomers(Array.isArray(res.data) ? res.data : []);
      setError("");
    } catch {
      setError("Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // ================= FILTER =================
  const filtered = useMemo(() => {
    if (activeTab === "ALL") return customers;
    return customers.filter((c) => c.category === activeTab);
  }, [customers, activeTab]);

  // ================= ACTIONS =================
  const changeCategory = async (id, cat) => {
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, category: cat } : c)));
    try {
      setSavingId(id);
      await axios.post(`${ADMIN_PATH}/customer/status`, { id, category: cat });
    } catch {
      alert("Failed to update category");
      loadCustomers();
    } finally {
      setSavingId(null);
    }
  };

  const markPaidOnce = async (c) => {
    if (c.paid) return;
    setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, paid: true } : x)));
    try {
      setSavingId(c.id);
      await axios.post(`${ADMIN_PATH}/customer/status`, { id: c.id, paid: true });
    } catch {
      alert("Failed to update paid");
      loadCustomers();
    } finally {
      setSavingId(null);
    }
  };

  const saveRemarks = async (id, remarks) => {
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, remarks } : c)));
    try {
      setSavingId(id);
      await axios.post(`${ADMIN_PATH}/customer/status`, { id, remarks });
    } catch {
      alert("Failed to save remarks");
      loadCustomers();
    } finally {
      setSavingId(null);
    }
  };

  // RESET 
  const resetAll = async () => {
    if (!window.confirm("This will reset ALL customers. Continue?")) return;
    try {
      setLoading(true);
      await axios.post(`${ADMIN_PATH}/customer/reset-all`);
      await loadCustomers();
      alert("Reset done");
    } catch {
      alert("Reset failed");
    } finally {
      setLoading(false);
    }
  };

  //  EXCEL 
  const downloadExcel = () => {
    if (activeTab === "ALL") return;

    const data = filtered.map((c) => ({
      "Customer ID": c.custid || c.id,
      Name: getName(c),
      Category: c.category || "",
      Remarks: c.remarks || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab);
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf]), `${activeTab}.xlsx`);
  };

  const totalInTab = filtered.length;

  return (
    <div className="min-h-screen bg-gray-50 p-6 w-full max-w-full overflow-x-hidden">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Customer Management</h1>

        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500 flex items-center gap-4">
          <FiUsers className="text-3xl text-blue-500" />
          <div>
            <p className="text-sm text-gray-600">
              {activeTab === "ALL" ? "Total Customers" : `${activeTab} Customers`}
            </p>
            <p className="text-2xl font-bold">{loading ? "…" : totalInTab}</p>
          </div>

          {activeTab !== "ALL" && (
            <button
              onClick={downloadExcel}
              className="ml-4 bg-green-600 text-white px-4 py-2 rounded-lg"
            >
              Download {activeTab} Excel
            </button>
          )}

          <button
            onClick={resetAll}
            className="ml-2 bg-red-600 text-white px-4 py-2 rounded-lg"
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

      {loading && <div>Loading...</div>}
      {error && <div className="text-red-600">{error}</div>}

      {!loading && !error && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-hidden">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-left w-20">Image</th>
                  <th className="p-3 text-left w-40">Customer ID</th>
                  <th className="p-3 text-left">Name</th>
                  {activeTab === "ALL" ? (
                    <>
                      <th className="p-3 text-left w-40">Category</th>
                      <th className="p-3 text-center w-32">Paid</th>
                      <th className="p-3 text-center w-32">Move</th>
                    </>
                  ) : (
                    <>
                      <th className="p-3 text-left">Remarks</th>
                      <th className="p-3 text-center w-32">Move</th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {filtered.map((c) => {
                  const isSaving = savingId === c.id;
                  const showMoveInAll = activeTab === "ALL" && !c.category;
                  const showMoveInCategory = activeTab !== "ALL";

                  return (
                    <tr key={c.id} className="border-t">
                      <td className="p-3">
                        <img
                          src={getImage(c)}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      </td>
                      <td className="p-3 font-medium">{c.custid || c.id}</td>
                      <td className="p-3 font-medium">{getName(c)}</td>

                      {activeTab === "ALL" ? (
                        <>
                          <td className="p-3">{c.category || "UNASSIGNED"}</td>
                          <td className="p-3 text-center">
                            <button
                              disabled={c.paid || isSaving}
                              onClick={() => markPaidOnce(c)}
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                c.paid
                                  ? "bg-green-600 text-white opacity-70"
                                  : "bg-red-500 text-white"
                              }`}
                            >
                              {c.paid ? "PAID" : "UNPAID"}
                            </button>
                          </td>
                          <td className="p-3 text-center">
                            {showMoveInAll && (
                              <Dropdown
                                disabled={isSaving}
                                onSelect={(cat) => changeCategory(c.id, cat)}
                              />
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3">
                            <input
                              defaultValue={c.remarks || ""}
                              disabled={isSaving}
                              onBlur={(e) => saveRemarks(c.id, e.target.value)}
                              className="w-full border rounded-lg px-3 py-2"
                            />
                          </td>
                          <td className="p-3 text-center">
                            {showMoveInCategory && (
                              <Dropdown
                                disabled={isSaving}
                                onSelect={(cat) => changeCategory(c.id, cat)}
                              />
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

//  FLOATING DROPDOWN 
function Dropdown({ onSelect, disabled }) {
  const btnRef = useRef();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const openMenu = () => {
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left });
    setOpen(true);
  };

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("click", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("click", close);
    };
  }, []);

  return (
    <>
      <button
        ref={btnRef}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          openMenu();
        }}
        className="px-3 py-2 border rounded-lg flex items-center gap-2 text-sm"
      >
        Move <FiChevronDown />
      </button>

      {open && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-white border rounded-xl shadow min-w-[160px]"
          onClick={(e) => e.stopPropagation()}
        >
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => {
                onSelect(c);
                setOpen(false);
              }}
              className="block w-full text-left px-4 py-2 hover:bg-gray-100"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// HELPERS 
function getName(c) {
  return c.name || c.customerName || "Unknown";
}

function getImage(c) {
  return c.imageUrl || c.image || "https://via.placeholder.com/48";
}
