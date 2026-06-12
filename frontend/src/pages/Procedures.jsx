import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Procedures() {
  const [procedures, setProcedures] = useState([]);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/procedures').then(res => setProcedures(res.data)).catch(console.error);
  }, []);

  const filtered = filter === 'all' ? procedures : procedures.filter(p => p.type === filter);

  const typeLabel = (type) => type === 'remote' ? 'Distanciel' : 'Présentiel';
  const typeBadge = (type) => type === 'remote'
    ? 'bg-purple-100 text-purple-700'
    : 'bg-green-100 text-green-700';

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Procédures</h1>
        <div className="flex gap-2">
          {['all', 'onsite', 'remote'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? 'Toutes' : f === 'remote' ? 'Distanciel' : 'Présentiel'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm border border-gray-100">
            Aucune procédure trouvée
          </div>
        ) : (
          filtered.map(proc => (
            <div
              key={proc.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/clients/${proc.client_id}`)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-gray-900">{proc.title}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge(proc.type)}`}>
                      {typeLabel(proc.type)}
                    </span>
                  </div>
                  <p className="text-sm text-blue-600 hover:underline">{proc.client_name}</p>
                  {proc.content && (
                    <p className="text-sm text-gray-500 mt-2 line-clamp-2">{proc.content}</p>
                  )}
                </div>
                <span className="text-gray-400 text-sm whitespace-nowrap">
                  {new Date(proc.created_at).toLocaleDateString('fr-FR')}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
