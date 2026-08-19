import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import GlobalSearch from '../components/GlobalSearch';

const STATUS_LABELS = { open: 'Ouvert', assigned: 'Assigné', in_progress: 'En cours', done: 'Terminé', cancelled: 'Annulé' };
const STATUS_ORDER = ['open', 'assigned', 'in_progress', 'done', 'cancelled'];

function StatTile({ label, value, tone = 'default', onClick }) {
  const toneClasses = {
    default: 'text-gray-900',
    warning: value > 0 ? 'text-orange-600' : 'text-gray-900',
    danger: value > 0 ? 'text-red-600' : 'text-gray-900',
  };
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-left hover:shadow-md transition-shadow disabled:cursor-default"
    >
      <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${toneClasses[tone]}`}>{value}</p>
    </button>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [recentClients, setRecentClients] = useState([]);
  const [summary, setSummary] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/clients').then(res => {
      setRecentClients(res.data.slice(0, 5));
    }).catch(() => {});
    axios.get('/api/dashboard/summary').then(res => setSummary(res.data)).catch(() => {});
  }, []);

  const openWorkOrders = summary
    ? STATUS_ORDER.filter(s => s !== 'done' && s !== 'cancelled').reduce((sum, s) => sum + (summary.workOrdersByStatus[s] || 0), 0)
    : 0;

  const maxMonthCount = summary?.interventionsByMonth.length
    ? Math.max(...summary.interventionsByMonth.map(m => m.count), 1)
    : 1;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Bienvenue sur TechIBase</h1>
        <p className="text-gray-500 mt-1">Bonjour, {user?.name} 👋</p>
      </div>

      <div className="mb-8">
        <GlobalSearch />
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatTile label="Clients" value={summary.totalClients} onClick={() => navigate('/clients')} />
            <StatTile label="Bons de service actifs" value={openWorkOrders} onClick={() => navigate('/work-orders')} />
            <StatTile label="Maintenance en retard" value={summary.overdueMaintenanceCount} tone="danger" />
            <StatTile label="EPI en stock faible" value={summary.lowStockEpiCount} tone="warning" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Bons de service par statut</h2>
              <div className="space-y-2">
                {STATUS_ORDER.map(status => {
                  const count = summary.workOrdersByStatus[status] || 0;
                  const total = Object.values(summary.workOrdersByStatus).reduce((a, b) => a + b, 0) || 1;
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-20 shrink-0">{STATUS_LABELS[status]}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-blue-500 h-full rounded-full" style={{ width: `${(count / total) * 100}%` }} />
                      </div>
                      <span className="text-xs text-gray-700 font-medium w-6 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Interventions (6 derniers mois)</h2>
              {summary.interventionsByMonth.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">Aucune intervention enregistrée</p>
              ) : (
                <div className="flex items-end gap-2 h-32">
                  {summary.interventionsByMonth.map(m => (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-blue-500 rounded-t"
                        style={{ height: `${(m.count / maxMonthCount) * 100}%`, minHeight: m.count > 0 ? '4px' : 0 }}
                        title={`${m.count} intervention(s)`}
                      />
                      <span className="text-[10px] text-gray-400">{m.month.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

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
