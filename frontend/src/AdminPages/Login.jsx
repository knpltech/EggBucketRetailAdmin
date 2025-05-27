import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACK_PATH } from '../constant';


function Login() {
  const [loginType, setLoginType] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch(`${BACK_PATH}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: username,
          password: password,
          role: loginType
        })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('loggedIn', 'true');
        localStorage.setItem('userType', loginType);
        navigate(`/${loginType}`);
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (error) {
      setError('Error connecting to server');
    }
  }

  return (
    <div className="max-w-md mx-auto mt-20 p-6 border rounded shadow">
      <h2 className="text-2xl mb-4">Login</h2>

      <div className="mb-4">
        <label className="mr-4">
          <input
            type="radio"
            value="admin"
            checked={loginType === 'admin'}
            onChange={() => setLoginType('admin')}
          />{' '}
          Admin
        </label>

        <label>
          <input
            type="radio"
            value="retail"
            checked={loginType === 'retail'}
            onChange={() => setLoginType('retail')}
          />{' '}
          Retail
        </label>
      </div>

      {error && (
        <div className="mb-3 text-red-600 font-semibold">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin}>
        <div className="mb-3">
          <input
            type="text"
            placeholder="Username"
            className="w-full p-2 border rounded"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <input
            type="password"
            placeholder="Password"
            className="w-full p-2 border rounded"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
        >
          Login
        </button>
      </form>
    </div>
  );
}

export default Login;
