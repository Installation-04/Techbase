const test = require('node:test');
const assert = require('node:assert/strict');
const { isConfigured, clientToCustomerPayload, envCreds } = require('../src/integrations/acumatica');

test('isConfigured is false for an empty/partial creds object', () => {
  assert.equal(isConfigured(null), false);
  assert.equal(isConfigured({}), false);
  assert.equal(isConfigured({ baseUrl: 'https://example.acumatica.com' }), false);
});

test('isConfigured is true once base URL, credentials, and company are set', () => {
  assert.equal(isConfigured({
    baseUrl: 'https://example.acumatica.com',
    username: 'api-user',
    password: 'secret',
    company: 'MyCompany',
  }), true);
});

test('envCreds reads the optional deployment-wide fallback from env vars', () => {
  delete process.env.ACUMATICA_BASE_URL;
  delete process.env.ACUMATICA_USERNAME;
  delete process.env.ACUMATICA_PASSWORD;
  delete process.env.ACUMATICA_COMPANY;
  assert.equal(isConfigured(envCreds()), false);

  process.env.ACUMATICA_BASE_URL = 'https://example.acumatica.com';
  process.env.ACUMATICA_USERNAME = 'api-user';
  process.env.ACUMATICA_PASSWORD = 'secret';
  process.env.ACUMATICA_COMPANY = 'MyCompany';
  assert.equal(isConfigured(envCreds()), true);
  delete process.env.ACUMATICA_BASE_URL;
  delete process.env.ACUMATICA_USERNAME;
  delete process.env.ACUMATICA_PASSWORD;
  delete process.env.ACUMATICA_COMPANY;
});

test('clientToCustomerPayload maps name, email, phone, and address', () => {
  const payload = clientToCustomerPayload({
    name: 'Acme Corp',
    email: 'contact@acme.com',
    phone: '555-0100',
    address: '123 Main St',
  });
  assert.equal(payload.CustomerName.value, 'Acme Corp');
  assert.equal(payload.MainContact.Email.value, 'contact@acme.com');
  assert.equal(payload.MainContact.Phone1.value, '555-0100');
  assert.equal(payload.MainContact.Address.AddressLine1.value, '123 Main St');
  assert.equal(payload.CustomerID, undefined);
});

test('clientToCustomerPayload includes CustomerID when updating an existing link', () => {
  const payload = clientToCustomerPayload({ name: 'Acme Corp' }, 'CUST001');
  assert.equal(payload.CustomerID.value, 'CUST001');
});

test('clientToCustomerPayload omits MainContact entirely when no contact fields are set', () => {
  const payload = clientToCustomerPayload({ name: 'Acme Corp' });
  assert.equal(payload.MainContact, undefined);
});
