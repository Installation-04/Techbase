import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import Users from './Users';
import AuditLog from './AuditLog';
import { MODE_LABELS, updateInstructions, formatBytes, formatDuration, plainNotes } from '../lib/adminInfo.mjs';

const TABS = [
  { id: 'system', label: 'Système' },
  { id: 'users', label: 'Utilisateurs' },
  { id: 'health', label: 'Santé' },
  { id: 'audit', label: "Journal d'audit" },
];

function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 ${className}`}>
      {title && <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{title}</h2>}
      {children}
    </div>
  );
}

function Badge({ tone, children }) {
  const tones = {
    green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tones[tone]}`}>{children}</span>;
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-900 dark:text-gray-100 text-right">{children}</dd>
    </div>
  );
}

const STATE_LABELS = { idle: 'Aucune mise à jour récente', running: 'Mise à jour en cours…', success: 'Mise à jour terminée', rolled_back: 'Retour à la version précédente', failed: 'Échec de la mise à jour' };

// One-click update (only offered when the opt-in updater service is running).
function UpdaterCard({ info, onFinished }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [polling, setPolling] = useState(false);

  const poll = async () => {
    try {
      const res = await axios.get('/api/admin/update/status');
      setStatus(res.data);
      if (res.data.state !== 'running') { setPolling(false); if (res.data.state === 'success') onFinished?.(); }
    } catch { /* the app restarts during an update: keep trying */ }
  };

  useEffect(() => { poll(); }, []);
  useEffect(() => {
    if (!polling) return undefined;
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [polling]);
  useEffect(() => { if (status?.state === 'running') setPolling(true); }, [status?.state]);

  const start = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await axios.post('/api/admin/update', { version: info.latest.version, password });
      setOpen(false); setPassword('');
      setStatus({ state: 'running', from: info.version, to: info.latest.version, log: [] });
      setPolling(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const running = status?.state === 'running';
  const tone = { success: 'text-green-600 dark:text-green-400', rolled_back: 'text-amber-600 dark:text-amber-400', failed: 'text-red-600 dark:text-red-400' }[status?.state] || 'text-gray-700 dark:text-gray-200';

  return (
    <Card title="Mise à jour en un clic" className="lg:col-span-2">
      {status && status.state !== 'idle' && (
        <div className="mb-4">
          <p className={`text-sm font-medium ${tone}`}>{STATE_LABELS[status.state]}{status.from && ` · v${status.from} → v${status.to}`}</p>
          {status.error && <p className="text-sm text-gray-700 dark:text-gray-200 mt-1">{status.error}</p>}
          {status.backup && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sauvegarde : <code>backups/{status.backup}</code></p>}
          {status.log?.length > 0 && (
            <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap">{status.log.join('\n')}</pre>
          )}
          {running && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">L'application redémarre : cette page peut se déconnecter quelques secondes. Elle se met à jour toute seule.</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {info.updateAvailable && !running && (
          <button onClick={() => setOpen(true)} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Mettre à jour vers v{info.latest.version}</button>
        )}
        {status?.from && !running && status.state !== 'idle' && (
          <RollbackButton version={status.from} />
        )}
        {!info.updateAvailable && !running && <p className="text-sm text-gray-500 dark:text-gray-400">Vous utilisez déjà la dernière version publiée.</p>}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Confirmer la mise à jour">
          <form onSubmit={start} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Mettre à jour vers v{info.latest.version} ?</h3>
            <ul className="text-sm text-gray-600 dark:text-gray-300 mt-3 space-y-1 list-disc list-inside">
              <li>Une <strong>sauvegarde</strong> de la base et des documents est faite d'abord.</li>
              <li>L'application sera <strong>indisponible environ une minute</strong>.</li>
              <li>Si la nouvelle version ne démarre pas, <strong>l'ancienne est remise automatiquement</strong>.</li>
            </ul>
            <label className="block text-sm text-gray-700 dark:text-gray-200 mt-4">Votre mot de passe
              <input type="password" autoFocus required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"
                className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm" />
            </label>
            {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => { setOpen(false); setError(''); setPassword(''); }} className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Annuler</button>
              <button type="submit" disabled={busy || !password} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{busy ? 'Envoi…' : 'Mettre à jour'}</button>
            </div>
          </form>
        </div>
      )}
    </Card>
  );
}

function RollbackButton({ version }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await axios.post('/api/admin/update/rollback', { password }); window.location.reload(); }
    catch (err) { setError(err.response?.data?.error || 'Erreur'); }
  };
  if (!open) return <button onClick={() => setOpen(true)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Revenir à v{version}</button>;
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input type="password" required autoFocus placeholder="Votre mot de passe" value={password} onChange={e => setPassword(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm" />
      <button type="submit" className="px-3 py-2 rounded-lg bg-gray-800 text-white text-sm dark:bg-gray-200 dark:text-gray-900">Confirmer le retour</button>
      {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </form>
  );
}

function SystemTab() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('/api/admin/system').then(res => setInfo(res.data)).catch(() => setError('Impossible de lire les informations du système.'));
  }, []);

  if (error) return <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>;
  if (!info) return <p className="text-gray-500 dark:text-gray-400 text-sm">Chargement…</p>;

  const instructions = updateInstructions(info, info.latest?.version);
  let status;
  if (!info.checked) status = <Badge tone="gray">{info.reason === 'disabled' ? 'Vérification désactivée' : 'Version la plus récente inconnue'}</Badge>;
  else if (info.updateAvailable) status = <Badge tone="amber">Mise à jour disponible</Badge>;
  else status = <Badge tone="green">À jour</Badge>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="Version">
        <dl>
          <Row label="Version installée">v{info.version}</Row>
          <Row label="Dernière version publiée">{info.latest ? <>v{info.latest.version}{info.latest.prerelease && <span className="text-gray-400"> (bêta)</span>}</> : '—'}</Row>
          <Row label="État">{status}</Row>
          <Row label="Type d'installation">{MODE_LABELS[info.mode] || info.mode}</Row>
          {info.pinned && <Row label="Version fixée dans .env"><code className="text-xs">{info.pinned}</code></Row>}
        </dl>
        {!info.checked && info.reason === 'unreachable' && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">GitHub n'a pas pu être joint depuis le serveur (hors ligne ou limite atteinte). Réessayez plus tard.</p>
        )}
      </Card>

      <Card title={info.updateAvailable ? `Mettre à jour vers v${info.latest.version}` : 'Mettre à jour'}>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{info.updaterAvailable ? 'À la main (le bouton ci-dessus fait la même chose)' : instructions.title}</p>
        {!info.updaterAvailable && info.fromRelease && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Pour mettre à jour en un clic depuis cette page, activez le service de mise à jour : voir « Mise à jour en un clic » dans la documentation.</p>}
        <ol className="space-y-2 list-decimal list-inside text-sm text-gray-700 dark:text-gray-200">
          {instructions.steps.map(step => (
            <li key={step} className="break-words">{step.startsWith('docker') || step.startsWith('git') ? <code className="text-xs bg-gray-100 dark:bg-gray-800 rounded px-1.5 py-0.5">{step}</code> : step}</li>
          ))}
        </ol>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">Sauvegardez d'abord : <a className="text-blue-600 dark:text-blue-400 underline" href="https://github.com/Installation-04/Techbase/wiki/Installation#sauvegarde-et-restauration" target="_blank" rel="noreferrer">Sauvegarde et restauration</a>.</p>
      </Card>

      {info.updaterAvailable && <UpdaterCard info={info} onFinished={() => axios.get('/api/admin/system').then(r => setInfo(r.data)).catch(() => {})} />}

      {info.latest && (
        <Card title={`Notes de la version v${info.latest.version}`} className="lg:col-span-2">
          <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words max-h-80 overflow-y-auto">{plainNotes(info.latest.notes) || 'Aucune note.'}</div>
          {info.latest.url && (
            <a className="inline-block mt-3 text-sm text-blue-600 dark:text-blue-400 underline" href={info.latest.url} target="_blank" rel="noreferrer">Voir la version sur GitHub</a>
          )}
        </Card>
      )}
    </div>
  );
}

function HealthTab() {
  const [h, setH] = useState(null);
  const [error, setError] = useState('');
  const load = () => axios.get('/api/admin/health').then(res => setH(res.data)).catch(() => setError('Impossible de lire l\'état du serveur.'));
  useEffect(() => { load(); }, []);

  if (error) return <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>;
  if (!h) return <p className="text-gray-500 dark:text-gray-400 text-sm">Chargement…</p>;

  const free = h.disk ? h.disk.freeBytes / h.disk.totalBytes : null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="Services">
        <dl>
          <Row label="Base de données">{h.database?.ok ? <Badge tone="green">Connectée · {h.database.latencyMs} ms</Badge> : <Badge tone="red">Injoignable</Badge>}</Row>
          <Row label="Serveur en marche depuis">{formatDuration(h.uptimeSeconds)}</Row>
          <Row label="Tâches quotidiennes">
            {h.scheduler
              ? <>Dernier passage le {new Date(h.scheduler.at).toLocaleString('fr-CA')} · {h.scheduler.created} bon(s) créé(s)</>
              : <span className="text-gray-500 dark:text-gray-400">Aucun passage enregistré</span>}
          </Row>
          <Row label="Courriels (Resend)">{h.email ? <Badge tone="green">Configurés</Badge> : <Badge tone="gray">Non configurés</Badge>}</Row>
          <Row label="Connexion SSO">
            {[h.sso?.google && 'Google', h.sso?.microsoft && 'Microsoft'].filter(Boolean).join(', ') || <span className="text-gray-500 dark:text-gray-400">Aucune</span>}
          </Row>
        </dl>
      </Card>
      <Card title="Données">
        <dl>
          {h.counts && <>
            <Row label="Utilisateurs">{h.counts.users}</Row>
            <Row label="Clients">{h.counts.clients}</Row>
            <Row label="Bons de service ouverts">{h.counts.open_work_orders}</Row>
          </>}
          {h.uploads && <Row label="Documents téléversés">{formatBytes(h.uploads.bytes)}{h.uploads.truncated && '+'}</Row>}
          {h.disk && <Row label="Espace disque libre">
            {formatBytes(h.disk.freeBytes)} sur {formatBytes(h.disk.totalBytes)} {free < 0.1 && <Badge tone="red">Presque plein</Badge>}
          </Row>}
        </dl>
      </Card>
      <div className="lg:col-span-2">
        <button onClick={load} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Actualiser</button>
      </div>
    </div>
  );
}

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'system';

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-6">Administration</h1>
      <div role="tablist" className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'system' && <SystemTab />}
      {tab === 'users' && <Users />}
      {tab === 'health' && <HealthTab />}
      {tab === 'audit' && <AuditLog />}
    </div>
  );
}
