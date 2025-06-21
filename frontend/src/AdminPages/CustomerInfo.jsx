import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ADMIN_PATH } from '../constant';
import { FaTrash, FaEdit } from 'react-icons/fa';

const CustomerInfo = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [formData, setFormData] = useState({ name: '', business: '', phone: '' });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const res = await axios.get(`${ADMIN_PATH}/user-info`);
      setCustomers(res.data);
    } catch (err) {
      console.error('Failed to fetch customer data:', err);
      setError('Error fetching customer data');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${ADMIN_PATH}/customer/delete`, { data: { id } });
      setCustomers(customers.filter((customer) => customer.id !== id));
      setDeleteConfirmation(null);
    } catch (err) {
      console.error('Failed to delete customer:', err);
      alert('Error deleting customer.');
    }
  };

  const handleEditClick = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      business: customer.business,
      phone: customer.phone,
    });
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleUpdate = async () => {
    try {
      await axios.put(`${ADMIN_PATH}/customer/update`, {
        id: editingCustomer.id,
        ...formData,
      });
      setCustomers(
        customers.map((customer) =>
          customer.id === editingCustomer.id ? { ...customer, ...formData } : customer
        )
      );
      setEditingCustomer(null);
    } catch (err) {
      console.error('Failed to update customer:', err);
      alert('Error updating customer.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600 text-lg">Loading customer data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-500 text-lg">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen relative">
      <h1 className="text-3xl font-bold mb-6 text-center">Customer Details</h1>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg shadow">
          <thead className="bg-gray-200 text-gray-700">
            <tr>
              <th className="py-3 px-4 text-left">Image</th>
              <th className="py-3 px-4 text-left">Name</th>
              <th className="py-3 px-4 text-left">Business</th>
              <th className="py-3 px-4 text-left">Phone</th>
              <th className="py-3 px-4 text-left">Created At</th>
              <th className="py-3 px-4 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-t hover:bg-gray-50">
                <td className="py-2 px-4">
                  <img
                    src={customer.imageUrl}
                    alt={customer.name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                </td>
                <td className="py-2 px-4 text-xs">{customer.name}</td>
                <td className="py-2 px-4 text-xs">{customer.business}</td>
                <td className="py-2 px-4 text-xs">{customer.phone}</td>
                <td className="py-2 px-4 text-xs text-gray-600">
                  {new Date(customer.createdAt).toLocaleString()}
                </td>
                <td className="py-2 px-4 flex gap-2">
                  <button onClick={() => handleEditClick(customer)}>
                    <FaEdit className="text-blue-500 hover:text-blue-700" />
                  </button>
                  <button onClick={() => setDeleteConfirmation(customer)}>
                    <FaTrash className="text-red-500 hover:text-red-700" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-gradient-to-r from-blue-100 to-purple-200 p-8 rounded-2xl shadow-2xl w-6/12 max-w-lg animate-fade-in">
            <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Edit Customer</h2>
            <div className="flex flex-col gap-4">
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="text-sm border border-purple-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Customer Name"
              />
              <input
                type="text"
                name="business"
                value={formData.business}
                onChange={handleInputChange}
                className="text-sm border border-purple-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Business Name"
              />
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className="text-sm border border-purple-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Phone Number"
              />
              <div className="flex justify-between mt-6">
                <button
                  onClick={handleUpdate}
                  className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition"
                >
                  Update
                </button>
                <button
                  onClick={() => setEditingCustomer(null)}
                  className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-purple-200 p-6 rounded-2xl shadow-2xl w-11/12 max-w-md text-center">
            <h2 className="text-md font-semibold mb-4 text-gray-800">
              Are you sure you want to delete <span className="text-red-500">{deleteConfirmation.name}</span>?
            </h2>
            <div className="flex justify-center gap-6 mt-6">
              <button
                onClick={() => handleDelete(deleteConfirmation.id)}
                className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition"
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setDeleteConfirmation(null)}
                className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition"
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
