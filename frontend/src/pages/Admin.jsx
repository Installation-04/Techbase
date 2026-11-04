import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import Users from './Users';
import { MODE_LABELS, updateInstructions, formatBytes, formatDuration, plainNotes } from '../lib/adminInfo.mjs';

const TABS = [
  { id: 'system', label: 'Système' },
  { id: 'users', label: 'Utilisateurs' },
  { id: 'health', label: 'Santé' },
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
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{instructions.title}</p>
        <ol className="space-y-2 list-decimal list-inside text-sm text-gray-700 dark:text-gray-200">
          {instructions.steps.map(step => (
            <li key={step} className="break-words">{step.startsWith('docker') || step.startsWith('git') ? <code className="text-xs bg-gray-100 dark:bg-gray-800 rounded px-1.5 py-0.5">{step}</code> : step}</li>
          ))}
        </ol>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">Sauvegardez d'abord : <a className="text-blue-600 dark:text-blue-400 underline" href="https://github.com/Installation-04/Techbase/wiki/Installation#sauvegarde-et-restauration" target="_blank" rel="noreferrer">Sauvegarde et restauration</a>.</p>
      </Card>

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
    </div>
  );
}
