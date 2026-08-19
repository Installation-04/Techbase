// Acumatica contract-based REST API client (session-cookie auth).
// Docs: https://help.acumatica.com/Help?ScreenId=ShowWiki&pageid=... "Contract-Based REST API"
//
// Configuration (all via env vars, unset = integration disabled):
//   ACUMATICA_BASE_URL       e.g. https://mycompany.acumatica.com
//   ACUMATICA_USERNAME       API-enabled user
//   ACUMATICA_PASSWORD
//   ACUMATICA_COMPANY        tenant/company name in Acumatica
//   ACUMATICA_BRANCH         optional
//   ACUMATICA_ENDPOINT_NAME  optional, default "Default"
//   ACUMATICA_ENDPOINT_VERSION  optional, default "24.200.001"

function config() {
  return {
    baseUrl: process.env.ACUMATICA_BASE_URL,
    username: process.env.ACUMATICA_USERNAME,
    password: process.env.ACUMATICA_PASSWORD,
    company: process.env.ACUMATICA_COMPANY,
    branch: process.env.ACUMATICA_BRANCH,
    endpointName: process.env.ACUMATICA_ENDPOINT_NAME || 'Default',
    endpointVersion: process.env.ACUMATICA_ENDPOINT_VERSION || '24.200.001',
  };
}

function isConfigured() {
  const c = config();
  return !!(c.baseUrl && c.username && c.password && c.company);
}

function entityUrl(path) {
  const c = config();
  return `${c.baseUrl.replace(/\/$/, '')}/entity/${c.endpointName}/${c.endpointVersion}/${path}`;
}

async function login() {
  const c = config();
  const res = await fetch(`${c.baseUrl.replace(/\/$/, '')}/entity/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: c.username,
      password: c.password,
      company: c.company,
      branch: c.branch || undefined,
    }),
  });
  if (!res.ok) {
    throw new Error(`Échec de connexion Acumatica : ${res.status} ${await res.text()}`);
  }
  const cookie = res.headers.get('set-cookie');
  if (!cookie) {
    throw new Error('Acumatica n\'a pas renvoyé de session (vérifier les identifiants)');
  }
  return cookie;
}

async function logout(cookie) {
  const c = config();
  await fetch(`${c.baseUrl.replace(/\/$/, '')}/entity/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie },
  }).catch(() => {});
}

async function withSession(fn) {
  if (!isConfigured()) throw new Error('Intégration Acumatica non configurée');
  const cookie = await login();
  try {
    return await fn(cookie);
  } finally {
    await logout(cookie);
  }
}

// Maps a TechBase client row to an Acumatica Customer entity payload.
// TechBase only has a free-text address field, so it's a best-effort fit
// into AddressLine1 rather than Acumatica's structured address fields.
function clientToCustomerPayload(client, existingCustomerId) {
  const payload = { CustomerName: { value: client.name } };
  if (existingCustomerId) payload.CustomerID = { value: existingCustomerId };

  const mainContact = {};
  if (client.email) mainContact.Email = { value: client.email };
  if (client.phone) mainContact.Phone1 = { value: client.phone };
  if (client.address) mainContact.Address = { AddressLine1: { value: client.address } };
  if (Object.keys(mainContact).length > 0) payload.MainContact = mainContact;

  return payload;
}

async function testConnection() {
  await withSession(async (cookie) => {
    const res = await fetch(`${entityUrl('Customer')}?$top=1`, { headers: { Cookie: cookie } });
    if (!res.ok) throw new Error(`Requête de test Acumatica échouée : ${res.status}`);
  });
}

// Creates the customer if existingCustomerId is omitted, otherwise updates it.
// Returns the Acumatica CustomerID.
async function pushCustomer(client, existingCustomerId) {
  return withSession(async (cookie) => {
    const res = await fetch(entityUrl('Customer'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(clientToCustomerPayload(client, existingCustomerId)),
    });
    if (!res.ok) throw new Error(`Échec de synchronisation Acumatica : ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.CustomerID?.value;
  });
}

async function listCustomers({ top = 50 } = {}) {
  return withSession(async (cookie) => {
    const res = await fetch(`${entityUrl('Customer')}?$top=${top}`, { headers: { Cookie: cookie } });
    if (!res.ok) throw new Error(`Échec de récupération Acumatica : ${res.status} ${await res.text()}`);
    return res.json();
  });
}

module.exports = { isConfigured, testConnection, pushCustomer, listCustomers, clientToCustomerPayload };
