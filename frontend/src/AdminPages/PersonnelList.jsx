import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ADMIN_PATH } from '../constant';

const PersonnelList = () => {
  const [deliveryPartners, setDeliveryPartners] = useState([]);
  const [salesPartners, setSalesPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => {
    fetchPartners();
  }, []);

  if (loading) return <div className="text-center py-10 text-xl font-semibold">Loading...</div>;
  if (error) return <div className="text-center py-10 text-red-600 text-xl">{error}</div>;

  return (
    <div className="min-h-screen p-6 bg-gradient-to-r from-blue-100 to-purple-200 flex flex-col items-center">
      <h2 className="text-4xl font-bold mb-10 text-gray-800">Personnel List</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
        {/* Delivery Partners */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-blue-300">
          <h3 className="text-3xl font-semibold mb-6 text-center text-blue-700">Delivery Partners</h3>
          {deliveryPartners.length === 0 ? (
            <p className="text-gray-500 text-center">No delivery partners found.</p>
          ) : (
            <ul className="space-y-4">
              {deliveryPartners.map((partner) => (
                <li
                  key={partner.id}
                  className="flex justify-between items-center p-4 border rounded-xl hover:shadow-md transition-transform hover:scale-[1.02]"
                >
                  <span className="font-medium text-gray-800">Name: {partner.name}</span>
                  <span className="font-bold text-gray-600">Phone: {partner.phone}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sales Partners */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-green-300">
          <h3 className="text-3xl font-semibold mb-6 text-center text-green-700">Sales Partners</h3>
          {salesPartners.length === 0 ? (
            <p className="text-gray-500 text-center">No sales partners found.</p>
          ) : (
            <ul className="space-y-4">
              {salesPartners.map((partner) => (
                <li
                  key={partner.id}
                  className="flex justify-between items-center p-4 border rounded-xl hover:shadow-md transition-transform hover:scale-[1.02]"
                >
                  <span className="font-medium text-gray-800">Name: {partner.name}</span>
                  <span className="font-bold text-gray-600">Phone: {partner.phone}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default PersonnelList;
