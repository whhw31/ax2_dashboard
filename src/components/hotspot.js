// ── Hotspot Component — Active Sessions, Users, Hosts ───────────
import {
  formatBytes, formatUptime, formatBps, stringToColor, getInitials,
  escapeHtml, showToast, formatRateLimit
} from '../utils.js';
import { api } from '../api.js';
import { showProfileModal, showConfirmModal, showAddUserModal, showEditUserModal } from './actions.js';

// ── State ──────────────────────────────────────────────────────
let currentSort = 'rate'; // rate | download | upload | total | time | name
let currentUsersSort = 'name'; // name | total | download | upload
let searchQuery = '';
let usersSearchQuery = '';
let cachedProfiles = [];
let cachedUsers = [];
let previousActiveData = new Map(); // Store {bytesIn, bytesOut, timestamp} per session id

// Load profiles and users once
api.getProfiles().then(p => { cachedProfiles = p; }).catch(() => {});
// api.getUsers() will now be updated by SSE, but we do a first load
api.getUsers().then(u => { cachedUsers = u; }).catch(() => {});

// ════════════════════════════════════════════════════════════════
// ACTIVE SESSIONS
// ════════════════════════════════════════════════════════════════
export function renderActive(container) {
  container.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Active Sessions<span class="section-count" id="active-count">0</span></h2>
    </div>
    <div class="search-bar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" placeholder="Search by name, comment, IP…" id="active-search" value="${escapeHtml(searchQuery)}" />
    </div>
    <div class="section-sort" style="margin-bottom:var(--space-md)">
      <button class="sort-btn ${currentSort === 'rate' ? 'active' : ''}" data-sort="rate">⚡ Rate</button>
      <button class="sort-btn ${currentSort === 'total' ? 'active' : ''}" data-sort="total">Σ Total Usage</button>
      <button class="sort-btn ${currentSort === 'download' ? 'active' : ''}" data-sort="download">▼ Total DN</button>
      <button class="sort-btn ${currentSort === 'upload' ? 'active' : ''}" data-sort="upload">▲ Total UP</button>
      <button class="sort-btn ${currentSort === 'time' ? 'active' : ''}" data-sort="time">🕐 Time</button>
      <button class="sort-btn ${currentSort === 'name' ? 'active' : ''}" data-sort="name">Aα Name</button>
    </div>
    <div id="active-list">
      <div class="skeleton" style="height:200px"></div>
    </div>
  `;

  // Sort buttons
  container.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSort = btn.dataset.sort;
      container.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Re-render with last data
      if (window.__lastStreamData) updateActive(window.__lastStreamData);
    });
  });

  // Search
  const searchInput = container.querySelector('#active-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      if (window.__lastStreamData) updateActive(window.__lastStreamData);
    });
  }
}

export function updateActive(data) {
  if (!data?.active) return;
  let sessions = [...data.active];

  // Search filter
  if (searchQuery) {
    sessions = sessions.filter(s => {
      const uName = s.user || '';
      const comment = (s.comment || cachedUsers.find(u => u.name === uName)?.comment || '').toLowerCase();
      return uName.toLowerCase().includes(searchQuery) ||
        (s.address || '').includes(searchQuery) ||
        (s['mac-address'] || '').toLowerCase().includes(searchQuery) ||
        comment.includes(searchQuery);
    });
  }

  const now = data.timestamp || Date.now();

  // Compute rates
  sessions.forEach(s => {
    const id = s['.id'];
    const prev = previousActiveData.get(id);
    const currIn = parseInt(s['bytes-in'] || 0);
    const currOut = parseInt(s['bytes-out'] || 0);

    if (prev && prev.timestamp < now) {
      const dt = Math.max(0.1, (now - prev.timestamp) / 1000); // minimum 100ms
      // bits per second
      s._rateIn = Math.max(0, (currIn - prev.bytesIn) * 8 / dt);
      s._rateOut = Math.max(0, (currOut - prev.bytesOut) * 8 / dt);
    } else {
      s._rateIn = 0;
      s._rateOut = 0;
    }

    // Update history
    previousActiveData.set(id, { bytesIn: currIn, bytesOut: currOut, timestamp: now });
  });

  // Cleanup map (memory leak protection)
  if (previousActiveData.size > 200) {
      const currentIds = new Set(data.active.map(s => s['.id']));
      for (const id of previousActiveData.keys()) {
          if (!currentIds.has(id)) previousActiveData.delete(id);
      }
  }

  // Final validation to avoid NaN in sort
  sessions.forEach(s => {
      if (typeof s._rateIn !== 'number' || isNaN(s._rateIn)) s._rateIn = 0;
      if (typeof s._rateOut !== 'number' || isNaN(s._rateOut)) s._rateOut = 0;
  });

  // Sort
  sessions.sort((a, b) => {
    switch (currentSort) {
      case 'rate': return (b._rateOut + b._rateIn) - (a._rateOut + a._rateIn);
      case 'total': {
        const aTotal = parseInt(a['bytes-out'] || 0) + parseInt(a['bytes-in'] || 0);
        const bTotal = parseInt(b['bytes-out'] || 0) + parseInt(b['bytes-in'] || 0);
        return bTotal - aTotal;
      }
      case 'download': return (parseInt(b['bytes-out'] || 0)) - (parseInt(a['bytes-out'] || 0));
      case 'upload': return (parseInt(b['bytes-in'] || 0)) - (parseInt(a['bytes-in'] || 0));
      case 'time': {
        const aUp = parseUptime(a.uptime);
        const bUp = parseUptime(b.uptime);
        return bUp - aUp;
      }
      case 'name': return (a.user || '').localeCompare(b.user || '');
      default: return 0;
    }
  });

  // Count
  const countEl = document.getElementById('active-count');
  if (countEl) countEl.textContent = data.active.length;

  // Render
  const listEl = document.getElementById('active-list');
  if (!listEl) return;

  if (sessions.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        <p>${searchQuery ? 'No matching sessions' : 'No active sessions'}</p>
      </div>`;
    return;
  }

  listEl.innerHTML = sessions.map(session => {
    const user = session.user || 'unknown';
    const color = stringToColor(user);
    const initial = getInitials(user);
    // From the Router's perspective: TX (out) is Client Download, RX (in) is Client Upload
    const downloaded = parseInt(session['bytes-out'] || 0);
    const uploaded = parseInt(session['bytes-in'] || 0);
    const id = session['.id'];
    const comment = session.comment || cachedUsers.find(u => u.name === user)?.comment || '';

    // ── Resolve assigned speed ──────────────────────────────
    const userRecord = cachedUsers.find(u => u.name === user);
    const profileName = userRecord?.profile || 'default';
    const profileRecord = cachedProfiles.find(p => p.name === profileName);
    // User-level rate-limit overrides profile-level
    const rawRateLimit = userRecord?.['rate-limit'] || profileRecord?.['rate-limit'] || '';
    const speedInfo = formatRateLimit(rawRateLimit);

    // Build the speed badge HTML
    let speedBadgeHtml = '';
    if (speedInfo && typeof speedInfo === 'object') {
      speedBadgeHtml = `
        <div class="speed-badge">
          <span class="speed-badge-label">⚡ ${escapeHtml(profileName)}</span>
          <span class="speed-badge-values">
            <span class="speed-down">▼ ${speedInfo.download}</span>
            <span class="speed-sep">·</span>
            <span class="speed-up">▲ ${speedInfo.upload}</span>
          </span>
        </div>`;
    } else {
      speedBadgeHtml = `
        <div class="speed-badge speed-badge--unlimited">
          <span class="speed-badge-label">⚡ ${escapeHtml(profileName)}</span>
          <span class="speed-badge-values">Unlimited</span>
        </div>`;
    }

    return `
      <div class="glass-card session-card" data-id="${escapeHtml(id)}">
        <div class="session-header">
          <div class="session-user">
            <div class="session-avatar" style="background:${color}">${initial}</div>
            <div>
              <div class="session-name">${escapeHtml(user)}</div>
              ${comment ? `<div style="font-size:12px;color:var(--accent-blue);font-weight:600;margin-bottom:2px">${escapeHtml(comment)}</div>` : ''}
              <div class="session-ip">${escapeHtml(session.address || '—')} · ${escapeHtml(session['mac-address'] || '—')}</div>
            </div>
          </div>
        </div>
        ${speedBadgeHtml}
        <div class="session-stats">
          <div class="session-stat">
            <span class="stat-label">Download Rate</span>
            <span class="stat-value download">▼ ${formatBps(session._rateOut)}</span>
          </div>
          <div class="session-stat">
            <span class="stat-label">Upload Rate</span>
            <span class="stat-value upload">▲ ${formatBps(session._rateIn)}</span>
          </div>
          <div class="session-stat">
            <span class="stat-label">Total Usage</span>
            <span class="stat-value" style="font-weight:600; font-size:12px">${formatBytes(downloaded + uploaded)}</span>
          </div>
          <div class="session-stat">
            <span class="stat-label">Downloaded</span>
            <span class="stat-value" style="opacity:0.8; font-size:12px">${formatBytes(downloaded)}</span>
          </div>
          <div class="session-stat">
            <span class="stat-label">Uploaded</span>
            <span class="stat-value" style="opacity:0.8; font-size:12px">${formatBytes(uploaded)}</span>
          </div>
          <div class="session-stat">
            <span class="stat-label">Uptime</span>
            <span class="stat-value time">${formatUptime(session.uptime)}</span>
          </div>
          <div class="session-stat">
            <span class="stat-label">Idle</span>
            <span class="stat-value">${formatUptime(session['idle-time']) || '—'}</span>
          </div>
        </div>
        <div class="session-actions">
          <button class="btn btn-speed btn-sm" onclick="window.__speedAction('${escapeHtml(user)}', '${escapeHtml(id)}')">⚡ Limit</button>
          <button class="btn btn-cut btn-sm" onclick="window.__cutAction('${escapeHtml(user)}', '${escapeHtml(id)}')">✂ Cut</button>
        </div>
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════════════

export function renderUsers(container) {
  container.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Hotspot Users<span class="section-count" id="users-count">—</span></h2>
      <button class="btn btn-secondary btn-sm" id="reset-all-btn" onclick="window.__resetAllCounters()">🔄 Reset All</button>
    </div>
    <div class="info-banner" style="margin-bottom:var(--space-md); font-size:11px; opacity:0.8; display:flex; align-items:center; gap:8px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span>Stats represent lifetime usage. Active sessions may briefly show higher numbers until reconnected.</span>
    </div>
    <div class="search-bar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" placeholder="Search users by name, comment, or profile…" id="users-search" value="${escapeHtml(usersSearchQuery)}" />
    </div>
    <div class="section-sort" style="margin-bottom:var(--space-md)">
      <button class="sort-btn ${currentUsersSort === 'rate' ? 'active' : ''}" data-sort="rate">⚡ Rate</button>
      <button class="sort-btn ${currentUsersSort === 'total' ? 'active' : ''}" data-sort="total">Σ Total Usage</button>
      <button class="sort-btn ${currentUsersSort === 'download' ? 'active' : ''}" data-sort="download">▼ Total DN</button>
      <button class="sort-btn ${currentUsersSort === 'upload' ? 'active' : ''}" data-sort="upload">▲ Total UP</button>
      <button class="sort-btn ${currentUsersSort === 'time' ? 'active' : ''}" data-sort="time">🕐 Time</button>
      <button class="sort-btn ${currentUsersSort === 'name' ? 'active' : ''}" data-sort="name">Aα Name</button>
    </div>
    <div id="users-list">
      <div class="skeleton" style="height:200px"></div>
    </div>
  `;

  // Sort buttons
  container.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentUsersSort = btn.dataset.sort;
      container.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderUsersList();
    });
  });

  // Search
  const searchInput = container.querySelector('#users-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      usersSearchQuery = e.target.value.toLowerCase();
      renderUsersList();
    });
  }

  // Fetch users
  loadUsers();
}

async function loadUsers() {
  try {
    const users = await api.getUsers();
    updateUsers({ users });
  } catch (err) {
    showToast('Failed to load users: ' + err.message, 'error');
  }
}

export function updateUsers(data) {
  try {
    if (!data?.users) return;
    cachedUsers = data.users;
    
    const countEl = document.getElementById('users-count');
    if (countEl) countEl.textContent = cachedUsers.length;
    
    // CRITICAL: Only re-render the list if the users tab exists in DOM
    // to prevent background computation lag when users are not looking.
    const listEl = document.getElementById('users-list');
    if (listEl) {
        renderUsersList();
    }
  } catch (err) {
    console.warn('[updateUsers Error]', err);
  }
}

function renderUsersList() {
  const listEl = document.getElementById('users-list');
  if (!listEl) return;

  let users = [...cachedUsers];
  if (usersSearchQuery) {
    users = users.filter(u =>
      (u.name || '').toLowerCase().includes(usersSearchQuery) ||
      (u.profile || '').toLowerCase().includes(usersSearchQuery) ||
      (u.comment || '').toLowerCase().includes(usersSearchQuery)
    );
  }

  // Sort
  users.sort((a, b) => {
    switch (currentUsersSort) {
      case 'rate': {
        // Users don't have a live rate, but we can try to find their active session if we want, or just fallback to 0.
        // If they are active, use window.__lastStreamData.active.
        let aRate = 0, bRate = 0;
        if (window.__lastStreamData && window.__lastStreamData.active) {
            const aAct = window.__lastStreamData.active.find(s => s.user === a.name);
            const bAct = window.__lastStreamData.active.find(s => s.user === b.name);
            if (aAct) aRate = (aAct._rateIn || 0) + (aAct._rateOut || 0);
            if (bAct) bRate = (bAct._rateIn || 0) + (bAct._rateOut || 0);
        }
        return bRate - aRate;
      }
      case 'name': return (a.name || '').localeCompare(b.name || '');
      case 'total': {
        const aTotal = parseInt(a['bytes-out'] || 0) + parseInt(a['bytes-in'] || 0);
        const bTotal = parseInt(b['bytes-out'] || 0) + parseInt(b['bytes-in'] || 0);
        return bTotal - aTotal;
      }
      case 'download': return parseInt(b['bytes-out'] || 0) - parseInt(a['bytes-out'] || 0);
      case 'upload': return parseInt(b['bytes-in'] || 0) - parseInt(a['bytes-in'] || 0);
      case 'time': {
        const aUp = parseUptime(a.uptime);
        const bUp = parseUptime(b.uptime);
        return bUp - aUp;
      }
      default: return 0;
    }
  });

  if (users.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        <p>${usersSearchQuery ? 'No matching users' : 'No users configured'}</p>
      </div>`;
    return;
  }

  listEl.innerHTML = users.map(user => {
    const id = user['.id'];
    const name = user.name || '—';
    const hasLimit = user['rate-limit'] && user['rate-limit'] !== '';

    return `
      <div class="glass-card user-card">
        <div class="user-meta">
          <div class="session-avatar" style="background:${stringToColor(name)}">${getInitials(name)}</div>
          <div>
            <div class="user-name">${escapeHtml(name)}</div>
            ${user.comment ? `<div style="font-size:12px;color:var(--accent-blue);font-weight:600;margin-bottom:4px">${escapeHtml(user.comment)}</div>` : ''}
            ${user.profile ? `<span class="user-profile-badge">${escapeHtml(user.profile)}</span>` : ''}
          </div>
        </div>
        <div class="user-details">
          <span class="user-detail-label">MAC Address</span>
          <span class="user-detail-value">${escapeHtml(user['mac-address'] || '—')}</span>
          <span class="user-detail-label">Data Limit</span>
          <span class="user-detail-value">${user['limit-bytes-total'] ? formatBytes(parseInt(user['limit-bytes-total'])) : 'Unlimited'}</span>
          <span class="user-detail-label">Total Usage</span>
          <span class="user-detail-value" style="font-weight:600;">${formatBytes(parseInt(user['bytes-out'] || 0) + parseInt(user['bytes-in'] || 0))}</span>
          <span class="user-detail-label">Downloaded</span>
          <span class="user-detail-value">${formatBytes(parseInt(user['bytes-out'] || 0))}</span>
          <span class="user-detail-label">Uploaded</span>
          <span class="user-detail-value">${formatBytes(parseInt(user['bytes-in'] || 0))}</span>
        </div>
        <div class="user-actions">
          <button class="btn btn-speed btn-sm" onclick="window.__editUser('${escapeHtml(id)}')">✏️ Edit</button>
          <button class="btn btn-sm btn-success" onclick="window.__speedUserAction('${escapeHtml(name)}', '${escapeHtml(id)}')">⚡ Speed</button>
          <button class="btn btn-secondary btn-sm" onclick="window.__resetCounters('${escapeHtml(name)}', '${escapeHtml(id)}')">🔄 Reset</button>
          <button class="btn btn-danger btn-sm" onclick="window.__deleteUser('${escapeHtml(name)}', '${escapeHtml(id)}')">🗑 Delete</button>
        </div>
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════════
// HOSTS
// ════════════════════════════════════════════════════════════════
export function renderHosts(container) {
  container.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Hotspot Hosts<span class="section-count" id="hosts-count">—</span></h2>
    </div>
    <div id="hosts-list">
      <div class="skeleton" style="height:200px"></div>
    </div>
  `;
  loadHosts();
}

async function loadHosts() {
  try {
    const hosts = await api.getHosts();
    const countEl = document.getElementById('hosts-count');
    if (countEl) countEl.textContent = hosts.length;

    const listEl = document.getElementById('hosts-list');
    if (!listEl) return;

    if (hosts.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
          <p>No hosts detected</p>
        </div>`;
      return;
    }

    listEl.innerHTML = hosts.map(host => {
      const authorized = host.authorized === 'true' || host.authorized === true;
      const hostname = host['host-name'] || host.comment || '—';

      return `
        <div class="glass-card host-card">
          <div class="host-info" style="margin-bottom:var(--space-sm)">
            <span class="host-status-badge ${authorized ? 'authorized' : 'unauthorized'}">
              ${authorized ? '✓ Authorized' : '○ Not Authorized'}
            </span>
          </div>
          <div class="user-details">
            <span class="user-detail-label">Hostname</span>
            <span class="user-detail-value">${escapeHtml(hostname)}</span>
            <span class="user-detail-label">MAC</span>
            <span class="user-detail-value">${escapeHtml(host['mac-address'] || '—')}</span>
            <span class="user-detail-label">IP</span>
            <span class="user-detail-value">${escapeHtml(host.address || '—')}</span>
            <span class="user-detail-label">Downloaded</span>
            <span class="user-detail-value">${formatBytes(parseInt(host['bytes-out'] || 0))}</span>
            <span class="user-detail-label">Uploaded</span>
            <span class="user-detail-value">${formatBytes(parseInt(host['bytes-in'] || 0))}</span>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    showToast('Failed to load hosts: ' + err.message, 'error');
  }
}

export function updateHosts(data) {
  // Hosts are updated less frequently; the list is loaded on tab switch
}

// ════════════════════════════════════════════════════════════════
// GLOBAL ACTION HANDLERS (called from inline onclick)
// ════════════════════════════════════════════════════════════════

// Speed limit an active session user
window.__speedAction = async (username, activeId) => {
  try {
    const users = await api.getUsers();
    const user = users.find(u => u.name === username);
    if (!user) {
      showToast(`User "${username}" not found in user list`, 'error');
      return;
    }
    
    showProfileModal(username, user.profile, cachedProfiles, async (newProfile) => {
      try {
        const payload = { 
          profile: newProfile,
          name: user.name
        };
        if (user['mac-address']) payload['mac-address'] = user['mac-address'];
        
        await api.updateUser(user['.id'], payload);
        // Force the router to apply the profile immediately by terminating their active session
        // They will silently re-authenticate in the background using MAC cookies/saved creds and pull the new limits.
        await api.disconnect(activeId);
        showToast(`Profile "${newProfile}" applied! Session restarted.`, 'success');
      } catch (err) {
        showToast('Failed to set profile: ' + err.message, 'error');
      }
    });
  } catch (err) {
    showToast('Failed to fetch user data: ' + err.message, 'error');
  }
};

// Cut / disconnect an active session
window.__cutAction = (username, activeId) => {
  showConfirmModal(
    `Disconnect ${username}?`,
    'This will forcibly disconnect the user from the hotspot. They will need to re-authenticate.',
    async () => {
      try {
        await api.disconnect(activeId);
        showToast(`${username} disconnected`, 'success');
      } catch (err) {
        showToast('Failed to disconnect: ' + err.message, 'error');
      }
    }
  );
};

// Speed limit from users tab
window.__speedUserAction = async (username, userId) => {
  try {
    const user = cachedUsers.find(u => u['.id'] === userId);
    showProfileModal(username, user?.profile, cachedProfiles, async (newProfile) => {
      try {
        const payload = { 
          profile: newProfile,
          name: user.name
        };
        if (user['mac-address']) payload['mac-address'] = user['mac-address'];
        
        await api.updateUser(userId, payload);
        showToast(`Profile saved for ${username}`, 'success');
        
        // Disconnect if active so new profile applies instantly
        if (window.__lastStreamData && window.__lastStreamData.active) {
            const activeSession = window.__lastStreamData.active.find(a => a.user === username);
            if (activeSession) {
                await api.disconnect(activeSession['.id']);
                showToast(`Restarted active session for ${username}`, 'success');
            }
        }
        
        loadUsers(); // refresh list
      } catch (err) {
        showToast('Failed to set profile: ' + err.message, 'error');
      }
    });
  } catch (err) {
    showToast('Error looking up user: ' + err.message, 'error');
  }
};

// Edit user
window.__editUser = async (userId) => {
  try {
    const user = cachedUsers.find(u => u['.id'] === userId);
    if (!user) { showToast('User not found', 'error'); return; }
    showEditUserModal(user, cachedProfiles, async (updates) => {
      try {
        await api.updateUser(userId, updates);
        showToast('User updated', 'success');
        
        // Disconnect if active to immediately apply the MAC, Limit, or Profile changes
        if (window.__lastStreamData && window.__lastStreamData.active) {
            const activeSession = window.__lastStreamData.active.find(a => a.user === user.name);
            if (activeSession) {
                await api.disconnect(activeSession['.id']);
                showToast(`Session restarted to apply configurations.`, 'success');
            }
        }
        
        loadUsers();
      } catch (err) {
        showToast('Failed to update: ' + err.message, 'error');
      }
    });
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// Delete user
window.__deleteUser = (username, userId) => {
  showConfirmModal(
    `Delete User "${username}"?`,
    'This will permanently remove the user. They will not be able to log in again unless re-added.',
    async () => {
      try {
        await api.deleteUser(userId);
        showToast(`${username} deleted`, 'success');
        loadUsers();
      } catch (err) {
        showToast('Failed to delete: ' + err.message, 'error');
      }
    }
  );
};

// Reset counters for a specific user
window.__resetCounters = (username, userId) => {
  showConfirmModal(
    `Reset counters for ${username}?`,
    'This will zero out their downloaded/uploaded bytes. For active users, you should also disconnect them to restart their current session stats.',
    async () => {
      try {
        await api.resetCounters(userId);
        showToast(`Counters reset for ${username}`, 'success');
        
        // Also offer to disconnect if active
        if (window.__lastStreamData && window.__lastStreamData.active) {
          const activeSession = window.__lastStreamData.active.find(a => a.user === username);
          if (activeSession) {
             await api.disconnect(activeSession['.id']);
             showToast(`Active session restarted for ${username}`, 'info');
          }
        }
        loadUsers();
      } catch (err) {
        showToast('Failed to reset: ' + err.message, 'error');
      }
    }
  );
};

// Reset ALL counters
window.__resetAllCounters = () => {
  showConfirmModal(
    'Reset ALL User Counters?',
    'This will set downloaded/uploaded bytes to zero for ALL users. Warning: This cannot be undone.',
    async () => {
      try {
        await api.resetAllCounters();
        showToast('All counters reset', 'success');
        
        // Optional: Disconnect all active for full refresh? 
        // Might be too aggressive. Just refresh list.
        loadUsers();
      } catch (err) {
        showToast('Failed to reset all: ' + err.message, 'error');
      }
    }
  );
};

// Add user (called from FAB button)
window.__addUser = () => {
  showAddUserModal(cachedProfiles, async (userData) => {
    try {
      await api.addUser(userData);
      showToast(`User "${userData.name}" added`, 'success');
      loadUsers();
    } catch (err) {
      showToast('Failed to add user: ' + err.message, 'error');
    }
  });
};

// Helper
function parseUptime(uptime) {
  if (!uptime) return 0;
  const m = uptime.match(/(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (!m) return 0;
  const [, w=0, d=0, h=0, mi=0, s=0] = m;
  return (+w*604800)+(+d*86400)+(+h*3600)+(+mi*60)+(+s);
}
