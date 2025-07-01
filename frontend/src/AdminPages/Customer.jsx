import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ADMIN_PATH, GOOGLE_MAP_KEY } from '../constant';
import { FiArrowLeft } from 'react-icons/fi';

const Customer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFullImage, setShowFullImage] = useState(false);

  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        const res = await axios.get(`${ADMIN_PATH}/customer-info/${id}`);
        setCustomer(res.data);
      } catch (err) {
        console.error('Error fetching customer:', err);
        setError('Failed to load customer data.');
      } finally {
        setLoading(false);
      }
    };

    fetchCustomer();
  }, [id]);

  const parseLatLng = (locationString) => {
    const match = locationString.match(/Lat:\s*([\d.-]+),\s*Lng:\s*([\d.-]+)/);
    if (match) {
      return {
        lat: match[1],
        lng: match[2],
      };
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600 text-lg">
        Loading customer...
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500 text-lg">
        {error || 'Customer not found.'}
      </div>
    );
  }

  const latLng = parseLatLng(customer.location);
  const mapUrl = latLng
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${latLng.lat},${latLng.lng}&zoom=15&size=600x300&markers=color:red%7C${latLng.lat},${latLng.lng}&key=${GOOGLE_MAP_KEY}`
    : null;

  const mapsLink = latLng
    ? `https://www.google.com/maps/search/?api=1&query=${latLng.lat},${latLng.lng}`
    : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-6">
      {/* Go Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="self-start mb-4 text-gray-700 hover:text-blue-600 font-medium flex items-center"
      >
        <FiArrowLeft className="text-xl mr-2" />
      </button>

      <div className="bg-purple-50 shadow-xl rounded-xl p-6 w-full max-w-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-1">{customer.name}</h2>
            <h2 className="text-xl font-semibold text-gray-800 mb-1">{customer.phone}</h2>
            <p className="font-semibold mb-1">Customer Id: {customer.custid}</p>
            <p className="font-semibold text-gray-500 mb-1">Business: {customer.business}</p>
            <p className="text-gray-400 text-sm mb-2">
              Created At: {new Date(Number(customer.createdAt)).toLocaleString()}
            </p>
          </div>

          <div className="ml-4">
            <img
              src={customer.imageUrl}
              alt={customer.name}
              className="w-24 h-24 object-cover rounded-full cursor-pointer border-2 border-purple-300 shadow hover:shadow-xl hover:scale-105 transition"
              onClick={() => setShowFullImage(true)}
            />
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Location</h3>
          <p className="text-gray-600 mb-6">{customer.location}</p>

          {latLng && mapUrl && (
            <a href={mapsLink} target="_blank" rel="noopener noreferrer">
              <img
                src={mapUrl}
                alt="Google Map"
                className="w-full rounded-lg shadow hover:shadow-xl hover:scale-105 transition duration-200"
              />
              <p className="text-sm text-blue-600 mt-2 hover:underline">Open in Google Maps</p>
            </a>
          )}
        </div>
      </div>

      {/* Full Image Overlay */}
      {showFullImage && (
        <div
          className="fixed inset-0 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowFullImage(false)}
        >
          <button
            onClick={() => setShowFullImage(false)}
            className="absolute top-6 right-6 text-black text-5xl font-bold hover:text-red-400 z-50"
          >
            &times;
          </button>

          <img
            src={customer.imageUrl}
            alt="Full Size"
            className="max-w-full max-h-full w-auto h-auto rounded-lg shadow-lg"
          />
        </div>
      )}
    </div>
  );
};

export default Customer;
