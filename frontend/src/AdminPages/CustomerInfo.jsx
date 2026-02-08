import React, { useEffect, useState } from "react";
import axios from "axios";
import { ADMIN_PATH } from "../constant";
import { FaTrash, FaEdit } from "react-icons/fa";
import { FiEdit2 } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

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

  const navigate = useNavigate();

  //  LOAD 

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    setLoading(true);

    try {
      await Promise.all([fetchCustomers(), fetchZones()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await axios.get(`${ADMIN_PATH}/user-info`);
      setCustomers(res.data || []);
    } catch {
      setError("Error fetching customer data");
    }
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

    await fetchZones();

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

      await fetchCustomers();
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

      await fetchCustomers();

      setEditingCustomer(null);
    } catch {
      alert("Update failed");
    }
  };

  // SORT 

  const sortedCustomers = [...customers].sort((a, b) => {
    if (sortOption === "name") {
      return a.name.localeCompare(b.name);
    }

    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  

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
            onChange={(e) => setSortOption(e.target.value)}
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
                  navigate(`/admin/customer-info/${c.id}`)
                }
              >

                {/* IMAGE */}

                <td className="p-3">
                  <img
                    src={c.imageUrl}
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
