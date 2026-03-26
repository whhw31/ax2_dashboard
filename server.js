import 'dotenv/config';

// Skip TLS verification BEFORE any fetch calls (self-signed router certs)
if (process.env.ROUTER_SKIP_TLS_VERIFY === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import express from 'express';
import cors from 'cors';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// ── Basic Authentication ───────────────────────────────────────
app.use((req, res, next) => {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASS;

  // Only require auth if configured in .env
  if (!user || !pass) return next();

  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  if (login && password && login === user && password === pass) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="MikroTik Dashboard"');
  res.status(401).send('Authentication required.');
});

// ── Router Config ──────────────────────────────────────────────
const ROUTER = {
  ip: process.env.ROUTER_IP || '10.10.10.1',
  user: process.env.ROUTER_USER || 'admin',
  pass: process.env.ROUTER_PASS || 'changeme',
  protocol: process.env.ROUTER_PROTOCOL || 'https',
};

const BASE_URL = `${ROUTER.protocol}://${ROUTER.ip}/rest`;
const AUTH_HEADER = 'Basic ' + Buffer.from(`${ROUTER.user}:${ROUTER.pass}`).toString('base64');

// ── Helper: call MikroTik REST API ─────────────────────────────
async function mikrotik(method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: {
      'Authorization': AUTH_HEADER,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(url, opts);
  } catch (fetchErr) {
    // Log the root cause (ECONNREFUSED, CERT errors, DNS, etc.)
    const cause = fetchErr.cause || fetchErr;
    console.error(`[MikroTik] ${method} ${url} → Network error:`, cause.code || cause.message);
    throw fetchErr;
  }

  const text = await res.text();

  if (!res.ok) {
    const err = new Error(`MikroTik API error: ${res.status}`);
    err.status = res.status;
    err.detail = text;
    throw err;
  }

  return text ? JSON.parse(text) : {};
}

// ── SSE: real-time stream (2s poll) ────────────────────────────
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('\n');

  let alive = true;

  const poll = async () => {
    if (!alive) return;
    try {
      const [resource, health, interfaces, active, hosts, queues, users] = await Promise.all([
        mikrotik('GET', '/system/resource'),
        mikrotik('GET', '/system/health').catch(() => []),
        mikrotik('GET', '/interface'),
        mikrotik('GET', '/ip/hotspot/active'),
        mikrotik('GET', '/ip/hotspot/host'),
        mikrotik('GET', '/queue/simple').catch(() => []),
        mikrotik('GET', '/ip/hotspot/user'),
      ]);

      const payload = {
        timestamp: Date.now(),
        resource,
        health,
        interfaces,
        active,
        hosts,
        queues,
        users,
      };

      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (err) {
      console.error('[SSE poll error]', err.message);
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    }

    if (alive) setTimeout(poll, 2000);
  };

  poll();

  req.on('close', () => {
    alive = false;
  });
});

// ── REST Endpoints ─────────────────────────────────────────────

// System
app.get('/api/system/resource', async (req, res, next) => {
  try { res.json(await mikrotik('GET', '/system/resource')); }
  catch (e) { next(e); }
});

app.get('/api/system/health', async (req, res, next) => {
  try { res.json(await mikrotik('GET', '/system/health')); }
  catch (e) { next(e); }
});

// Interfaces
app.get('/api/interfaces', async (req, res, next) => {
  try { res.json(await mikrotik('GET', '/interface')); }
  catch (e) { next(e); }
});

// Hotspot — Active sessions
app.get('/api/hotspot/active', async (req, res, next) => {
  try { res.json(await mikrotik('GET', '/ip/hotspot/active')); }
  catch (e) { next(e); }
});

// Hotspot — Disconnect active session
app.post('/api/hotspot/disconnect', async (req, res, next) => {
  try {
    const { id } = req.body;
    await mikrotik('POST', '/ip/hotspot/active/remove', { '.id': id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Hotspot — Users
app.get('/api/hotspot/users', async (req, res, next) => {
  try { res.json(await mikrotik('GET', '/ip/hotspot/user')); }
  catch (e) { next(e); }
});

// Hotspot — Add user
app.post('/api/hotspot/users', async (req, res, next) => {
  try {
    const { name, password, profile, comment } = req.body;
    const body = { name, password };
    if (profile) body.profile = profile;
    if (comment) body.comment = comment;
    res.json(await mikrotik('PUT', '/ip/hotspot/user', body));
  } catch (e) { next(e); }
});

// Hotspot — Update user (change profile, rate-limit, etc.)
app.patch('/api/hotspot/users/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const updates = req.body;
    res.json(await mikrotik('PATCH', `/ip/hotspot/user/${id}`, updates));
  } catch (e) { next(e); }
});

// Hotspot — Delete user
app.delete('/api/hotspot/users/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    res.json(await mikrotik('DELETE', `/ip/hotspot/user/${id}`));
  } catch (e) { next(e); }
});

// Hotspot — Reset counters for specific user
app.post('/api/hotspot/users/reset-counters', async (req, res, next) => {
  try {
    const { id } = req.body;
    await mikrotik('POST', '/ip/hotspot/user/reset-counters', { '.id': id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Hotspot — Reset ALL counters
app.post('/api/hotspot/users/reset-all-counters', async (req, res, next) => {
  try {
    // MikroTik API doesn't always support 'all' via .id in REST, 
    // but calling without body or with empty selection usually works if target is command.
    // However, safest way is to fetch IDs and reset each, or just call command on path.
    await mikrotik('POST', '/ip/hotspot/user/reset-counters', {});
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Hotspot — User profiles
app.get('/api/hotspot/profiles', async (req, res, next) => {
  try { res.json(await mikrotik('GET', '/ip/hotspot/user/profile')); }
  catch (e) { next(e); }
});

// Hotspot — Hosts
app.get('/api/hotspot/hosts', async (req, res, next) => {
  try { res.json(await mikrotik('GET', '/ip/hotspot/host')); }
  catch (e) { next(e); }
});

// Queues
app.get('/api/queues', async (req, res, next) => {
  try { res.json(await mikrotik('GET', '/queue/simple')); }
  catch (e) { next(e); }
});

// ── Error handler ──────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[API Error]', err.message, err.detail || '');
  res.status(err.status || 500).json({
    error: err.message,
    detail: err.detail,
  });
});

// ── Serve frontend in production ───────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  });
}

// ── Start ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  🚀 ax2 Dashboard API running on http://localhost:${PORT}`);
  console.log(`  📡 Router: ${BASE_URL}`);
  console.log(`  👤 User: ${ROUTER.user}\n`);
});
