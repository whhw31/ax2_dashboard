import 'dotenv/config';

// Skip TLS verification BEFORE any fetch calls (self-signed router certs)
if (process.env.ROUTER_SKIP_TLS_VERIFY === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Cookie-based Session Auth ──────────────────────────────────
// HTTP Basic Auth has NO logout mechanism — the browser caches
// credentials and re-sends them automatically. Cookie auth lets
// us set and clear sessions properly.

const COOKIE_NAME = 'ax2_session';
const COOKIE_SECRET = process.env.DASHBOARD_PASS
  ? crypto.createHash('sha256').update('ax2-salt-' + process.env.DASHBOARD_PASS).digest('hex')
  : crypto.randomBytes(32).toString('hex');

function signValue(value) {
  const hmac = crypto.createHmac('sha256', COOKIE_SECRET);
  hmac.update(value);
  return `${value}.${hmac.digest('hex')}`;
}

function verifySignedValue(signed) {
  if (!signed || !signed.includes('.')) return null;
  const lastDot = signed.lastIndexOf('.');
  const value = signed.substring(0, lastDot);
  const sig = signed.substring(lastDot + 1);
  const hmac = crypto.createHmac('sha256', COOKIE_SECRET);
  hmac.update(value);
  const expected = hmac.digest('hex');
  // Timing-safe comparison
  if (sig.length !== expected.length) return null;
  try {
    if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return value;
    }
  } catch { /* length mismatch */ }
  return null;
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(part => {
    const [name, ...rest] = part.trim().split('=');
    if (name) cookies[name.trim()] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

function setSessionCookie(res, username) {
  const token = signValue(username);
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

// ── Login page HTML ────────────────────────────────────────────
const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign In — ax2 Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: #0f1718;
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
      color: #dce7e5;
      overflow: hidden;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image: linear-gradient(rgba(42,58,62,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(42,58,62,.16) 1px, transparent 1px);
      background-size: 32px 32px;
      z-index: 0;
    }
    .login-card {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 390px;
      padding: 32px;
      background: #162225;
      border: 1px solid #3a4d50;
      border-top: 3px solid #7fb8ac;
      border-radius: 8px;
      box-shadow: 0 18px 50px rgba(0,0,0,.35);
    }
    .login-header {
      margin-bottom: 28px;
    }
    .login-logo {
      width: 48px; height: 38px;
      margin-bottom: 20px;
      background: #142220;
      border: 1px solid #294942;
      border-left: 3px solid #7fb8ac;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #9ed0c6;
      font-family: 'IBM Plex Sans Condensed', sans-serif;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -.04em;
    }
    .login-logo sup { margin: -8px 0 0 1px; font-size: 8px; }
    .login-header h1 {
      margin-bottom: 6px;
      color: #dce7e5;
      font-family: 'IBM Plex Sans Condensed', sans-serif;
      font-size: 26px;
      font-weight: 600;
      letter-spacing: -.02em;
    }
    .login-header p {
      color: #70827f;
      font-size: 12px;
    }
    .form-group {
      margin-bottom: 16px;
    }
    .form-group label {
      display: block;
      margin-bottom: 7px;
      color: #a3b4b1;
      font-size: 11px;
      font-weight: 500;
    }
    .form-group input {
      width: 100%;
      height: 44px;
      padding: 0 12px;
      background: #111c1e;
      border: 1px solid #2a3a3e;
      border-radius: 5px;
      color: #dce7e5;
      font-size: 13px;
      font-family: inherit;
      transition: border-color .14s, background .14s;
      outline: none;
    }
    .form-group input:focus {
      border-color: #7fb8ac;
      background: #142124;
    }
    .form-group input::placeholder { color: #70827f; }
    .login-btn {
      width: 100%;
      height: 44px;
      margin-top: 8px;
      background: #7fb8ac;
      color: #0f1718;
      border: 1px solid #7fb8ac;
      border-radius: 5px;
      font-size: 12px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: background .14s;
    }
    .login-btn:hover { background: #9ed0c6; }
    .login-btn:disabled { opacity: .5; cursor: not-allowed; }
    .error-msg {
      background: rgba(217,120,113,.08);
      border-left: 3px solid #d97871;
      color: #e39a94;
      padding: 10px 12px;
      font-size: 11px;
      margin-bottom: 16px;
    }
    .logout-msg {
      background: rgba(117,185,154,.08);
      border-left: 3px solid #75b99a;
      color: #9bceb5;
      padding: 10px 12px;
      font-size: 11px;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="login-header">
      <div class="login-logo">
        <span>AX</span><sup>2</sup>
      </div>
      <h1>Router console</h1>
      <p>Sign in to manage hotspot operations.</p>
    </div>
    <div id="msg"></div>
    <form id="login-form" method="POST" action="/api/login">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" placeholder="Enter username" autocomplete="username" required autofocus />
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="Enter password" autocomplete="current-password" required />
      </div>
      <button type="submit" class="login-btn" id="login-submit">Sign In</button>
    </form>
  </div>
  <script>
    // Show logout message if redirected from logout
    const params = new URLSearchParams(window.location.search);
    const msgEl = document.getElementById('msg');
    if (params.get('logged_out') === '1') {
      msgEl.innerHTML = '<div class="logout-msg">You have been logged out successfully.</div>';
    }
    if (params.get('error') === '1') {
      msgEl.innerHTML = '<div class="error-msg">Invalid username or password.</div>';
    }

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      const btn = document.getElementById('login-submit');
      const msgEl = document.getElementById('msg');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
    });
  </script>
</body>
</html>`;

// ── Auth middleware ─────────────────────────────────────────────
app.use((req, res, next) => {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASS;

  // Only require auth if configured in .env
  if (!user || !pass) return next();

  // Public routes — no auth required
  if (req.path === '/login' || req.path === '/api/login' || req.path === '/api/logout') {
    return next();
  }

  // Check session cookie
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  const verified = token ? verifySignedValue(decodeURIComponent(token)) : null;

  if (verified) {
    return next(); // valid session
  }

  // Not authenticated — redirect browsers, 401 for API/SSE calls
  const accept = req.headers.accept || '';
  if (accept.includes('text/html')) {
    return res.redirect('/login');
  }
  return res.status(401).json({ error: 'Authentication required' });
});

// ── Login routes ───────────────────────────────────────────────
app.get('/login', (req, res) => {
  res.type('html').send(LOGIN_PAGE);
});

app.post('/api/login', (req, res) => {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASS;

  const { username, password } = req.body || {};

  if (username === user && password === pass) {
    setSessionCookie(res, username);
    if (req.is('application/json')) return res.json({ ok: true });
    return res.redirect('/');
  }
  if (req.is('application/json')) return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
  return res.redirect('/login?error=1');
});

// ── Logout ─────────────────────────────────────────────────────
app.post('/api/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
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

// ── Router reachability: log outages once, not per request ─────
const OUTAGE_REMINDER_MS = 10 * 60 * 1000;
const routerLink = { down: false, since: 0, lastReminder: 0, suppressed: 0 };

function markRouterDown(cause) {
  const now = Date.now();
  if (!routerLink.down) {
    Object.assign(routerLink, { down: true, since: now, lastReminder: now, suppressed: 0 });
    console.error(`[MikroTik] Router unreachable at ${BASE_URL} (${cause}) — suppressing repeat errors until it recovers`);
    return;
  }
  routerLink.suppressed++;
  if (now - routerLink.lastReminder >= OUTAGE_REMINDER_MS) {
    const mins = Math.round((now - routerLink.since) / 60000);
    console.error(`[MikroTik] Router still unreachable after ${mins} min (${cause}, ${routerLink.suppressed} failed requests)`);
    routerLink.lastReminder = now;
  }
}

function markRouterUp() {
  if (!routerLink.down) return;
  const secs = Math.round((Date.now() - routerLink.since) / 1000);
  console.log(`[MikroTik] Router reachable again after ${secs}s (${routerLink.suppressed} failed requests suppressed)`);
  routerLink.down = false;
}

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
    // Root cause (ECONNREFUSED, CERT errors, DNS, etc.) is logged once per outage
    const cause = fetchErr.cause || fetchErr;
    markRouterDown(cause.code || cause.message);
    fetchErr.isNetworkError = true;
    throw fetchErr;
  }
  markRouterUp();

  const text = await res.text();

  if (!res.ok) {
    // Surface RouterOS's own reason (e.g. "already have user with this name")
    // instead of a bare status code.
    let reason = '';
    try { const j = JSON.parse(text); reason = j.detail || j.message || ''; } catch { reason = text.slice(0, 200); }
    reason = reason.replace(/^failure:\s*/i, '');
    const err = new Error(reason ? `MikroTik: ${reason}` : `MikroTik API error: ${res.status}`);
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
        mikrotik('GET', '/ip/hotspot/active').catch(() => []),
        mikrotik('GET', '/ip/hotspot/host').catch(() => []),
        mikrotik('GET', '/queue/simple').catch(() => []),
        mikrotik('GET', '/ip/hotspot/user').catch(() => []),
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
      if (!err.isNetworkError) console.error('[SSE poll error]', err.message);
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

// Hotspot — Restart enabled servers to clear stalled connections
app.post('/api/hotspot/restart', async (req, res, next) => {
  const disabledServers = [];
  const reenabledIds = new Set();

  try {
    const servers = await mikrotik('GET', '/ip/hotspot');
    const enabledServers = (Array.isArray(servers) ? servers : []).filter(server =>
      server['.id'] && server.disabled !== 'true' && server.invalid !== 'true'
    );

    if (enabledServers.length === 0) {
      return res.status(409).json({ error: 'No enabled hotspot server found' });
    }

    for (const server of enabledServers) {
      await mikrotik('POST', '/ip/hotspot/disable', { '.id': server['.id'] });
      disabledServers.push(server);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    for (const server of disabledServers) {
      await mikrotik('POST', '/ip/hotspot/enable', { '.id': server['.id'] });
      reenabledIds.add(server['.id']);
    }

    res.json({
      success: true,
      restarted: disabledServers.length,
      servers: disabledServers.map(server => server.name || server['.id']),
    });
  } catch (e) {
    // Best effort: never leave a server disabled because a later step failed.
    for (const server of disabledServers) {
      if (reenabledIds.has(server['.id'])) continue;
      try {
        await mikrotik('POST', '/ip/hotspot/enable', { '.id': server['.id'] });
      } catch (recoveryError) {
        console.error(`[Hotspot restart recovery] Failed to re-enable ${server.name || server['.id']}:`, recoveryError.message);
      }
    }
    next(e);
  }
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
    const mac = req.body['mac-address'];
    const limit = req.body['limit-bytes-total'];
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Username is required.' });
    // Password is optional: MAC-login users authenticate by MAC and have none.
    const body = { name: String(name).trim() };
    if (password) body.password = password;
    if (mac) body['mac-address'] = mac;
    if (limit) body['limit-bytes-total'] = String(limit);
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
  if (!err.isNetworkError) console.error('[API Error]', err.message, err.detail || '');
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
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n  🚀 ax2 Dashboard API running on http://localhost:${PORT}`);
  console.log(`  📡 Router: ${BASE_URL}`);
  console.log(`  👤 User: ${ROUTER.user}\n`);
});
