import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('loggedIn');
    localStorage.removeItem('userType');
    navigate('/');
  };

  const navItems = [
    { label: 'About', path: '/admin' },
    { label: 'Customer Information', path: '/admin/customers' },
    { label: 'Add Delivery Partner', path: '/admin/add-delivery' },
    { label: 'Add Sales Partner', path: '/admin/add-sales' },
    { label: 'Add Customer', path: '/admin/add-customer' },
    { label: 'View Personnel', path: '/admin/personnel' },
    { label: 'Report', path: '/admin/report' },
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-gray-800 to-gray-900 text-white flex flex-col shadow-xl z-10">
        <div className="flex items-center justify-center h-20 border-b border-gray-700 bg-gray-900">
          <div className="flex items-center space-x-2">
            <img src="/logo.png" alt="EggBucket Logo" className="h-10 w-auto" />
            <span className="text-xl font-bold text-white">EggBucket</span>
          </div>
        </div>

        <nav className="flex flex-col p-4 space-y-1 mt-6 flex-grow">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-4 py-3 rounded-lg transition-all duration-200 flex items-center space-x-3 ${
                location.pathname === item.path
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white font-medium shadow-md'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span className="flex-1">{item.label}</span>
              {location.pathname === item.path && (
                <span className="w-2 h-2 bg-white rounded-full"></span>
              )}
            </Link>
          ))}

          <div className="mt-auto pt-4 border-t border-gray-700">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium shadow-md transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-grow p-8 overflow-auto bg-white rounded-tl-3xl rounded-bl-3xl shadow-lg">
        <div className="max-w-7xl bg-white mx-auto">
            <Outlet />
        </div>
      </main>
    </div>
  );
}