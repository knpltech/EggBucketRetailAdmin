import React, { useEffect, useState } from 'react';
import { ADMIN_PATH } from '../constant';

const Report = () => {
    const [data, setData] = useState([]);
    const [filteredDeliveries, setFilteredDeliveries] = useState([]);
    const [selectedDate, setSelectedDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`${ADMIN_PATH}/all-deliveries`);
                const json = await res.json();
                setData(json.customers);
            } catch (err) {
                console.error('Error fetching deliveries:', err);
            }
        };
        fetchData();
    }, []);

    const downloadCSV = (data, dateStr) => {
        if (!data || data.length === 0) return;

        const headers = ['Customer ID', 'Name', 'Delivery By', 'Phone', 'Status'];
        const rows = data.map(row => [
            row.custid,
            row.name,
            row.deliveryMan?.name || '',
            row.deliveryMan?.phone || '',
            row.status
        ]);

        let csvContent =
            'data:text/csv;charset=utf-8,' +
            headers.join(',') +
            '\n' +
            rows.map(e => e.join(',')).join('\n');

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `delivery_report_${dateStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    useEffect(() => {
        filterByDate(selectedDate);
    }, [data, selectedDate]);

    const filterByDate = (dateStr) => {
        const result = data.map((customer) => {
            const delivery = customer.deliveries.find((d) => d.id === dateStr);
            return {
                custid: customer.custid,
                name: customer.name,
                deliveryMan: delivery?.deliveryMan || null,
                status: delivery?.type || 'not delivered',
            };
        });
        setFilteredDeliveries(result);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'delivered':
                return 'text-green-600 font-semibold';
            case 'reached':
                return 'text-orange-500 font-semibold';
            case 'not delivered':
            default:
                return 'text-red-600 font-semibold';
        }
    };

    return (
        <div className="p-6 sm:p-10 max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">📦 Delivery Report</h1>

            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Select Date
                    </label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="border border-gray-300 p-2 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                </div>

                {filteredDeliveries.length > 0 && (
                    <button
                        onClick={() => downloadCSV(filteredDeliveries, selectedDate)}
                        className="inline-block px-5 py-2 bg-blue-600 text-white rounded-md shadow hover:bg-blue-700 transition-all duration-200"
                    >
                        ⬇️ Download CSV
                    </button>
                )}
            </div>

            <div className="overflow-x-auto bg-white rounded-xl shadow border">
                <table className="min-w-full text-sm text-left">
                    <thead className="bg-gray-100 text-xs uppercase font-bold border-b">
                        <tr>
                            <th className="px-4 py-3">Customer ID</th>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Delivery By</th>
                            <th className="px-4 py-3">Phone</th>
                            <th className="px-4 py-3">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredDeliveries.map((row, idx) => (
                            <tr
                                key={idx}
                                className="border-b hover:bg-gray-50 transition"
                            >
                                <td className="px-4 py-3">{row.custid}</td>
                                <td className="px-4 py-3">{row.name}</td>
                                <td className="px-4 py-3">{row.deliveryMan?.name || '-'}</td>
                                <td className="px-4 py-3">{row.deliveryMan?.phone || '-'}</td>
                                <td className={`px-4 py-3 ${getStatusColor(row.status)}`}>
                                    {row.status.toUpperCase()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filteredDeliveries.length === 0 && (
                    <p className="text-center p-6 text-gray-500">
                        No data available for the selected date.
                    </p>
                )}
            </div>
        </div>
    );
};

export default Report;
