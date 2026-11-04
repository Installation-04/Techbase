import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { formatDate } from '../lib/dates.mjs';

const STATUS_LABELS = { open: 'Ouvert', assigned: 'Assigné', in_progress: 'En cours', done: 'Terminé' };
const STATUS_BADGE = {
  open: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  assigned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  done: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
};
const PRIORITY_LABELS = { low: 'Basse', medium: 'Moyenne', high: 'Haute', urgent: 'Urgente' };
const PRIORITY_COLORS = {
  low: 'text-gray-500 dark:text-gray-400',
  medium: 'text-blue-600 dark:text-blue-400',
  high: 'text-orange-600 dark:text-orange-400',
  urgent: 'text-red-600 dark:text-red-400 font-semibold',
};

// The technician's calendar day, not the server's: "YYYY-MM-DD" from the local clock.
function localDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const mapsUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
// Digits only (a leading + is kept); null when nothing dialable, e.g. "n/a".
const telHref = (phone) => {
  const digits = phone.replace(/[^\d]/g, '');
  return digits ? `tel:${phone.trim().startsWith('+') ? '+' : ''}${digits}` : null;
};
const timeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };

const TOUCH = 'min-h-[44px] inline-flex items-center justify-center rounded-lg text-sm font-medium px-4 transition-colors';
const NEUTRAL_BTN = `${TOUCH} bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700`;

function WorkOrderCard({ wo, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  const transition = async (status) => {
    setBusy(true);
    try {
      await axios.post(`/api/work-orders/${wo.id}/status`, { status });
      await onChanged();
    } catch (err) {
      onError(err.response?.data?.error || 'Impossible de changer le statut');
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      await axios.post(`/api/clients/${wo.client_id}/logbook`, {
        title: `Note : ${wo.title}`.slice(0, 255),
        content: note.trim(),
        type: 'note',
      });
      setNote('');
      setNoteOpen(false);
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 3000);
    } catch (err) {
      onError(err.response?.data?.error || "Impossible d'enregistrer la note");
    } finally {
      setBusy(false);
    }
  };

  const done = wo.status === 'done';
  const link = 'text-blue-700 dark:text-blue-400 underline underline-offset-2';

  return (
    <li
      className={`bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-4 ${
        wo.status === 'in_progress' ? 'border-amber-300 dark:border-amber-700' : 'border-gray-100 dark:border-gray-800'
      } ${done ? 'opacity-80' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[wo.status] || STATUS_BADGE.open}`}>
          {STATUS_LABELS[wo.status] || wo.status}
        </span>
        {wo.overdue && (
          <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
            En retard · {formatDate(wo.due_date)}
          </span>
        )}
        <span className={`text-xs ml-auto ${PRIORITY_COLORS[wo.priority]}`}>{PRIORITY_LABELS[wo.priority]}</span>
      </div>

      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 break-words">{wo.title}</h2>
      <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 break-words">
        {wo.client_name}
        {wo.equipment_name && <span className="text-gray-500 dark:text-gray-400"> · {wo.equipment_name}</span>}
      </p>
      {wo.description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-3 break-words">{wo.description}</p>
      )}

      {(wo.client_address || wo.client_phone) && (
        <div className="mt-2 flex flex-col">
          {wo.client_address && (
            <a
              href={mapsUrl(wo.client_address)}
              target="_blank"
              rel="noopener noreferrer"
              className={`min-h-[44px] flex items-center gap-2 text-sm ${link}`}
            >
              <span aria-hidden="true">📍</span>
              <span className="break-words min-w-0">{wo.client_address}</span>
            </a>
          )}
          {wo.client_phone && (telHref(wo.client_phone)
            ? <a href={telHref(wo.client_phone)} className={`min-h-[44px] flex items-center gap-2 text-sm ${link}`}>
              <span aria-hidden="true">📞</span>
              <span>{wo.client_phone}</span>
            </a>
            : <p className="min-h-[44px] flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span aria-hidden="true">📞</span><span>{wo.client_phone}</span>
            </p>)}
        </div>
      )}

      {noteOpen && (
        <form onSubmit={saveNote} className="mt-2 space-y-2">
          <label className="sr-only" htmlFor={`note-${wo.id}`}>Note</label>
          <textarea
            id={`note-${wo.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Note pour le journal du client…"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-base"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !note.trim()}
              className={`${TOUCH} flex-1 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}
            >
              Enregistrer la note
            </button>
            <button type="button" onClick={() => setNoteOpen(false)} className={NEUTRAL_BTN}>
              Annuler
            </button>
          </div>
        </form>
      )}
      {noteSaved && (
        <p role="status" className="mt-2 text-sm text-green-700 dark:text-green-400">Note ajoutée au journal ✓</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {(wo.status === 'open' || wo.status === 'assigned') && (
          <button
            onClick={() => transition('in_progress')}
            disabled={busy}
            className={`${TOUCH} flex-1 min-w-[8rem] bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50`}
          >
            ▶ Démarrer
          </button>
        )}
        {wo.status === 'in_progress' && (
          <button
            onClick={() => transition('done')}
            disabled={busy}
            className={`${TOUCH} flex-1 min-w-[8rem] bg-green-700 text-white hover:bg-green-800 disabled:opacity-50`}
          >
            ✓ Terminer
          </button>
        )}
        {done && (
          <button onClick={() => transition('in_progress')} disabled={busy} className={`${NEUTRAL_BTN} flex-1 min-w-[8rem] disabled:opacity-50`}>
            Rouvrir
          </button>
        )}
        {!noteOpen && (
          <button onClick={() => setNoteOpen(true)} className={NEUTRAL_BTN}>
            📝 Note
          </button>
        )}
        <Link to={`/clients/${wo.client_id}?tab=workorders`} className={NEUTRAL_BTN}>
          Détails →
        </Link>
      </div>
    </li>
  );
}

export default function Journee() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const latest = useRef(0);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    try {
      const res = await axios.get('/api/work-orders/my-day', { params: { date: localDate(), tz: timeZone() }, timeout: 15000 });
      if (mine !== latest.current) return; // a newer refresh already answered
      setData(res.data);
      setLoadError('');
    } catch (err) {
      if (mine !== latest.current) return;
      setLoadError(err.response?.data?.error
        || (err.request ? 'Connexion impossible : vérifiez votre réseau puis actualisez' : 'Impossible de charger votre journée'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // A phone keeps this tab alive overnight and between jobs: refresh on return so the
  // day (and the "En retard" flags) never stay on yesterday.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);
  // Tells the phone landing redirect (App.jsx) that this session already started here.
  useEffect(() => { try { sessionStorage.setItem('journee-landed', '1'); } catch { /* ignore */ } }, []);

  const handleError = (msg) => { setActionError(msg); load(); };
  const onChanged = async () => { setActionError(''); await load(); };

  const orders = data?.workOrders || [];
  const todo = orders.filter(w => w.status !== 'done');
  const finished = orders.filter(w => w.status === 'done');
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Ma journée</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{today}</p>
        </div>
        <button
          onClick={load}
          className={`${TOUCH} bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200`}
        >
          ↻ Actualiser
        </button>
      </div>

      {(loadError || actionError) && (
        <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
          {loadError || actionError}
        </p>
      )}

      {!data && !loadError && <p className="text-gray-500 dark:text-gray-400 text-sm">Chargement…</p>}

      {data && orders.length === 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-8 text-center text-gray-500 dark:text-gray-400">
          <p className="text-3xl mb-2" aria-hidden="true">🎉</p>
          <p>Rien de prévu pour aujourd'hui.</p>
          <Link to="/work-orders" className="inline-flex items-center min-h-[44px] mt-2 text-blue-700 dark:text-blue-400 underline">
            Voir tous les bons de service
          </Link>
        </div>
      )}

      {todo.length > 0 && (
        <>
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">À faire · {todo.length}</p>
          <ul className="space-y-3 mb-6">
            {todo.map(wo => <WorkOrderCard key={wo.id} wo={wo} onChanged={onChanged} onError={handleError} />)}
          </ul>
        </>
      )}

      {finished.length > 0 && (
        <>
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Terminés aujourd'hui · {finished.length}</p>
          <ul className="space-y-3 mb-6">
            {finished.map(wo => <WorkOrderCard key={wo.id} wo={wo} onChanged={onChanged} onError={handleError} />)}
          </ul>
        </>
      )}
    </div>
  );
}
