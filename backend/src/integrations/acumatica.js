// Acumatica contract-based REST API client (session-cookie auth).
// Docs: Acumatica "Contract-Based REST API".
//
// Credentials are per-user (each user connects their own Acumatica
// tenant — see backend/src/routes/integrations.js), passed in explicitly
// as a `creds` object rather than read from process.env:
//   { baseUrl, username, password, company, branch, endpointName, endpointVersion }
//
// envCreds() below reads the optional deployment-wide fallback env vars
// (ACUMATICA_BASE_URL etc.), used only when a user hasn't connected their
// own account.

function envCreds() {
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

function isConfigured(creds) {
  return !!(creds && creds.baseUrl && creds.username && creds.password && creds.company);
}

function entityUrl(creds, path) {
  const endpointName = creds.endpointName || 'Default';
  const endpointVersion = creds.endpointVersion || '24.200.001';
  return `${creds.baseUrl.replace(/\/$/, '')}/entity/${endpointName}/${endpointVersion}/${path}`;
}

async function login(creds) {
  const res = await fetch(`${creds.baseUrl.replace(/\/$/, '')}/entity/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: creds.username,
      password: creds.password,
      company: creds.company,
      branch: creds.branch || undefined,
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

async function logout(creds, cookie) {
  await fetch(`${creds.baseUrl.replace(/\/$/, '')}/entity/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie },
  }).catch(() => {});
}

async function withSession(creds, fn) {
  if (!isConfigured(creds)) throw new Error('Identifiants Acumatica manquants');
  const cookie = await login(creds);
  try {
    return await fn(cookie);
  } finally {
    await logout(creds, cookie);
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

async function testConnection(creds) {
  await withSession(creds, async (cookie) => {
    const res = await fetch(`${entityUrl(creds, 'Customer')}?$top=1`, { headers: { Cookie: cookie } });
    if (!res.ok) throw new Error(`Requête de test Acumatica échouée : ${res.status}`);
  });
}

// Creates the customer if existingCustomerId is omitted, otherwise updates it.
// Returns the Acumatica CustomerID.
async function pushCustomer(creds, client, existingCustomerId) {
  return withSession(creds, async (cookie) => {
    const res = await fetch(entityUrl(creds, 'Customer'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(clientToCustomerPayload(client, existingCustomerId)),
    });
    if (!res.ok) throw new Error(`Échec de synchronisation Acumatica : ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.CustomerID?.value;
  });
}

module.exports = { envCreds, isConfigured, testConnection, pushCustomer, clientToCustomerPayload };
