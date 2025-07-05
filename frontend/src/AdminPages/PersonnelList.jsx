import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ADMIN_PATH } from '../constant';
import { FaTrash, FaEdit } from 'react-icons/fa'
import { FaToggleOff, FaToggleOn } from 'react-icons/fa6';

const PersonnelList = () => {
  const [deliveryPartners, setDeliveryPartners] = useState([]);
  const [salesPartners, setSalesPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingPartner, setEditingPartner] = useState(null);
  const [editType, setEditType] = useState('');
  const [formData, setFormData] = useState({ name: '', phone: '' });

  const [deletingPartner, setDeletingPartner] = useState(null);
  const [deleteType, setDeleteType] = useState('');

  const [actionMessage, setActionMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const [deliverySearch, setDeliverySearch] = useState('');
  const [salesSearch, setSalesSearch] = useState('');



  useEffect(() => {
    fetchPartners();
  }, []);

  const showMessage = (msg, type = 'success') => {
    setActionMessage(msg);
    setMessageType(type);
    setTimeout(() => {
      setActionMessage('');
      setMessageType('');
    }, 3000);
  };

  const fetchPartners = async () => {
    try {
      const [deliveryRes, salesRes] = await Promise.all([
        axios.get(`${ADMIN_PATH}/get-del-partner`),
        axios.get(`${ADMIN_PATH}/get-sales-partner`),
      ]);
      setDeliveryPartners(deliveryRes.data);
      setSalesPartners(salesRes.data);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch personnel data.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (partner, type) => {
    setEditingPartner(partner);
    setEditType(type);
    setFormData({ name: partner.name, phone: partner.phone });
  };

  const handleDeleteClick = (partner, type) => {
    setDeletingPartner(partner);
    setDeleteType(type);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleUpdate = async () => {
    try {
      const endpoint = editType === 'delivery' ? 'delivery/update' : 'sales/update';
      await axios.put(`${ADMIN_PATH}/${endpoint}`, {
        uid: editingPartner.uid,
        ...formData,
      });
      if (editType === 'delivery') {
        setDeliveryPartners((prev) =>
          prev.map((p) => (p.uid === editingPartner.uid ? { ...p, ...formData } : p))
        );
      } else {
        setSalesPartners((prev) =>
          prev.map((p) => (p.uid === editingPartner.uid ? { ...p, ...formData } : p))
        );
      }
      setEditingPartner(null);
      showMessage(`${editType} partner updated successfully.`, 'success');
    } catch (err) {
      console.error('Error updating partner:', err);
      showMessage('Failed to update partner.', 'error');
    }
  };

  // const handleDelete = async () => {
  //   try {
  //     const endpoint = deleteType === 'delivery' ? 'delivery/delete' : 'sales/delete';
  //     await axios.delete(`${ADMIN_PATH}/${endpoint}`, { data: { id: deletingPartner.uid } });
  //     if (deleteType === 'delivery') {
  //       setDeliveryPartners((prev) => prev.filter((p) => p.uid !== deletingPartner.uid));
  //     } else {
  //       setSalesPartners((prev) => prev.filter((p) => p.uid !== deletingPartner.uid));
  //     }
  //     setDeletingPartner(null);
  //     showMessage(`${deleteType} partner deleted successfully.`, 'success');
  //   } catch (err) {
  //     console.error('Error deleting partner:', err);
  //     showMessage('Failed to delete partner.', 'error');
  //   }
  // };

  const handleToggleDeliveryStatus = async (partner) => {
    try {
      const res = await axios.put(`${ADMIN_PATH}/delivery/toggle/${partner.uid}`);
      const updatedStatus = res.data.active;

      setDeliveryPartners((prev) =>
        prev.map((p) =>
          p.uid === partner.uid ? { ...p, active: updatedStatus } : p
        )
      );
      showMessage(`Delivery partner is now ${updatedStatus ? 'enabled' : 'disabled'}.`, 'success');
    } catch (err) {
      console.error('Error toggling delivery status:', err);
      showMessage('Failed to toggle delivery status.', 'error');
    }
  };

  const handleToggleSalesStatus = async (partner) => {
    try {
      const res = await axios.put(`${ADMIN_PATH}/sales/toggle/${partner.uid}`);
      const updatedStatus = res.data.active;

      setSalesPartners((prev) =>
        prev.map((p) =>
          p.uid === partner.uid ? { ...p, active: updatedStatus } : p
        )
      );
      showMessage(`Sales partner is now ${updatedStatus ? 'enabled' : 'disabled'}.`, 'success');
    } catch (err) {
      console.error('Error toggling sales status:', err);
      showMessage('Failed to toggle sales status.', 'error');
    }
  };


  if (loading) return <div className="text-center py-10 text-xl font-semibold">Loading...</div>;
  if (error) return <div className="text-center py-10 text-red-600 text-xl">{error}</div>;

  const renderDeliveryPartners = () =>
    deliveryPartners
      .filter((partner) => {
        const q = deliverySearch.trim();
        return (
          !q ||
          partner.name.toLowerCase().includes(q) ||
          partner.phone.includes(q)
        );
      })
      .map((partner) => (
        <li
          key={partner.uid}
          className={`flex justify-between items-center p-4 rounded-lg border ${partner.active ? 'border-blue-100 bg-blue-50' : 'border-gray-200 bg-gray-50'
            } transition-all hover:shadow-sm`}
        >
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <span className="font-medium text-gray-800">{partner.name}</span>
              <span className={`text-xs px-2 py-1 rounded-full ${partner.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                {partner.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <div className="flex items-center">
                <span className="w-20 text-gray-500">Phone:</span>
                <span>{partner.phone}</span>
              </div>
              <div className="flex items-center">
                <span className="w-20 text-gray-500">Password:</span>
                <span>{partner.password}</span>
              </div>
            </div>
          </div>
          <div className="flex space-x-3 ml-4">
            <button
              onClick={() => handleEditClick(partner, 'delivery')}
              className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-full transition"
              title="Edit"
            >
              <FaEdit size={16} />
            </button>
            <button
              onClick={() => handleToggleDeliveryStatus(partner)}
              className="p-2 rounded-full transition"
              title={partner.active ? 'Deactivate' : 'Activate'}
            >
              {partner.active ? (
                <FaToggleOn size={25} className="text-green-500 hover:text-green-700" />
              ) : (
                <FaToggleOff size={25} className="text-gray-400 hover:text-gray-600" />
              )}
            </button>
          </div>
        </li>
      ));

  const renderSalesPartners = () =>
    salesPartners
      .filter((partner) => {
        const q = salesSearch.trim();
        return (
          !q ||
          partner.name.toLowerCase().includes(q) ||
          partner.phone.includes(q) ||
          (partner.sales_id && partner.sales_id.toLowerCase().includes(q))
        );
      })
      .map((partner) => (
        <li
          key={partner.uid}
          className={`flex justify-between items-center p-4 rounded-lg border ${partner.active ? 'border-purple-100 bg-purple-50' : 'border-gray-200 bg-gray-50'
            } transition-all hover:shadow-sm`}
        >
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <span className="font-medium text-gray-800">{partner.name}</span>
              <span className={`text-xs px-2 py-1 rounded-full ${partner.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                {partner.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <div className="flex items-center">
                <span className="w-20 text-gray-500">Phone:</span>
                <span>{partner.phone}</span>
              </div>
              <div className="flex items-center">
                <span className="w-20 text-gray-500">Sales ID:</span>
                <span>{partner.sales_id}</span>
              </div>
              <div className="flex items-center">
                <span className="w-20 text-gray-500">Password:</span>
                <span>{partner.password}</span>
              </div>
            </div>
          </div>
          <div className="flex space-x-3 ml-4">
            <button
              onClick={() => handleEditClick(partner, 'sales')}
              className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-full transition"
              title="Edit"
            >
              <FaEdit size={16} />
            </button>
            <button
              onClick={() => handleToggleSalesStatus(partner)}
              className="p-2 rounded-full transition"
              title={partner.active ? 'Deactivate' : 'Activate'}
            >
              {partner.active ? (
                <FaToggleOn size={25} className="text-green-500 hover:text-green-700" />
              ) : (
                <FaToggleOff size={25} className="text-gray-400 hover:text-gray-600" />
              )}
            </button>
          </div>
        </li>
      ));

  return (
    <div className="min-h-screen p-6 bg-gradient-to-r from-blue-100 to-purple-200 flex flex-col items-center">
      {/* Top Notification Message */}
      {actionMessage && (
        <div
          className={`mb-6 px-6 py-3 rounded-xl text-center font-semibold w-full max-w-4xl ${messageType === 'success'
            ? 'bg-green-100 text-green-800 border border-green-300'
            : 'bg-red-100 text-red-800 border border-red-300'
            }`}
        >
          {actionMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
        {/* Delivery Partners */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-blue-300">
          <h3 className="text-2xl font-bold text-center mb-3 text-blue-700">Delivery Partners</h3>
          <div className="max-w-2xl text-center mb-5">
            <input
              type="text"
              placeholder="Search by name, phone"
              className="p-1 rounded-lg border border-gray-600 shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={deliverySearch}
              onChange={(e) => setDeliverySearch(e.target.value.toLowerCase())}
            />
          </div>
          {deliveryPartners.length === 0 ? (
            <p className="text-gray-500 text-center">No delivery partners found.</p>
          ) : (
            <ul className="space-y-4">{renderDeliveryPartners()}</ul>
          )}
        </div>

        {/* Sales Partners */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-green-300">
          <h3 className="text-2xl font-bold text-center mb-3 text-green-700">Sales Partners</h3>
          <div className="max-w-4xl text-center mb-5">
            <input
              type="text"
              placeholder="Search by name, phone"
              className="p-1 rounded-lg border border-gray-600 shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={salesSearch}
              onChange={(e) => setSalesSearch(e.target.value.toLowerCase())}
            />
          </div>

          {salesPartners.length === 0 ? (
            <p className="text-gray-500 text-center">No sales partners found.</p>
          ) : (
            <ul className="space-y-4">{renderSalesPartners()}</ul>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingPartner && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-gradient-to-r from-blue-100 to-purple-200 p-8 rounded-2xl shadow-2xl w-11/12 max-w-lg">
            <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Edit Partner</h2>
            <div className="flex flex-col gap-4">
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="text-sm border border-purple-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Partner Name"
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
                  onClick={() => setEditingPartner(null)}
                  className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingPartner && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-purple-200 p-8 rounded-2xl shadow-2xl w-11/12 max-w-sm">
            <h2 className="text-xl font-bold mb-4 text-center text-gray-800">Confirm Delete</h2>
            <p className="text-center text-gray-600 mb-6">
              Are you sure you want to delete {deletingPartner.name}?
            </p>
            <div className="flex justify-between">
              <button
                onClick={handleDelete}
                className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition"
              >
                Delete
              </button>
              <button
                onClick={() => setDeletingPartner(null)}
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

export default PersonnelList;





