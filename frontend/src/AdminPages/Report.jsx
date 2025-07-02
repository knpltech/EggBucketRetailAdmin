import React, { useEffect, useState } from 'react';
import { ADMIN_PATH } from '../constant';

const Report = () => {
    const [data, setData] = useState([]); // All customers
    const [filteredDeliveries, setFilteredDeliveries] = useState([]); // Deliveries for selected date
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
                console.log("data: ", data);
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
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Delivery Report</h1>

            <div className='flex items-center justify-between'>
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Select Date
                    </label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="border p-2 rounded-md"
                    />
                </div>

                {filteredDeliveries.length > 0 && (
                    <div className="text-center">
                        <button
                            onClick={() => downloadCSV(filteredDeliveries, selectedDate)}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            Download CSV
                        </button>
                    </div>
                )}
            </div>



            <div className="overflow-x-auto">
                <table className="w-full table-auto border border-gray-300">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="p-2 border">Customer ID</th>
                            <th className="p-2 border">Name</th>
                            <th className="p-2 border">Delivery By</th>
                            <th className="p-2 border">Phone</th>
                            <th className="p-2 border">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredDeliveries.map((row, idx) => (
                            <tr key={idx} className="text-center">
                                <td className="p-2 border">{row.custid}</td>
                                <td className="p-2 border">{row.name}</td>
                                <td className="p-2 border">{row.deliveryMan?.name || '-'}</td>
                                <td className="p-2 border">{row.deliveryMan?.phone || '-'}</td>
                                <td className={`p-2 border ${getStatusColor(row.status)}`}>
                                    {row.status}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filteredDeliveries.length === 0 && (
                    <p className="mt-4 text-center text-gray-500">No data for this date.</p>
                )}
            </div>
        </div>
    );
};

export default Report;
