import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthCallback() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (!token) {
      navigate('/login?error=sso');
      return;
    }
    loginWithToken(token)
      .then(() => navigate('/'))
      .catch(() => navigate('/login?error=sso'));
  }, [loginWithToken, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-white text-xl">Connexion...</div>
    </div>
  );
}
