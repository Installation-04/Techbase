import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import GlobalSearch from '../components/GlobalSearch';

export default function Home() {
  const { user } = useAuth();
  const [recentClients, setRecentClients] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/clients').then(res => {
      setRecentClients(res.data.slice(0, 5));
    }).catch(() => {});
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Bienvenue sur TechBase</h1>
        <p className="text-gray-500 mt-1">Bonjour, {user?.name} 👋</p>
      </div>

      <div className="mb-8">
        <GlobalSearch />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Clients récents</h2>
        </div>
        {recentClients.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p>Aucun client pour le moment.</p>
            <button
              onClick={() => navigate('/clients')}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              Ajouter un client
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentClients.map(client => (
              <button
                key={client.id}
                onClick={() => navigate(`/clients/${client.id}`)}
                className="w-full text-left px-6 py-4 hover:bg-blue-50 transition-colors flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-gray-900">{client.name}</p>
                  <p className="text-sm text-gray-500">
                    {client.contract_number && `N° ${client.contract_number}`}
                    {client.manager && ` · ${client.manager}`}
                  </p>
                </div>
                <span className="text-gray-400">→</span>
              </button>
            ))}
          </div>
        )}
        {recentClients.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
            <button
              onClick={() => navigate('/clients')}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Voir tous les clients →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
