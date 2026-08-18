import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const doLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    setLoading(false);

    const interceptor = axios.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401) {
          doLogout();
          window.location.href = '/login';
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  const applySession = (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(user);
    return user;
  };

  const login = async (email, password) => {
    const response = await axios.post('/api/users/login', { email, password });
    return applySession(response.data.token, response.data.user);
  };

  const register = async (email, password, name) => {
    const response = await axios.post('/api/users/register', { email, password, name });
    return applySession(response.data.token, response.data.user);
  };

  // Used by the SSO callback page: a token is handed off in the URL
  // fragment, but the user profile still needs to be fetched.
  const loginWithToken = async (token) => {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    const response = await axios.get('/api/users/me');
    return applySession(token, response.data);
  };

  const logout = doLogout;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, register, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
