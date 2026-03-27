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
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0e1a;
      font-family: 'Inter', system-ui, sans-serif;
      color: #e2e8f0;
      overflow: hidden;
    }
    body::before {
      content: '';
      position: fixed;
      top: -50%; left: -50%;
      width: 200%; height: 200%;
      background: radial-gradient(ellipse at 30% 20%, rgba(99,102,241,.12) 0%, transparent 50%),
                  radial-gradient(ellipse at 70% 80%, rgba(139,92,246,.08) 0%, transparent 50%);
      animation: drift 20s ease-in-out infinite;
      z-index: 0;
    }
    @keyframes drift {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(-3%, 2%); }
    }
    .login-card {
      position: relative;
      z-index: 1;
      width: 90%;
      max-width: 400px;
      padding: 2.5rem 2rem;
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(148, 163, 184, .12);
      border-radius: 1.5rem;
      box-shadow: 0 25px 60px rgba(0, 0, 0, .6);
    }
    .login-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    .login-logo {
      width: 52px; height: 52px;
      margin: 0 auto 1rem;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(99,102,241,.3);
    }
    .login-logo svg { color: #fff; }
    .login-header h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #f1f5f9;
      margin-bottom: .35rem;
    }
    .login-header p {
      font-size: .875rem;
      color: #64748b;
    }
    .form-group {
      margin-bottom: 1.25rem;
    }
    .form-group label {
      display: block;
      font-size: .8rem;
      font-weight: 600;
      color: #94a3b8;
      margin-bottom: .4rem;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .form-group input {
      width: 100%;
      padding: .75rem 1rem;
      background: rgba(30, 41, 59, .7);
      border: 1px solid rgba(148, 163, 184, .15);
      border-radius: .75rem;
      color: #f1f5f9;
      font-size: .95rem;
      font-family: inherit;
      transition: border-color .2s, box-shadow .2s;
      outline: none;
    }
    .form-group input:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, .15);
    }
    .form-group input::placeholder { color: #475569; }
    .login-btn {
      width: 100%;
      padding: .85rem;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff;
      border: none;
      border-radius: .75rem;
      font-size: 1rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: opacity .2s, transform .1s;
      margin-top: .5rem;
    }
    .login-btn:hover { opacity: .9; }
    .login-btn:active { transform: scale(.98); }
    .login-btn:disabled { opacity: .5; cursor: not-allowed; }
    .error-msg {
      background: rgba(239, 68, 68, .12);
      border: 1px solid rgba(239, 68, 68, .25);
      color: #fca5a5;
      padding: .65rem 1rem;
      border-radius: .6rem;
      font-size: .85rem;
      margin-bottom: 1.25rem;
      text-align: center;
      animation: shake .4s ease;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-6px); }
      75% { transform: translateX(6px); }
    }
    .logout-msg {
      background: rgba(34, 197, 94, .1);
      border: 1px solid rgba(34, 197, 94, .2);
      color: #86efac;
      padding: .65rem 1rem;
      border-radius: .6rem;
      font-size: .85rem;
      margin-bottom: 1.25rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="login-header">
      <div class="login-logo">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/>
        </svg>
      </div>
      <h1>ax2 Dashboard</h1>
      <p>Sign in to continue</p>
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

    // Handle form via fetch for smoother UX
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('login-submit');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: document.getElementById('username').value,
            password: document.getElementById('password').value,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          window.location.href = '/';
        } else {
          msgEl.innerHTML = '<div class="error-msg">' + (data.error || 'Invalid credentials.') + '</div>';
          btn.disabled = false;
          btn.textContent = 'Sign In';
        }
      } catch {
        msgEl.innerHTML = '<div class="error-msg">Connection error. Please try again.</div>';
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
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
    return res.json({ ok: true });
  }

  return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
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
