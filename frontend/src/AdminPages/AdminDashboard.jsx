import { Link } from 'react-router-dom';
import { Outlet } from 'react-router-dom';

export default function AdminDashboard() {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-800 text-white flex flex-col">
        <div className="flex items-center justify-center h-20 border-b border-gray-700">
          <img src="/logo.png" alt="EggBucket Logo" className="h-12 w-auto" />
        </div>

        <nav className="flex flex-col p-4 space-y-4 flex-grow mt-6">
          <Link
            to="/admin"
            className="block px-4 py-2 rounded hover:bg-gray-700"
          >
            About
          </Link>

          <Link
            to="/admin/customers"
            className="block px-4 py-2 rounded hover:bg-gray-700"
          >
            Customer Information
          </Link>

          <Link
            to="/admin/add-delivery"
            className="block px-4 py-2 rounded hover:bg-gray-700"
          >
            Add Delivery Partner
          </Link>

          <Link
            to="/admin/add-sales"
            className="block px-4 py-2 rounded hover:bg-gray-700"
          >
            Add Sales Partner
          </Link>

          <Link
            to="/admin/personnel"
            className="block px-4 py-2 rounded hover:bg-gray-700"
          >
            View Personnel
          </Link>

          <Link
            to="/"
            className="mt-auto block px-4 py-2 rounded bg-red-500 hover:bg-red-600 text-white text-center"
          >
            Logout
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-grow p-6 overflow-auto bg-white">
        <Outlet /> {/* ✅ This renders the nested route component */}
      </main>
    </div>
  );
}
