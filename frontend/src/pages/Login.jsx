import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState({ google: false, microsoft: false });
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('error') === 'sso') {
      setError('La connexion via ce fournisseur a échoué. Réessayez.');
    }
    axios.get('/api/auth/providers').then(res => setProviders(res.data)).catch(() => {});
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-400">TechIBase</h1>
          <p className="text-gray-400 mt-2">Système de gestion technique</p>
        </div>

        <div className="bg-gray-800 rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-semibold text-white mb-6">
            {mode === 'register' ? 'Créer un compte' : 'Connexion'}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {(providers.google || providers.microsoft) && (
            <div className="space-y-3 mb-6">
              {providers.google && (
                <a
                  href="/api/auth/google"
                  className="w-full flex items-center justify-center gap-3 py-3 bg-white hover:bg-gray-100 text-gray-800 font-medium rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continuer avec Google
                </a>
              )}
              {providers.microsoft && (
                <a
                  href="/api/auth/microsoft"
                  className="w-full flex items-center justify-center gap-3 py-3 bg-white hover:bg-gray-100 text-gray-800 font-medium rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 23 23">
                    <path fill="#f35325" d="M1 1h10v10H1z" />
                    <path fill="#81bc06" d="M12 1h10v10H12z" />
                    <path fill="#05a6f0" d="M1 12h10v10H1z" />
                    <path fill="#ffba08" d="M12 12h10v10H12z" />
                  </svg>
                  Continuer avec Microsoft 365
                </a>
              )}
              <div className="flex items-center gap-3 text-gray-500 text-xs">
                <div className="flex-1 h-px bg-gray-700" />
                ou
                <div className="flex-1 h-px bg-gray-700" />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'register' && (
              <div>
                <label className="block text-gray-400 text-sm mb-2">Nom complet</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Jean Tremblay"
                />
              </div>
            )}

            <div>
              <label className="block text-gray-400 text-sm mb-2">Adresse email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus={mode === 'login'}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="vous@exemple.com"
              />
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 8 : undefined}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
              {mode === 'register' && (
                <p className="text-xs text-gray-500 mt-1">Au moins 8 caractères</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Veuillez patienter...' : mode === 'register' ? 'Créer mon compte' : 'Se connecter'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-6">
            {mode === 'register' ? (
              <>Déjà un compte ? <button type="button" onClick={() => { setMode('login'); setError(''); }} className="text-blue-400 hover:underline">Se connecter</button></>
            ) : (
              <>Pas encore de compte ? <button type="button" onClick={() => { setMode('register'); setError(''); }} className="text-blue-400 hover:underline">Créer un compte</button></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
