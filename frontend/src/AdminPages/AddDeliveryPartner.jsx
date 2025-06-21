import React, { useState } from 'react';
import axios from 'axios';
import { ADMIN_PATH } from '../constant';
import { Eye, EyeOff } from 'lucide-react'; // using lucide-react for eye icons

const AddDeliveryPartner = () => {
  const [formData, setFormData] = useState({ name: '', phone: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState('');

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    if (formData.password !== formData.confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    try {
      const { name, phone, password } = formData;
      const res = await axios.post(`${ADMIN_PATH}/add-del-partner`, { name, phone, password });
      setMessage(res.data.message);
      setFormData({ name: '', phone: '', password: '', confirmPassword: '' });
    } catch (err) {
      console.error(err);
      setMessage('Failed to add delivery partner.');
    }
  };

  return (
    <div className="min-h-screen p-6 bg-gray-100 flex justify-center items-center">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-lg shadow-md w-full max-w-md"
      >
        <h2 className="text-2xl font-bold mb-4 text-center">Add Delivery Partner</h2>

        <label className="block mb-2 font-medium">Name</label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className="w-full mb-4 px-3 py-2 border rounded-lg"
          required
        />

        <label className="block mb-2 font-medium">Phone Number</label>
        <input
          type="text"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          className="w-full mb-4 px-3 py-2 border rounded-lg"
          required
        />

        <label className="block mb-2 font-medium">Password</label>
        <div className="relative mb-4">
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            value={formData.password}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg pr-10"
            required
          />
          <button
            type="button"
            className="absolute right-2 top-2.5 text-gray-600"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        <label className="block mb-2 font-medium">Confirm Password</label>
        <div className="relative mb-4">
          <input
            type={showConfirm ? 'text' : 'password'}
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg pr-10"
            required
          />
          <button
            type="button"
            className="absolute right-2 top-2.5 text-gray-600"
            onClick={() => setShowConfirm(!showConfirm)}
          >
            {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Add Partner
        </button>

        {message && (
          <p className="mt-4 text-center text-green-600">{message}</p>
        )}
      </form>
    </div>
  );
};

export default AddDeliveryPartner;
