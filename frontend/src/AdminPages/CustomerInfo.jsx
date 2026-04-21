import React, { useEffect, useState } from "react";
import axios from "axios";
import { ADMIN_PATH } from "../constant";
import { FaTrash, FaEdit } from "react-icons/fa";
import { FiEdit2 } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

const PAGE_SIZE = 15;

const CustomerInfo = () => {
  const [customers, setCustomers] = useState([]);
  const [zones, setZones] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingCustomer, setEditingCustomer] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);

  const [assigningZoneId, setAssigningZoneId] = useState(null);
  const [editingZoneId, setEditingZoneId] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    business: "",
    phone: "",
  });

  const [sortOption, setSortOption] = useState("name");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);

  const navigate = useNavigate();

  //  LOAD 

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    setLoading(true);

    try {
      await Promise.all([
        fetchCustomers({ page: 1, sortBy: sortOption }),
        fetchZones(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async ({ page = 1, sortBy } = {}) => {
    setPageLoading(true);

    try {
      const res = await axios.get(`${ADMIN_PATH}/user-info`, {
        params: {
          limit: PAGE_SIZE,
          page,
          sortBy: sortBy || sortOption,
        },
      });

      const payload = res.data || {};
      const responseCustomers = Array.isArray(payload)
        ? payload
        : payload.customers || [];
      const serverHasNextPage = Boolean(payload?.pagination?.hasNextPage);
      const serverTotalPagesRaw = Number(payload?.pagination?.totalPages);
      const serverCurrentPageRaw = Number(payload?.pagination?.currentPage);
      const serverTotalPages =
        Number.isFinite(serverTotalPagesRaw) && serverTotalPagesRaw > 0
          ? Math.floor(serverTotalPagesRaw)
          : 1;
      const resolvedCurrentPage =
        Number.isFinite(serverCurrentPageRaw) && serverCurrentPageRaw > 0
          ? Math.floor(serverCurrentPageRaw)
          : page;
      const minimumExpectedPages = serverHasNextPage
        ? resolvedCurrentPage + 1
        : resolvedCurrentPage;
      const safeTotalPages = Math.max(serverTotalPages, minimumExpectedPages, 1);

      setError("");
      setCustomers(responseCustomers);
      setCurrentPage(Array.isArray(payload) ? page : resolvedCurrentPage);
      setTotalPages(
        Array.isArray(payload)
          ? Math.max(1, Math.ceil(responseCustomers.length / PAGE_SIZE))
          : safeTotalPages,
      );
      setHasNextPage(Array.isArray(payload) ? false : serverHasNextPage);
    } catch {
      setError("Error fetching customer data");
    } finally {
      setPageLoading(false);
    }
  };

  const handleNextPage = () => {
    if (!hasNextPage || pageLoading || currentPage >= totalPages) return;
    fetchCustomers({ page: currentPage + 1 });
  };

  const handlePrevPage = () => {
    if (currentPage <= 1 || pageLoading) return;

    fetchCustomers({ page: currentPage - 1 });
  };

  const handlePageClick = (pageNumber) => {
    if (pageLoading || pageNumber === currentPage) return;
    fetchCustomers({ page: pageNumber });
  };

  const handleSortChange = async (e) => {
    const nextSortOption = e.target.value;

    setSortOption(nextSortOption);
    setCurrentPage(1);

    await fetchCustomers({
      page: 1,
      sortBy: nextSortOption,
    });
  };

  const fetchZones = async () => {
    const res = await axios.get(`${ADMIN_PATH}/zones`);
    setZones(res.data || []);
  };

  // ZONE

  const addZonePrompt = async () => {
    const name = prompt("Enter new Zone name:");

    if (!name) return;

    await axios.post(`${ADMIN_PATH}/zones/add`, { name });

    setZones((prev) => (prev.includes(name) ? prev : [...prev, name]));

    alert("Zone Added");
  };

  const assignZone = async (id, zone) => {
    if (!zone || assigningZoneId === id) return;

    try {
      setAssigningZoneId(id);

      await axios.post(`${ADMIN_PATH}/customer/status`, {
        id,
        zone,
      });

      await fetchCustomers({
        page: currentPage,
      });
    } finally {
      setAssigningZoneId(null);
    }
  };

  // DELETE

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${ADMIN_PATH}/customer/delete`, {
        data: { id },
      });

      setCustomers((prev) => prev.filter((c) => c.id !== id));

      setDeleteConfirmation(null);
    } catch {
      alert("Delete failed");
    }
  };

  // EDIT 

  const handleEditClick = (customer) => {
    setEditingCustomer(customer);

    setFormData({
      name: customer.name,
      business: customer.business,
      phone: customer.phone,
    });
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleUpdate = async () => {
    try {
      await axios.put(`${ADMIN_PATH}/customer/update`, {
        id: editingCustomer.id,
        ...formData,
      });

      await fetchCustomers({
        page: currentPage,
      });

      setEditingCustomer(null);
    } catch {
      alert("Update failed");
    }
  };

  const sortedCustomers = [...customers].sort((a, b) => {
    if (sortOption === "createdAt") {
      return Number(b?.createdAt || 0) - Number(a?.createdAt || 0);
    }

    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });

  const getPageButtons = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    const normalized = [...pages]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);

    const withEllipsis = [];
    for (let i = 0; i < normalized.length; i += 1) {
      const page = normalized[i];
      const prev = normalized[i - 1];
      if (i > 0 && page - prev > 1) {
        withEllipsis.push(`ellipsis-${prev}`);
      }
      withEllipsis.push(page);
    }

    return withEllipsis;
  };

  const pageButtons = getPageButtons();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">

      {/* HEADER */}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-center items-center justify-center">Customer Details</h1>

        <div className="flex gap-3">

          <select
            value={sortOption}
            onChange={handleSortChange}
            className="border px-3 py-2 rounded"
          >
            <option value="name">Name</option>
            <option value="createdAt">Created Date</option>
          </select>

          <button
            onClick={addZonePrompt}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Add Zone
          </button>

        </div>
      </div>

      {/* TABLE */}

      <div className="overflow-x-auto bg-white shadow rounded">

        <table className="w-full text-sm">

          <thead className="bg-gray-200">

            <tr>
              <th className="p-3 text-left">Image</th>
              <th className="p-3 text-left">Cust ID</th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Business</th>
              <th className="p-3 text-left">Phone</th>
              <th className="p-3 text-left">Zone</th>
              <th className="p-3 text-left">Created</th>
              <th className="p-3 text-left">Action</th>
            </tr>

          </thead>

          <tbody>

            {sortedCustomers.map((c) => (

              <tr
                key={c.id}
                className="border-t hover:bg-gray-50"
                onClick={() =>
                  navigate(`/admin/customer-info/${c.id}`, {
                    state: { customer: c },
                  })
                }
              >

                {/* IMAGE */}

                <td className="p-3">
                  <img
                    src={c.imageUrl}
                    loading="lazy"
                    className="w-10 h-10 rounded-full object-cover"
                  />
                </td>

                <td className="p-3">{c.custid}</td>
                <td className="p-3">{c.name}</td>
                <td className="p-3">{c.business}</td>
                <td className="p-3">{c.phone}</td>

                {/* ZONE */}

                <td
                  className="p-3"
                  onClick={(e) => e.stopPropagation()}
                >

                  {!c.zone || c.zone === "UNASSIGNED" ? (

                    <select
                      disabled={assigningZoneId === c.id}
                      onChange={(e) =>
                        assignZone(c.id, e.target.value)
                      }
                      className="border rounded px-2 py-1"
                    >
                      <option value="">Assign</option>

                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}

                    </select>

                  ) : editingZoneId === c.id ? (

                    <select
                      autoFocus
                      defaultValue={c.zone}
                      onBlur={() => setEditingZoneId(null)}
                      onChange={async (e) => {
                        await assignZone(c.id, e.target.value);
                        setEditingZoneId(null);
                      }}
                      className="border rounded px-2 py-1"
                    >

                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}

                    </select>

                  ) : (

                    <div className="flex items-center gap-2">

                      <span>{c.zone}</span>

                      <button
                        onClick={() =>
                          setEditingZoneId(c.id)
                        }
                        className="text-gray-500"
                      >
                        <FiEdit2 />
                      </button>

                    </div>
                  )}
                </td>

                <td className="p-3">
                  {new Date(c.createdAt).toLocaleString()}
                </td>

                {/* ACTION */}

                <td
                  className="p-3 flex gap-4"
                  onClick={(e) => e.stopPropagation()}
                >

                  <button
                    onClick={() => handleEditClick(c)}
                  >
                    <FaEdit className="text-blue-500" />
                  </button>

                  <button
                    onClick={() => setDeleteConfirmation(c)}
                  >
                    <FaTrash className="text-red-500" />
                  </button>

                </td>

              </tr>
            ))}

          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">

        <button
          type="button"
          onClick={handlePrevPage}
          disabled={currentPage === 1 || pageLoading}
          className="bg-gray-200 text-gray-800 px-4 py-2 rounded disabled:opacity-50"
        >
          Previous
        </button>

        <div className="flex items-center gap-2">
          {pageButtons.map((pageItem) => {
            if (typeof pageItem === "string") {
              return (
                <span key={pageItem} className="px-2 text-gray-500">
                  ...
                </span>
              );
            }

            const isActive = pageItem === currentPage;

            return (
              <button
                key={pageItem}
                type="button"
                onClick={() => handlePageClick(pageItem)}
                disabled={pageLoading || isActive}
                className={`px-3 py-1 rounded border ${isActive ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-800 border-gray-300"} disabled:opacity-60`}
              >
                {pageItem}
              </button>
            );
          })}

          <span className="text-sm text-gray-700">
            {currentPage}/{totalPages}
            {pageLoading ? " (Loading...)" : ""}
          </span>
        </div>

        <button
          type="button"
          onClick={handleNextPage}
          disabled={!hasNextPage || pageLoading}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          Next
        </button>

      </div>

      {/* EDIT MODAL */}

      {editingCustomer && (

        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">

          <div className="bg-white p-6 rounded-lg w-[400px]">

            <h2 className="text-xl font-bold mb-4">
              Edit Customer
            </h2>

            <input
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className="border p-2 w-full mb-3"
              placeholder="Name"
            />

            <input
              name="business"
              value={formData.business}
              onChange={handleInputChange}
              className="border p-2 w-full mb-3"
              placeholder="Business"
            />

            <input
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              className="border p-2 w-full mb-4"
              placeholder="Phone"
            />

            <div className="flex justify-between">

              <button
                onClick={handleUpdate}
                className="bg-blue-600 text-white px-4 py-2 rounded"
              >
                Update
              </button>

              <button
                onClick={() => setEditingCustomer(null)}
                className="bg-gray-500 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>

            </div>

          </div>

        </div>
      )}

      {/* DELETE MODAL */}

      {deleteConfirmation && (

        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">

          <div className="bg-white p-6 rounded-lg text-center">

            <p className="mb-4">
              Delete {deleteConfirmation.name} ?
            </p>

            <div className="flex gap-4 justify-center">

              <button
                onClick={() =>
                  handleDelete(deleteConfirmation.id)
                }
                className="bg-red-600 text-white px-4 py-2 rounded"
              >
                Delete
              </button>

              <button
                onClick={() => setDeleteConfirmation(null)}
                className="bg-gray-500 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
};

export default CustomerInfo;
