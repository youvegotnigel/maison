import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { signToken, fail, requireAuth } from '../auth.js';
const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validPassword(pw) {
    // At least 8 chars, one letter and one number.
    return typeof pw === 'string' && pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}
const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // localhost demo over http
    maxAge: 2 * 60 * 60 * 1000,
};
function publicUser(u) {
    return { id: u.id, email: u.email, name: u.name, role: u.role };
}
router.post('/register', (req, res) => {
    const { email, password, name, role } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) {
        return fail(res, 400, 'INVALID_EMAIL', 'Please provide a valid email address.');
    }
    if (!validPassword(password)) {
        return fail(res, 400, 'WEAK_PASSWORD', 'Password must be at least 8 characters and include a letter and a number.');
    }
    if (!name || !String(name).trim()) {
        return fail(res, 400, 'INVALID_NAME', 'Please provide your name.');
    }
    if (role !== 'buyer' && role !== 'seller') {
        return fail(res, 400, 'INVALID_ROLE', "Role must be either 'buyer' or 'seller'.");
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
        return fail(res, 409, 'EMAIL_TAKEN', 'An account with that email already exists.');
    }
    const hash = bcrypt.hashSync(password, 8);
    const id = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)').run(email, hash, String(name).trim(), role).lastInsertRowid;
    if (role === 'buyer') {
        db.prepare('INSERT INTO carts (buyer_id) VALUES (?)').run(id);
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const token = signToken(user);
    res.cookie('maison_token', token, cookieOpts);
    return res.status(201).json({ token, user: publicUser(user) });
});
router.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return fail(res, 400, 'MISSING_CREDENTIALS', 'Email and password are required.');
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    const token = signToken(user);
    res.cookie('maison_token', token, cookieOpts);
    return res.json({ token, user: publicUser(user) });
});
router.post('/logout', (req, res) => {
    res.clearCookie('maison_token', { httpOnly: true, sameSite: 'lax', secure: false });
    return res.json({ ok: true });
});
router.get('/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
    if (!user)
        return fail(res, 404, 'NOT_FOUND', 'User not found.');
    return res.json({ user: publicUser(user) });
});
export default router;
//# sourceMappingURL=auth.js.map