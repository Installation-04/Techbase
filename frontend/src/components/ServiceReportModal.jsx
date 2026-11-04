import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import SignaturePad from './SignaturePad';
import { parseDuration, formatDuration, SIGNATURE_MAX_BYTES, signatureDataUrlBytes } from '../lib/serviceReport.mjs';

const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1';

export default function ServiceReportModal({ workOrder, onClose }) {
  const [form, setForm] = useState({ work_done: '', parts_used: '', duration: '', observations: '', signer_name: '' });
  const [report, setReport] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [padEmpty, setPadEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const pad = useRef(null);

  useEffect(() => {
    axios.get(`/api/work-orders/${workOrder.id}/service-report`)
      .then(res => {
        const r = res.data;
        setReport(r);
        if (r) {
          setForm({
            work_done: r.work_done || '',
            parts_used: r.parts_used || '',
            duration: formatDuration(r.time_spent_minutes).replace(' h ', 'h'),
            observations: r.observations || '',
            signer_name: r.signer_name || '',
          });
        }
      })
      .catch(err => setError(err.response?.data?.error || 'Erreur de chargement'))
      .finally(() => setLoaded(true));
  }, [workOrder.id]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const base = `/api/work-orders/${workOrder.id}/service-report`;

  const save = async () => {
    setError('');
    setInfo('');
    const minutes = parseDuration(form.duration);
    if (form.duration.trim() && minutes === null) {
      setError('Durée non reconnue (exemples : 1h30, 45 min)');
      return null;
    }
    const body = {
      work_done: form.work_done,
      parts_used: form.parts_used,
      observations: form.observations,
      time_spent_minutes: minutes,
    };
    if (!padEmpty) {
      const signature = pad.current.toDataURL();
      if (signatureDataUrlBytes(signature) > SIGNATURE_MAX_BYTES) {
        setError('Signature trop volumineuse, effacez et recommencez avec un tracé plus simple');
        return null;
      }
      if (!form.signer_name.trim()) {
        setError('Indiquez le nom du signataire');
        return null;
      }
      body.signature = signature;
      body.signer_name = form.signer_name;
    }
    setBusy(true);
    try {
      const res = await axios.put(base, body);
      setReport(res.data);
      pad.current?.clear();
      return res.data;
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    const r = await save();
    if (r) setInfo(r.has_signature ? 'Rapport enregistré et signé.' : 'Rapport enregistré (non signé).');
  };

  const handleDownload = async () => {
    const r = await save();
    if (!r) return;
    try {
      const res = await axios.get(`${base}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapport-intervention-${workOrder.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.status === 501 ? "La génération de PDF n'est pas disponible sur ce déploiement" : 'Erreur lors de la génération du PDF');
    }
  };

  const handleAttach = async () => {
    const r = await save();
    if (!r) return;
    if (!r.has_signature) {
      setError('Le rapport doit être signé avant d\'être joint au dossier du client');
      return;
    }
    setBusy(true);
    try {
      await axios.post(`${base}/attach`);
      setInfo('PDF joint aux documents du client.');
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] flex flex-col">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Rapport d'intervention</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{workOrder.title} · {workOrder.client_name}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
          {error && <p className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</p>}
          {info && <p className="text-green-700 dark:text-green-400 text-sm bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">{info}</p>}
          {!loaded && <p className="text-sm text-gray-500 dark:text-gray-400">Chargement…</p>}

          <div>
            <label className={labelCls}>Travaux effectués</label>
            <textarea rows={4} maxLength={10000} value={form.work_done} onChange={set('work_done')} className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Pièces utilisées</label>
              <textarea rows={2} maxLength={5000} value={form.parts_used} onChange={set('parts_used')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Temps passé</label>
              <input value={form.duration} onChange={set('duration')} placeholder="ex. 1h30" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Observations</label>
            <textarea rows={3} maxLength={10000} value={form.observations} onChange={set('observations')} className={inputCls} />
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Signature du client</label>
              <button type="button" onClick={() => pad.current?.clear()} className="text-xs text-blue-600 dark:text-blue-400 hover:underline p-1">Effacer</button>
            </div>
            {report?.has_signature && padEmpty && (
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                Signé par {report.signer_name}. Enregistrer sans nouvelle signature retire cette signature : elle porte sur le contenu du rapport.
              </p>
            )}
            <SignaturePad ref={pad} onChange={setPadEmpty} />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Faites signer le client avec le doigt ou la souris.</p>
            <div className="mt-3">
              <label className={labelCls}>Nom du signataire</label>
              <input value={form.signer_name} onChange={set('signer_name')} maxLength={255} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-2">
          <button onClick={handleSave} disabled={busy} className="flex-1 min-w-[8rem] py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">Enregistrer</button>
          <button onClick={handleDownload} disabled={busy} className="flex-1 min-w-[8rem] py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 text-sm">Télécharger le PDF</button>
          <button onClick={handleAttach} disabled={busy} className="flex-1 min-w-[8rem] py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 text-sm">Joindre au client</button>
        </div>
      </div>
    </div>
  );
}
