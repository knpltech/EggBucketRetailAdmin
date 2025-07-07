import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ADMIN_PATH } from '../constant';
import { useNavigate } from 'react-router-dom';

const AddCustomer = () => {
  const navigate = useNavigate();
  const [salesPartners, setSalesPartners] = useState([]);
  const [sales_id, setSales_id] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    business: '',
    createdby: '',
    lng: '',
    lat: ''
  });
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    axios.get(`${ADMIN_PATH}/get-sales-partner`)
      .then((res) => {
        setSalesPartners(res.data || []);
      })
      .catch((err) => {
        console.error("Error fetching sales partners:", err);
      });
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSalesChange = (e) => {
    const selectedId = e.target.value;
    const selectedPartner = salesPartners.find(sp => sp.id === selectedId);

    setFormData((prev) => ({
      ...prev,
      createdby: selectedId
    }));

    if (selectedPartner) {
      setSales_id(selectedPartner.sales_id || '');
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setImageFile(file);
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl('');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      business: '',
      createdby: '',
      lng: '',
      lat: '',
    });
    setImageFile(null);
    setPreviewUrl('');
    setSales_id('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (!formData.createdby) {
      alert("Please select a sales partner");
      setIsSubmitting(false);
      return;
    }
    if (!imageFile) {
      alert("Please upload an image");
      setIsSubmitting(false);
      return;
    }

    try {
      const data = new FormData();
      data.append("image", imageFile);
      data.append("sales_id", sales_id);

      Object.entries(formData).forEach(([key, val]) => {
        data.append(key, val);
      });

      await axios.post(`${ADMIN_PATH}/add-customer`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      alert("Customer added successfully!");
      resetForm();
    } catch (error) {
      console.error("Error adding customer:", error);
      alert("Failed to add customer. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
          <h2 className="text-2xl font-bold">Add New Customer</h2>
          <p className="text-purple-100">Fill in the details below to register a new customer</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition duration-200"
              placeholder="Enter customer name"
              required
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              name="phone"
              type="text"
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition duration-200"
              placeholder="Enter phone number"
              required
            />
          </div>

          {/* Business */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Name <span className="text-red-500">*</span>
            </label>
            <input
              name="business"
              type="text"
              value={formData.business}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition duration-200"
              placeholder="Enter business name"
              required
            />
          </div>

          {/* Address */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <input
                  name="lat"
                  type="text"
                  value={formData.lat}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Lattitude"
                  required
                />
              </div>
              <div>
                <input
                  name="lng"
                  type="text"
                  value={formData.lng}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Longitude"
                  required
                />
              </div>
            </div>
          </div>

          {/* Image Upload */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer Image <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center space-x-4">
              <label className="cursor-pointer bg-gradient-to-r from-purple-500 to-blue-500 text-white px-5 py-2.5 rounded-lg shadow-md hover:from-purple-600 hover:to-blue-600 transition duration-200 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Choose File
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                  required
                />
              </label>
              {previewUrl ? (
                <div className="relative">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="h-16 w-16 object-cover rounded-lg border-2 border-purple-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setPreviewUrl('');
                    }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="h-16 w-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400">
                  No image
                </div>
              )}
            </div>
          </div>

          {/* Sales Partner */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sales Partner <span className="text-red-500">*</span>
            </label>
            <select
              name="createdby"
              value={formData.createdby}
              onChange={handleSalesChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white appearance-none"
              required
            >
              <option value="">Select Sales Partner</option>
              {salesPartners.map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.name}</option>
              ))}
            </select>
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3.5 text-lg font-semibold text-white rounded-lg shadow-md transition duration-200 ${isSubmitting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
                }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                'Add Customer'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddCustomer;