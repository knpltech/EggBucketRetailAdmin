import { Link, Outlet } from 'react-router-dom';

export default function RetailDashboard() {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 text-white flex flex-col">
        <div className="flex items-center justify-center h-20 border-b border-gray-700">
          <img src="/logo.png" alt="EggBucket Logo" className="h-12 w-auto" />
        </div>

        <nav className="flex flex-col p-4 space-y-4 flex-grow mt-6">
          <Link
            to="/retail/orders"
            className="block px-4 py-2 rounded hover:bg-gray-700"
          >
            Orders
          </Link>

          <Link
            to="/retail/deliveries"
            className="block px-4 py-2 rounded hover:bg-gray-700"
          >
            Deliveries
          </Link>

          <Link
            to="/retail/payments"
            className="block px-4 py-2 rounded hover:bg-gray-700"
          >
            Payments
          </Link>

          <Link
            to="/"
            className="mt-auto block px-4 py-2 rounded bg-red-500 hover:bg-red-600 text-white text-center"
          >
            Logout
          </Link>
        </nav>
      </aside>

      {/* Main content rendered here */}
      <main className="flex-grow p-6 overflow-auto bg-white">
        <Outlet /> {/* ✅ Renders nested route content */}
      </main>
    </div>
  );
}
