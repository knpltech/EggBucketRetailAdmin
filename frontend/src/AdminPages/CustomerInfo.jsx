import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ADMIN_PATH } from '../constant';

const CustomerInfo = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
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

    fetchCustomers();
  }, []);

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
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center">Customer Details</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg shadow">
          <thead className="bg-gray-200 text-gray-700">
            <tr>
              <th className="py-3 px-4 text-left">Image</th>
              <th className="py-3 px-4 text-left">Name</th>
              <th className="py-3 px-4 text-left">Business</th>
              <th className="py-3 px-4 text-left">Phone</th>
              {/* <th className="py-3 px-4 text-left">Location</th> */}
              <th className="py-3 px-4 text-left">Created At</th>
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
                <td className="py-2 px-4">{customer.name}</td>
                <td className="py-2 px-4">{customer.business}</td>
                <td className="py-2 px-4">{customer.phone}</td>
                {/* <td className="py-2 px-4">{customer.location}</td> */}
                <td className="py-2 px-4 text-sm text-gray-600">
                  {new Date(customer.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CustomerInfo;
