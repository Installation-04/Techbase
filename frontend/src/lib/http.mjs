// A 401 from these endpoints means "those credentials were refused" (a wrong
// password, or the SSO token handed to the callback page was rejected) — NOT
// "your session expired". The global interceptor must leave them to their
// callers, which show an error message; logging out and hard-reloading the page
// would wipe that message.
const AUTH_ATTEMPT_PATHS = ['/api/users/login', '/api/users/register', '/api/users/me'];

export function shouldForceLogout(error) {
  if (error?.response?.status !== 401) return false;
  const path = String(error?.config?.url ?? '').split('?')[0];
  return !AUTH_ATTEMPT_PATHS.some(p => path === p || path.endsWith(p));
}
