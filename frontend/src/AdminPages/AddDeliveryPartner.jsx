import React, { useState } from 'react';
import axios from 'axios';
import { ADMIN_PATH } from '../constant';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

// Component to add a new delivery partner
const AddDeliveryPartner = () => {
  const getInitialFormData = () => ({
    name: '',
    phone: '',
    outlet: '',
    password: '',
    confirmPassword: '',
  });

  // States for form data, UI toggles, messages and loading
  const [formData, setFormData] = useState(getInitialFormData);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Handle input changes
  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setMessageType('');
    setIsProcessing(true);

    const payload = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      outlet: formData.outlet.trim(),
      password: formData.password,
    };

    // Validate password match
    if (formData.password !== formData.confirmPassword) {
      setMessage('Passwords do not match.');
      setMessageType('error');
      setIsProcessing(false);
      return;
    }

    if (payload.password.length < 6) {
      setMessage('Password must be at least six characters.');
      setMessageType('error');
      setIsProcessing(false);
      return;
    }

    if (!payload.name || !payload.phone || !payload.outlet || !payload.password) {
      setMessage('Name, phone number, outlet, and password are required.');
      setMessageType('error');
      setIsProcessing(false);
      return;
    }

    try {
      // API call to backend to add delivery partner
      const res = await axios.post(`${ADMIN_PATH}/add-del-partner`, payload);
      setMessage(res.data.message);
      setMessageType('success');
      setFormData(getInitialFormData());
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.message || 'Failed to add delivery partner.');
      setMessageType('error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-xl overflow-hidden border border-gray-200/50"
        >
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
            <h2 className="text-2xl font-bold text-center">Add Delivery Partner</h2>
          </div>

          <div className="p-6 space-y-5">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Outlet</label>
              <input
                type="text"
                name="outlet"
                value={formData.outlet}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="At least six characters"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10 transition-all duration-200"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10 transition-all duration-200"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                  onClick={() => setShowConfirm(!showConfirm)}
                >
                  {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className={`w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-lg shadow-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all flex items-center justify-center ${isProcessing ? 'opacity-80 cursor-not-allowed' : ''}`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={20} />
                  Processing...
                </>
              ) : (
                'Add Delivery Partner'
              )}
            </button>

            {message && (
              <div className={`mt-4 p-3 rounded-lg text-center text-sm font-medium ${messageType === 'error'
                ? 'bg-red-100 text-red-700'
                : 'bg-green-100 text-green-700'
                }`}
              >
                {message}
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddDeliveryPartner;
