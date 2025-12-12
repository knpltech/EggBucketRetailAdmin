// import React, { useEffect, useState } from 'react';
// import axios from 'axios';
// import { ADMIN_PATH } from '../constant';

// // Component to display delivery & sales partners (READ-ONLY)
// const PersonnelView = () => {
//   const [deliveryPartners, setDeliveryPartners] = useState([]);
//   const [salesPartners, setSalesPartners] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState('');

//   const [deliverySearch, setDeliverySearch] = useState('');
//   const [salesSearch, setSalesSearch] = useState('');

//   useEffect(() => {
//     fetchPartners();
//   }, []);

//   // Fetch both delivery partners and sales partners
//   const fetchPartners = async () => {
//     try {
//       const [deliveryRes, salesRes] = await Promise.all([
//         axios.get(`${ADMIN_PATH}/get-del-partner`),
//         axios.get(`${ADMIN_PATH}/get-sales-partner`),
//       ]);

//       setDeliveryPartners(deliveryRes.data);
//       setSalesPartners(salesRes.data);
//     } catch (err) {
//       console.error(err);
//       setError('Failed to fetch personnel data.');
//     } finally {
//       setLoading(false);
//     }
//   };

//   if (loading) return <div className="text-center py-10 text-xl font-semibold">Loading...</div>;
//   if (error) return <div className="text-center py-10 text-red-600 text-xl">{error}</div>;

//   // -------------------------------
//   // 📌 Delivery Partners (READ ONLY)
//   // -------------------------------
//   const renderDeliveryPartners = () =>
//     deliveryPartners
//       .filter((partner) => {
//         const q = deliverySearch.trim().toLowerCase();
//         return (
//           !q ||
//           partner.name.toLowerCase().includes(q) ||
//           partner.phone.includes(q)
//         );
//       })
//       .map((partner) => (
//         <li
//           key={partner.uid}
//           className={`flex justify-between items-center p-4 rounded-lg border ${
//             partner.active ? 'border-blue-100 bg-blue-50' : 'border-gray-200 bg-gray-50'
//           } transition-all hover:shadow-sm`}
//         >
//           <div className="flex-1">
//             <div className="flex items-center space-x-2 mb-1">
//               <span className="font-medium text-gray-800">{partner.name}</span>

//               <span
//                 className={`text-xs px-2 py-1 rounded-full ${
//                   partner.active
//                     ? 'bg-green-100 text-green-800'
//                     : 'bg-gray-100 text-gray-800'
//                 }`}
//               >
//                 {partner.active ? 'Active' : 'Inactive'}
//               </span>
//             </div>

//             <div className="text-sm text-gray-600 space-y-1">
//               <div className="flex items-center">
//                 <span className="w-20 text-gray-500">Phone:</span>
//                 <span>{partner.phone}</span>
//               </div>

//               <div className="flex items-center">
//                 <span className="w-20 text-gray-500">Password:</span>
//                 <span>{partner.password}</span>
//               </div>
//             </div>
//           </div>
//         </li>
//       ));

//   // ------------------------------
//   // 📌 Sales Partners (READ ONLY)
//   // ------------------------------
//   const renderSalesPartners = () =>
//     salesPartners
//       .filter((partner) => {
//         const q = salesSearch.trim().toLowerCase();
//         return (
//           !q ||
//           partner.name.toLowerCase().includes(q) ||
//           partner.phone.includes(q) ||
//           (partner.sales_id && partner.sales_id.toLowerCase().includes(q))
//         );
//       })
//       .map((partner) => (
//         <li
//           key={partner.uid}
//           className={`flex justify-between items-center p-4 rounded-lg border ${
//             partner.active ? 'border-purple-100 bg-purple-50' : 'border-gray-200 bg-gray-50'
//           } transition-all hover:shadow-sm`}
//         >
//           <div className="flex-1">
//             <div className="flex items-center space-x-2 mb-1">
//               <span className="font-medium text-gray-800">{partner.name}</span>

//               <span
//                 className={`text-xs px-2 py-1 rounded-full ${
//                   partner.active
//                     ? 'bg-green-100 text-green-800'
//                     : 'bg-gray-100 text-gray-800'
//                 }`}
//               >
//                 {partner.active ? 'Active' : 'Inactive'}
//               </span>
//             </div>

//             <div className="text-sm text-gray-600 space-y-1">
//               <div className="flex items-center">
//                 <span className="w-20 text-gray-500">Phone:</span>
//                 <span>{partner.phone}</span>
//               </div>

//               <div className="flex items-center">
//                 <span className="w-20 text-gray-500">Sales ID:</span>
//                 <span>{partner.sales_id}</span>
//               </div>

//               <div className="flex items-center">
//                 <span className="w-20 text-gray-500">Password:</span>
//                 <span>{partner.password}</span>
//               </div>
//             </div>
//           </div>
//         </li>
//       ));

//   return (
//     <div className="min-h-screen p-6 bg-gradient-to-r from-blue-100 to-purple-200 flex flex-col items-center">

//       <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
        
//         {/* -------------------------- */}
//         {/* Delivery Partners Section */}
//         {/* -------------------------- */}
//         <div className="bg-white p-6 rounded-2xl shadow-lg border border-blue-300">
//           <h3 className="text-2xl font-bold text-center mb-3 text-blue-700">
//             Delivery Partners
//           </h3>

//           <div className="text-center mb-5">
//             <input
//               type="text"
//               placeholder="Search by name, phone"
//               className="p-1 rounded-lg border border-gray-600 shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
//               value={deliverySearch}
//               onChange={(e) => setDeliverySearch(e.target.value.toLowerCase())}
//             />
//           </div>

//           {deliveryPartners.length === 0 ? (
//             <p className="text-gray-500 text-center">No delivery partners found.</p>
//           ) : (
//             <ul className="space-y-4">{renderDeliveryPartners()}</ul>
//           )}
//         </div>

//         {/* ---------------------- */}
//         {/* Sales Partners Section */}
//         {/* ---------------------- */}
//         <div className="bg-white p-6 rounded-2xl shadow-lg border border-green-300">
//           <h3 className="text-2xl font-bold text-center mb-3 text-green-700">
//             Sales Partners
//           </h3>

//           <div className="text-center mb-5">
//             <input
//               type="text"
//               placeholder="Search by name, phone"
//               className="p-1 rounded-lg border border-gray-600 shadow focus:outline-none focus:ring-2 focus:ring-blue-400"
//               value={salesSearch}
//               onChange={(e) => setSalesSearch(e.target.value.toLowerCase())}
//             />
//           </div>

//           {salesPartners.length === 0 ? (
//             <p className="text-gray-500 text-center">No sales partners found.</p>
//           ) : (
//             <ul className="space-y-4">{renderSalesPartners()}</ul>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default PersonnelView;



import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ADMIN_PATH } from '../constant';

// Component to display delivery & sales partners (READ-ONLY)
const PersonnelView = () => {
  const [deliveryPartners, setDeliveryPartners] = useState([]);
  const [salesPartners, setSalesPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [deliverySearch, setDeliverySearch] = useState('');
  const [salesSearch, setSalesSearch] = useState('');

  useEffect(() => {
    fetchPartners();
  }, []);

  // Fetch both delivery partners and sales partners
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

  if (loading) return <div className="text-center py-10 text-xl font-semibold">Loading...</div>;
  if (error) return <div className="text-center py-10 text-red-600 text-xl">{error}</div>;

  // -------------------------------------------------------------------
  // 🔹 READ-ONLY Delivery Partners List
  // -------------------------------------------------------------------
  const renderDeliveryPartners = () =>
    deliveryPartners
      .filter((partner) => {
        const q = deliverySearch.trim().toLowerCase();
        return (
          partner.name.toLowerCase().includes(q) ||
          partner.phone.includes(q)
        );
      })
      .map((partner) => (
        <li
          key={partner.uid}
          className={`p-4 rounded-xl border shadow-sm hover:shadow-md transition-all ${
            partner.active ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-100'
          }`}
        >
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-gray-800 text-lg">{partner.name}</span>

              <span
                className={`text-xs px-3 py-1 rounded-full ${
                  partner.active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {partner.active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="text-sm text-gray-700 space-y-1">
              <p><span className="font-medium text-gray-600">Phone:</span> {partner.phone}</p>
              <p><span className="font-medium text-gray-600">Password:</span> {partner.password}</p>
            </div>
          </div>
        </li>
      ));

  // -------------------------------------------------------------------
  // 🔹 READ-ONLY Sales Partners List
  // -------------------------------------------------------------------
  const renderSalesPartners = () =>
    salesPartners
      .filter((partner) => {
        const q = salesSearch.trim().toLowerCase();
        return (
          partner.name.toLowerCase().includes(q) ||
          partner.phone.includes(q) ||
          (partner.sales_id && partner.sales_id.toLowerCase().includes(q))
        );
      })
      .map((partner) => (
        <li
          key={partner.uid}
          className={`p-4 rounded-xl border shadow-sm hover:shadow-md transition-all ${
            partner.active ? 'border-purple-200 bg-purple-50' : 'border-gray-200 bg-gray-100'
          }`}
        >
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-gray-800 text-lg">{partner.name}</span>

              <span
                className={`text-xs px-3 py-1 rounded-full ${
                  partner.active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {partner.active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="text-sm text-gray-700 space-y-1">
              <p><span className="font-medium text-gray-600">Phone:</span> {partner.phone}</p>
              <p><span className="font-medium text-gray-600">Sales ID:</span> {partner.sales_id}</p>
              <p><span className="font-medium text-gray-600">Password:</span> {partner.password}</p>
            </div>
          </div>
        </li>
      ));

  // -------------------------------------------------------------------
  // 🔹 MAIN UI
  // -------------------------------------------------------------------
  return (
    <div className="min-h-screen p-6 bg-gradient-to-r from-blue-100 to-purple-200 flex flex-col items-center">
      
      <h1 className="text-3xl font-bold mb-8 text-gray-800 tracking-wide">
        Personnel Overview
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full max-w-6xl">

        {/* Delivery Partners */}
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-blue-300">
          <h3 className="text-2xl font-bold text-center mb-5 text-blue-700">Delivery Partners</h3>

          <div className="flex justify-center mb-6">
            <input
              type="text"
              placeholder="Search by name, phone"
              className="w-64 px-3 py-2 rounded-lg border border-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
        <div className="bg-white p-6 rounded-2xl shadow-xl border border-green-300">
          <h3 className="text-2xl font-bold text-center mb-5 text-green-700">Sales Partners</h3>

          <div className="flex justify-center mb-6">
            <input
              type="text"
              placeholder="Search by name, phone"
              className="w-64 px-3 py-2 rounded-lg border border-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
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
    </div>
  );
};

export default PersonnelView;
