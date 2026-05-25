import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { signToken, fail } from '../auth.js';
import type { DbUser } from '../db.js';
import originalAuthRouter from './auth.js';

const router = Router();

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: false,
  maxAge: 2 * 60 * 60 * 1000,
} as const;

function publicUser(u: DbUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    firstName: u.first_name ?? null,
    lastName: u.last_name ?? null,
    gender: u.gender ?? null,
    phone: u.phone ?? null,
    dateOfBirth: u.date_of_birth,
  };
}

// INTENTIONALLY VULNERABLE — dev security testing only.
// The email field is interpolated directly into the SQL string.
// Payload  : email = "' OR '1'='1' --", password = "Password123!"
// Effect   : query returns first seeded user; bcrypt passes → 200 + valid token.
// Detection: bare ' causes SQLite syntax error → 500 (error-based scanners).
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return fail(res, 400, 'MISSING_CREDENTIALS', 'Email and password are required.');
  }
  const user = db.prepare(
    `SELECT * FROM users WHERE email = '${email}'`
  ).get() as DbUser | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  const token = signToken(user);
  res.cookie('maison_token', token, cookieOpts);
  return res.json({ token, user: publicUser(user) });
});

// All other auth routes (register, logout, me) are handled by the original secure router.
router.use(originalAuthRouter);

export default router;
