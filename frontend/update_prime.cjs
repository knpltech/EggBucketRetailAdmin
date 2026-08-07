const fs = require('fs');
let file = fs.readFileSync('src/AdminPages/PrimeCustomers.jsx', 'utf8');

file = file.replace(/export default function CustomerManagement\(\)/g, 'export default function PrimeCustomers()');
file = file.replace(/const \[activeTab, setActiveTab\] = useState\("ALL"\);/g, 'const [activeTab, setActiveTab] = useState("PRIME CUSTOMER");');
file = file.replace(/<h1 className="text-3xl font-bold">Customer Management<\/h1>/g, '<h1 className="text-3xl font-bold">Prime Customers</h1>');

// Remove TABS UI
file = file.replace(/\{\/\* TABS \*\/\}\s*<div className="flex gap-2 mb-4 flex-wrap">\s*\{TABS\.map\(\(t\) => \([\s\S]*?<\/button>\s*\)\)\}\s*<\/div>/g, '');

// Header columns
file = file.replace(/<th className="px-2 py-3">Customer ID<\/th>/g, '');
file = file.replace(/<th className="px-2 py-3">Name<\/th>/g, '<th className="px-2 py-3">Name</th>\n              <th className="px-2 py-3">Phone</th>');
file = file.replace(/<th className="px-2 py-3">Peak_Frequency<\/th>/g, '');
file = file.replace(/<th className="px-2 py-3">Delivery_Gap<\/th>/g, '');
file = file.replace(/\{\(activeTab === "ALL" \|\| activeTab === "PRIME CUSTOMER" \|\| activeTab === "ONBOARDING"\) && \(\s*<th className="px-2 py-3">Current Category<\/th>\s*\)\}/g, '');

// Body columns
file = file.replace(/<td className="px-2 py-3 font-medium">\{c\.custid \|\| c\.id\}<\/td>/g, '');
file = file.replace(/<td className="px-2 py-3 font-medium">\{getName\(c\)\}<\/td>/g, '<td className="px-2 py-3 font-medium">{getName(c)}</td>\n                <td className="px-2 py-3">{c.phone || "-"}</td>');

file = file.replace(/<td className="px-2 py-3">\s*<span\s*className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"\s*style=\{\{ backgroundColor: getPeakFrequencyColor\(c\) \}\}\s*>\s*\{getPeakFrequencyLabel\(c\)\}\s*<\/span>\s*<\/td>/g, '');

file = file.replace(/<td className="px-2 py-3">\s*<span\s*className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"\s*style=\{\{\s*backgroundColor: getDeliveryGapColor\(c\.deliveryGap\),\s*\}\}\s*>\s*\{normalizeDeliveryGap\(c\.deliveryGap\)\}\s*<\/span>\s*<\/td>/g, '');

file = file.replace(/\{\(activeTab === "ALL" \|\| activeTab === "PRIME CUSTOMER" \|\| activeTab === "ONBOARDING"\) && \(\s*<td className="px-2 py-3">\s*<span\s*className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"\s*style=\{\{\s*backgroundColor: getCurrentCategoryColor\(\s*getCurrentCategory\(c\),\s*\),\s*\}\}\s*>\s*\{getCurrentCategory\(c\)\}\s*<\/span>\s*<\/td>\s*\)\}/g, '');

fs.writeFileSync('src/AdminPages/PrimeCustomers.jsx', file);
console.log('Done');
