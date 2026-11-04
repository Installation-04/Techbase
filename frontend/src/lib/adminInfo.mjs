// Pure helpers for the admin panel (kept free of React so they can be unit-tested).

export const MODE_LABELS = {
  'all-in-one': 'Conteneur unique',
  'four-containers': 'Quatre conteneurs',
  netlify: 'Netlify',
  source: 'Code source (images construites localement)',
};

// The commands an admin runs to update by hand, for each way TechIBase can be installed.
export function updateInstructions({ mode, fromRelease }, latestVersion) {
  const v = latestVersion || 'X.Y.Z';
  if (mode === 'netlify') {
    return { title: 'Installation Netlify', steps: ['Les mises à jour de cette installation passent par Netlify : déployez le nouveau code depuis votre dépôt.'] };
  }
  if (fromRelease) {
    return {
      title: 'Images publiées',
      steps: [
        `Dans le dossier d'installation, éditez .env : TECHIBASE_VERSION=${v}`,
        'docker compose pull && docker compose up -d --wait',
      ],
    };
  }
  return {
    title: 'Code source',
    steps: ['git pull', 'docker compose up -d --build --wait'],
  };
}

export function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatDuration(seconds) {
  if (seconds == null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} j ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

// Release notes are GitHub Markdown; show them as readable plain text (no HTML is ever rendered).
export function plainNotes(markdown) {
  return String(markdown || '')
    .replace(/\r/g, '')
    .split('\n')
    .filter(line => !/^\s*```/.test(line) || false)
    .map(line => line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*[-*]\s+/, '• ')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
