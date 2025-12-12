// import React, { useEffect, useState } from 'react';
// import axios from 'axios';
// import { ADMIN_PATH } from '../constant';
// import { FaTrash, FaEdit } from 'react-icons/fa';
// import { useNavigate } from 'react-router-dom';

// // Component to display overview of all customers
// const CustomerView = () => {
//     const [customers, setCustomers] = useState([]);
//     const [loading, setLoading] = useState(true);
//     const [error, setError] = useState('');


//     const [sortOption, setSortOption] = useState('name');


//     const navigate = useNavigate();

//     // Fetch customer data when the component mounts
//     useEffect(() => {
//         fetchCustomers();
//     }, []);

//     // Fetch customer data from the backend
//     const fetchCustomers = async () => {
//         try {
//             const res = await axios.get(`${ADMIN_PATH}/user-info`);
//             setCustomers(res.data);
//         } catch (err) {
//             console.error('Failed to fetch customer data:', err);
//             setError('Error fetching customer data');
//         } finally {
//             setLoading(false);
//         }
//     };

   


   


  

//     // Change sorting option based on user selection
//     const handleSortChange = (e) => {
//         setSortOption(e.target.value);
//     };

//     // Sort customers based on the selected sort option
//     const sortedCustomers = [...customers].sort((a, b) => {
//         if (sortOption === 'name') {
//             return a.name.localeCompare(b.name);
//         } else if (sortOption === 'createdAt') {
//             return new Date(b.createdAt) - new Date(a.createdAt);
//         }
//         return 0;
//     });


   

//     // Loading UI while fetching data
//     if (loading) {
//         return (
//             <div className="min-h-screen flex items-center justify-center">
//                 <p className="text-gray-600 text-lg">Loading customer data...</p>
//             </div>
//         );
//     }

//     // Error UI if fetch failed
//     if (error) {
//         return (
//             <div className="min-h-screen flex items-center justify-center">
//                 <p className="text-red-500 text-lg">{error}</p>
//             </div>
//         );
//     }

//     return (
//         <div className="p-6 bg-gray-100 min-h-screen relative">
//             <h1 className="text-3xl font-bold mb-6 text-center">Customer Details</h1>

//             <div className="flex justify-between mb-4">
              
//                 <div>
//                     <label className="mr-2 text-sm font-medium">Sort by:</label>
//                     <select
//                         value={sortOption}
//                         onChange={handleSortChange}
//                         className="border border-gray-300 bg-gray-200 rounded px-2 py-1 text-sm focus:outline-none"
//                     >
//                         <option value="name">Customer Name</option>
//                         <option value="createdAt">Created Date </option>
//                     </select>
//                 </div>
//             </div>

//             <div className="overflow-x-auto">
//                 <table className="min-w-full bg-white rounded-lg shadow">
//                     <thead className="bg-gray-200 text-gray-700">
//                         <tr>
//                             <th className="py-3 px-4 text-left">Image</th>
//                             <th className="py-3 px-4 text-left">Cust Id</th>
//                             <th className="py-3 px-4 text-left">Name</th>
//                             <th className="py-3 px-4 text-left">Business</th>
//                             <th className="py-3 px-4 text-left">Phone</th>
//                             <th className="py-3 px-4 text-left">Created At</th>
                           
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {sortedCustomers.map((customer) => (
//                             <tr
//                                 key={customer.id}
//                                 className="border-t hover:bg-gray-100"
//                             >
//                                 <td className="py-2 px-4">
//                                     <img
//                                         src={customer.imageUrl}
//                                         alt={customer.name}
//                                         className="h-12 w-12 rounded-full object-cover"
//                                     />
//                                 </td>
//                                 <td className="py-2 px-4 text-xs">{customer.custid}</td>
//                                 <td className="py-2 px-4 text-xs">{customer.name}</td>
//                                 <td className="py-2 px-4 text-xs">{customer.business}</td>
//                                 <td className="py-2 px-4 text-xs">{customer.phone}</td>
//                                 <td className="py-2 px-4 text-xs text-gray-600">
//                                     {new Date(customer.createdAt).toLocaleString()}
//                                 </td>
                               
//                             </tr>
//                         ))}
//                     </tbody>
//                 </table>
//             </div>

           

//         </div>
//     );
// };

// export default CustomerView;










import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ADMIN_PATH } from '../constant';

const CustomerView = () => {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sortOption, setSortOption] = useState('name');

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

    const handleSortChange = (e) => {
        setSortOption(e.target.value);
    };

    const sortedCustomers = [...customers].sort((a, b) => {
        if (sortOption === 'name') {
            return a.name.localeCompare(b.name);
        } else if (sortOption === 'createdAt') {
            return new Date(b.createdAt) - new Date(a.createdAt);
        }
        return 0;
    });

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
            <h1 className="text-3xl font-bold mb-6 text-center">
                Customer Details
            </h1>

            {/* Top Controls */}
            <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-lg shadow">
                <div>
                    <label className="mr-2 text-sm font-medium">Sort by:</label>
                    <select
                        value={sortOption}
                        onChange={handleSortChange}
                        className="border border-gray-300 bg-gray-200 rounded px-2 py-1 text-sm focus:outline-none"
                    >
                        <option value="name">Customer Name</option>
                        <option value="createdAt">Created Date</option>
                    </select>
                </div>

                <p className="text-sm text-gray-600">
                    Total Customers: <span className="font-semibold">{customers.length}</span>
                </p>
            </div>

            {/* Table */}
            <div className="overflow-x-auto bg-white rounded-lg shadow">
                <table className="min-w-full border-collapse">
                    <thead className="bg-gray-200 text-gray-700 text-sm">
                        <tr>
                            <th className="py-3 px-4 text-left">Image</th>
                            <th className="py-3 px-4 text-left">Cust ID</th>
                            <th className="py-3 px-4 text-left">Name</th>
                            <th className="py-3 px-4 text-left">Business</th>
                            <th className="py-3 px-4 text-left">Phone</th>
                            <th className="py-3 px-4 text-left">Created At</th>
                        </tr>
                    </thead>

                    <tbody className="text-sm">
                        {sortedCustomers.length === 0 ? (
                            <tr>
                                <td
                                    colSpan="6"
                                    className="text-center py-6 text-gray-500"
                                >
                                    No customers found.
                                </td>
                            </tr>
                        ) : (
                            sortedCustomers.map((customer) => (
                                <tr
                                    key={customer.id}
                                    className="border-t hover:bg-gray-100 transition"
                                >
                                    <td className="py-2 px-4">
                                        <img
                                            src={customer.imageUrl}
                                            alt={customer.name}
                                            className="h-12 w-12 rounded-full object-cover border border-gray-300"
                                        />
                                    </td>

                                    <td className="py-2 px-4 text-xs font-medium">
                                        {customer.custid}
                                    </td>

                                    <td className="py-2 px-4 text-xs">
                                        {customer.name}
                                    </td>

                                    <td className="py-2 px-4 text-xs">
                                        {customer.business}
                                    </td>

                                    <td className="py-2 px-4 text-xs">
                                        {customer.phone}
                                    </td>

                                    <td className="py-2 px-4 text-xs text-gray-600">
                                        {new Date(customer.createdAt).toLocaleString()}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CustomerView;
