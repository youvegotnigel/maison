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
function validDob(dob) {
    if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob))
        return false;
    const [y, m, d] = dob.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
function ageAtLeast18(dob) {
    const [y, m, d] = dob.split('-').map(Number);
    const today = new Date();
    let age = today.getFullYear() - y;
    if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d))
        age--;
    return age >= 18;
}
const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // localhost demo over http
    maxAge: 2 * 60 * 60 * 1000,
};
function publicUser(u) {
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
const VALID_GENDERS = ['female', 'male', 'non-binary', 'prefer_not_to_say'];
router.post('/register', (req, res) => {
    const { email, password, name, role } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) {
        return fail(res, 400, 'INVALID_EMAIL', 'Please provide a valid email address.');
    }
    if (!validPassword(password)) {
        return fail(res, 400, 'WEAK_PASSWORD', 'Password must be at least 8 characters and include a letter and a number.');
    }
    if (role !== 'buyer' && role !== 'seller') {
        return fail(res, 400, 'INVALID_ROLE', "Role must be either 'buyer' or 'seller'.");
    }
    const rawDob = String(req.body.dateOfBirth ?? '').trim();
    if (!rawDob) {
        return fail(res, 400, 'MISSING_DOB', 'Please provide your date of birth.');
    }
    if (!validDob(rawDob)) {
        return fail(res, 400, 'INVALID_DOB', 'Date of birth must be a valid date in YYYY-MM-DD format.');
    }
    if (!ageAtLeast18(rawDob)) {
        return fail(res, 400, 'UNDERAGE', 'You must be at least 18 years old to create an account.');
    }
    const dob = rawDob;
    let insertName;
    let firstName = null;
    let lastName = null;
    let gender = null;
    let phone = null;
    if (role === 'buyer') {
        firstName = String(req.body.firstName ?? '').trim();
        lastName = String(req.body.lastName ?? '').trim();
        if (!firstName)
            return fail(res, 400, 'INVALID_FIRST_NAME', 'Please provide your first name.');
        if (!lastName)
            return fail(res, 400, 'INVALID_LAST_NAME', 'Please provide your last name.');
        const rawGender = req.body.gender;
        if (rawGender != null && rawGender !== '') {
            if (!VALID_GENDERS.includes(rawGender)) {
                return fail(res, 400, 'INVALID_GENDER', 'Gender must be one of: female, male, non-binary, prefer_not_to_say.');
            }
            gender = rawGender;
        }
        const rawPhone = req.body.phone;
        if (rawPhone != null && rawPhone !== '') {
            if (String(rawPhone).length > 30) {
                return fail(res, 400, 'INVALID_PHONE', 'Phone number must not exceed 30 characters.');
            }
            phone = String(rawPhone);
        }
        insertName = `${firstName} ${lastName}`;
    }
    else {
        if (!name || !String(name).trim()) {
            return fail(res, 400, 'INVALID_NAME', 'Please provide your name.');
        }
        insertName = String(name).trim();
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
        return fail(res, 409, 'EMAIL_TAKEN', 'An account with that email already exists.');
    }
    const hash = bcrypt.hashSync(password, 8);
    const id = db.prepare('INSERT INTO users (email, password_hash, name, role, first_name, last_name, gender, phone, date_of_birth) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(email, hash, insertName, role, firstName, lastName, gender, phone, dob).lastInsertRowid;
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