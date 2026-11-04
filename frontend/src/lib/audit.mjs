// Helpers for the audit-log screen (Admin → Journal d'audit).

export const ACTION_LABELS = {
  'login.success': 'Connexion réussie',
  'login.failure': 'Connexion échouée',
  'user.registered': 'Inscription',
  'user.created': 'Utilisateur créé',
  'user.role_changed': 'Rôle modifié',
  'user.password_changed': 'Mot de passe modifié',
  'user.email_changed': 'Courriel modifié',
  'user.deleted': 'Utilisateur supprimé',
  'sso.account_linked': 'Compte SSO lié',
  'vault.reveal': 'Mot de passe affiché',
  'vault.copy': 'Mot de passe copié',
  'vault.created': 'Entrée du coffre créée',
  'vault.updated': 'Entrée du coffre modifiée',
  'vault.deleted': 'Entrée du coffre supprimée',
  'integration.acumatica.connected': 'Acumatica connecté',
  'integration.acumatica.disconnected': 'Acumatica déconnecté',
  'integration.acumatica.pushed': 'Client envoyé à Acumatica',
  'client.created': 'Client créé',
  'client.updated': 'Client modifié',
  'client.deleted': 'Client supprimé',
  'document.uploaded': 'Document ajouté',
  'document.downloaded': 'Document téléchargé',
  'document.deleted': 'Document supprimé',
  'audit.exported': 'Journal exporté',
  'audit.purged': 'Journal purgé',
  'update.requested': 'Mise à jour demandée',
  'update.rollback_requested': 'Retour arrière demandé',
  'update.success': 'Mise à jour réussie',
  'update.failed': 'Mise à jour échouée',
  'update.rolled_back': 'Mise à jour annulée',
};

// Filter dropdown: a prefix (ending with ".") matches a whole family on the server.
export const ACTION_GROUPS = [
  { value: '', label: 'Toutes les actions' },
  { value: 'login.', label: 'Connexions' },
  { value: 'user.', label: 'Utilisateurs' },
  { value: 'sso.', label: 'SSO' },
  { value: 'vault.', label: 'Coffre-fort' },
  { value: 'integration.', label: 'Intégrations' },
  { value: 'client.', label: 'Clients' },
  { value: 'document.', label: 'Documents' },
  { value: 'update.', label: 'Mises à jour' },
  { value: 'audit.', label: 'Journal' },
];

export function actionLabel(action) {
  return ACTION_LABELS[action] || action;
}

// 'red' | 'amber' | 'gray': drives the badge colour.
export function actionTone(action) {
  if (/^login\.failure$|\.deleted$|\.failed$/.test(action)) return 'red';
  if (/^vault\.(reveal|copy)$|role_changed|password_changed|\.disconnected$|rolled_back|rollback/.test(action)) return 'amber';
  return 'gray';
}

// Only non-empty filters go in the URL; resetting the page is the caller's job.
export function auditQuery(filters, extra = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) {
    if (v !== '' && v != null) p.set(k, String(v));
  }
  return p.toString();
}

export function formatDetail(detail) {
  if (!detail || typeof detail !== 'object') return '';
  return Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' · ');
}

export function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'medium' });
}
