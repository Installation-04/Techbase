import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ACTION_GROUPS, actionLabel, actionTone, auditQuery, formatDetail, formatWhen } from '../lib/audit.mjs';

const EMPTY = { user: '', action: '', from: '', to: '', q: '' };
const TONES = {
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};
const input = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100';
const btn = 'px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40';

export default function AuditLog() {
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get(`/api/admin/audit?${auditQuery(filters, { page, pageSize: 50 })}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Impossible de lire le journal.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const apply = e => { e.preventDefault(); setPage(1); setFilters(draft); };
  const reset = () => { setDraft(EMPTY); setFilters(EMPTY); setPage(1); };

  const exportCsv = async () => {
    try {
      const res = await axios.get(`/api/admin/audit/export?${auditQuery(filters)}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'journal-audit.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("L'export a échoué.");
    }
  };

  const set = k => e => setDraft(d => ({ ...d, [k]: e.target.value }));

  return (
    <div>
      <form onSubmit={apply} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <label className="text-xs text-gray-500 dark:text-gray-400">Utilisateur
          <input className={`${input} mt-1`} placeholder="courriel ou n°" value={draft.user} onChange={set('user')} />
        </label>
        <label className="text-xs text-gray-500 dark:text-gray-400">Action
          <select className={`${input} mt-1`} value={draft.action} onChange={set('action')}>
            {ACTION_GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500 dark:text-gray-400">Du
          <input type="date" className={`${input} mt-1`} value={draft.from} onChange={set('from')} />
        </label>
        <label className="text-xs text-gray-500 dark:text-gray-400">Au
          <input type="date" className={`${input} mt-1`} value={draft.to} onChange={set('to')} />
        </label>
        <label className="text-xs text-gray-500 dark:text-gray-400">Recherche
          <input className={`${input} mt-1`} placeholder="texte libre, IP…" value={draft.q} onChange={set('q')} />
        </label>
        <div className="sm:col-span-2 lg:col-span-5 flex flex-wrap gap-2">
          <button type="submit" className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Filtrer</button>
          <button type="button" onClick={reset} className={btn}>Réinitialiser</button>
          <button type="button" onClick={exportCsv} className={`${btn} sm:ml-auto`}>Exporter en CSV</button>
        </div>
      </form>

      {error && <p className="text-red-600 dark:text-red-400 text-sm mb-3">{error}</p>}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
              <th className="px-3 py-2 font-medium whitespace-nowrap">Date</th>
              <th className="px-3 py-2 font-medium">Utilisateur</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Détails</th>
              <th className="px-3 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map(r => (
              <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0 align-top">
                <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">{formatWhen(r.created_at)}</td>
                <td className="px-3 py-2 text-gray-900 dark:text-gray-100 break-all">{r.user_email || <span className="text-gray-400">Système</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span title={r.action} className={`text-xs font-medium px-2 py-0.5 rounded-full ${TONES[actionTone(r.action)]}`}>{actionLabel(r.action)}</span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300 break-words max-w-xs">{formatDetail(r.detail)}</td>
                <td className="px-3 py-2 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap" title={r.user_agent || ''}>{r.ip || '—'}</td>
              </tr>
            ))}
            {data && data.rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Aucune entrée</td></tr>
            )}
            {!data && !error && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">Chargement…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-600 dark:text-gray-300">
          <span>{data.total} entrée(s) · page {data.page} sur {data.pages}</span>
          <span className="flex gap-2">
            <button className={btn} disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</button>
            <button className={btn} disabled={loading || page >= data.pages} onClick={() => setPage(p => p + 1)}>Suivant</button>
          </span>
        </div>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">Les mots de passe ne sont jamais enregistrés. Les entrées plus anciennes que la durée de conservation (AUDIT_RETENTION_DAYS, 365 jours par défaut) sont supprimées chaque jour.</p>
    </div>
  );
}
