// middlewares/authGuard.js

/**
 * Returns true when the request is targeting an API endpoint (JSON response expected).
 */
const isApiRequest = (req) =>
  req.originalUrl.startsWith('/api/') || req.accepts('json') === 'json';

/**
 * Blocks unauthenticated users.
 * SSR routes redirect to the login page; API routes receive 401 JSON.
 */
export const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  if (isApiRequest(req)) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  res.redirect('/auth/login');
};

/**
 * Blocks users whose role does not match the required role.
 * SSR routes render a 403 error page (or redirect to login if unauthenticated);
 * API routes return 401/403 JSON.
 *
 * @param {string} role - The required role (e.g. 'organiser')
 */
export const ensureRole = (role) => (req, res, next) => {
  if (!req.isAuthenticated()) {
    if (isApiRequest(req)) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    return res.redirect('/auth/login');
  }
  if (req.user.role !== role) {
    if (isApiRequest(req)) {
      return res.status(403).json({ error: 'You do not have permission to access this resource.' });
    }
    return res.status(403).render('error', {
      title: 'Forbidden',
      message: 'You do not have permission to access this resource.',
    });
  }
  next();
};
