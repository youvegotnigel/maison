import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed, SEED_INFO } from './db.js';
import { authenticate, fail } from './auth.js';
import authVulnRoutes from './routes/auth.vuln.js';
import productRoutes from './routes/products.js';
import cartRoutes, { ordersRouter } from './routes/cart.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT_VULN || 4001);
const ORIGIN = `http://localhost:${PORT}`;
seed();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    next();
});
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS')
        return res.sendStatus(204);
    next();
});
app.use(authenticate);
const api = express.Router();
api.get('/health', (_req, res) => res.json({ status: 'ok', service: 'maison-vuln', time: new Date().toISOString() }));
api.get('/seed-info', (_req, res) => res.json(SEED_INFO));
api.post('/_reset', (req, res) => {
    if (process.env.MAISON_ALLOW_RESET === 'false') {
        return fail(res, 403, 'RESET_DISABLED', 'Reset endpoint is disabled.');
    }
    seed();
    res.json({ ok: true, reseeded: true });
});
// No rate limiter — scanners need unrestricted access to the auth endpoints.
api.use('/auth', authVulnRoutes);
api.use('/products', productRoutes);
api.use('/cart', cartRoutes);
api.use('/orders', ordersRouter);
app.use('/api/v1', api);
app.use('/api', (_req, res) => fail(res, 404, 'NOT_FOUND', 'Unknown API route.'));
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
app.use(express.static(webDist));
app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
});
const errorHandler = (err, _req, res, _next) => {
    const e = err;
    if (e && e.type === 'entity.parse.failed') {
        return fail(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
    }
    console.error('[maison-vuln] unexpected error:', err);
    return fail(res, 500, 'INTERNAL', 'An unexpected error occurred.');
};
app.use(errorHandler);
app.listen(PORT, () => {
    console.log('\n  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log('  !!  MAISON VULN SERVER -- DO NOT USE IN PRODUCTION  !!');
    console.log('  !!  Intentional SQL injection: POST /api/v1/auth/login  !!');
    console.log('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log(`\n  Running at ${ORIGIN}`);
    console.log(`  API base:  ${ORIGIN}/api/v1`);
    console.log(`  Injection: POST ${ORIGIN}/api/v1/auth/login  (email field)\n`);
});
//# sourceMappingURL=index.vuln.js.map