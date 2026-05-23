import jwt from 'jsonwebtoken';

const SECRET = process.env.MAISON_JWT_SECRET || 'maison-demo-secret-do-not-use-in-prod';
const ACCESS_TTL = '2h';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

// Consistent error envelope used everywhere.
export function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// Reads the bearer token (or maison_token cookie) and attaches req.user.
// Does not reject when absent — use requireAuth for that.
export function authenticate(req, _res, next) {
  let token = null;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) token = header.slice(7);
  else if (req.cookies && req.cookies.maison_token) token = req.cookies.maison_token;

  if (token) {
    try {
      req.user = jwt.verify(token, SECRET);
    } catch {
      req.user = null;
      req.tokenInvalid = true;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return fail(res, 401, 'UNAUTHENTICATED', 'You must be signed in to do that.');
  }
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return fail(res, 401, 'UNAUTHENTICATED', 'You must be signed in to do that.');
    }
    if (req.user.role !== role) {
      return fail(res, 403, 'FORBIDDEN_ROLE', `This action requires the ${role} role.`);
    }
    next();
  };
}
