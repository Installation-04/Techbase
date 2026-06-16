import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const search = useCallback(async (q) => {
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`/api/search?q=${encodeURIComponent(q)}`);
      setResults(res.data);
      setOpen(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 300);
  };

  const hasResults = results && (results.clients.length > 0 || results.equipment.length > 0 || results.contacts.length > 0);

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => results && setOpen(true)}
          placeholder="Rechercher clients, équipements, contacts..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">...</span>
        )}
      </div>

      {open && hasResults && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 z-50 max-h-96 overflow-auto">
          {results.clients.length > 0 && (
            <div>
              <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Clients</p>
              {results.clients.map(c => (
                <button
                  key={c.id}
                  onClick={() => { navigate(`/clients/${c.id}`); setOpen(false); setQuery(''); }}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-50"
                >
                  <p className="font-medium text-gray-900">{c.name}</p>
                  {c.contract_number && <p className="text-sm text-gray-500">Contrat: {c.contract_number}</p>}
                </button>
              ))}
            </div>
          )}
          {results.equipment.length > 0 && (
            <div>
              <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Équipements</p>
              {results.equipment.map(e => (
                <button
                  key={e.id}
                  onClick={() => { navigate(`/clients/${e.client_id}`); setOpen(false); setQuery(''); }}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-50"
                >
                  <p className="font-medium text-gray-900">{e.name}</p>
                  <p className="text-sm text-gray-500">{e.client_name} {e.serial_number && `· ${e.serial_number}`}</p>
                </button>
              ))}
            </div>
          )}
          {results.contacts.length > 0 && (
            <div>
              <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Contacts</p>
              {results.contacts.map(c => (
                <button
                  key={c.id}
                  onClick={() => { navigate(`/clients/${c.client_id}`); setOpen(false); setQuery(''); }}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-50"
                >
                  <p className="font-medium text-gray-900">{c.name}</p>
                  <p className="text-sm text-gray-500">{c.client_name} {c.role && `· ${c.role}`}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {open && results && !hasResults && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 z-50 p-4 text-center text-gray-500">
          Aucun résultat pour "{query}"
        </div>
      )}
    </div>
  );
}
