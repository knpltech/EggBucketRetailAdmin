import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ADMIN_PATH } from '../constant';
import { FiUser, FiLock } from 'react-icons/fi';

function Login() {
  const [loginType, setLoginType] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);
    try {
      const response = await fetch(`${ADMIN_PATH}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role: loginType }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('loggedIn', 'true');
        localStorage.setItem('userType', loginType);
        navigate(`/${loginType}`);
      } else {
        setError(data.message || 'Login failed');
      }
    } catch {
      setError('Error connecting to server');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center flex items-center justify-center relative"
      style={{ backgroundImage: "url('bg_image1.jpg')" }}
    >
      <div
        className="absolute inset-0 bg-black/30 z-0"
        style={{ backdropFilter: 'blur(3px)' }}
      ></div>

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 max-w-5xl w-full bg-white bg-opacity-10 rounded-xl shadow-lg overflow-hidden">
        <div className="p-8 text-white hidden md:flex flex-col justify-center bg-gradient-to-br from-blue-700 to-purple-700">
          <h1 className="text-4xl font-bold mb-4">Welcome to EggBucket</h1>
          <p className="text-lg mb-6">Your central dashboard for managing retail partners, delivery partners, tracking customer info, and handling business insights.</p>
          <p className="text-sm text-gray-200">Please log in to access the admin portal.</p>
        </div>

        <div className="bg-white bg-opacity-90 p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Login</h2>

          <div className="mb-4 flex space-x-4">
            <label className="text-gray-700 font-medium">
              <input type="radio" value="admin" checked={loginType === 'admin'} onChange={() => setLoginType('admin')} className="mr-2" />
              Admin
            </label>
            <label className="text-gray-700 font-medium">
              <input type="radio" value="retail" checked={loginType === 'retail'} onChange={() => setLoginType('retail')} className="mr-2" />
              Retail
            </label>
          </div>

          {error && <div className="mb-3 text-red-600 font-semibold">{error}</div>}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <FiUser className="absolute top-3 left-3 text-gray-400" />
              <input type="text" placeholder="Username" className="w-full pl-10 pr-4 py-2 border rounded focus:outline-none" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="relative">
              <FiLock className="absolute top-3 left-3 text-gray-400" />
              <input type="password" placeholder="Password" className="w-full pl-10 pr-4 py-2 border rounded focus:outline-none" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 active:scale-95 transition transform flex items-center justify-center"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Logging In...
                </>
              ) : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;