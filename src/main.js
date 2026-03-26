// ── Main Entry Point ────────────────────────────────────────────
import { renderHealth, updateHealth } from './components/health.js';
import { renderActive, updateActive, renderUsers, renderHosts } from './components/hotspot.js';
import { formatBytes, formatUptime, memoryPercent, formatBps } from './utils.js';

// ── State ──────────────────────────────────────────────────────
let currentTab = 'health';
let eventSource = null;

// ── DOM references ─────────────────────────────────────────────
const mainContent = document.getElementById('main-content');
const tabButtons = document.querySelectorAll('.tab-btn');
const statusDot = document.querySelector('.status-dot');
const statusLabel = document.querySelector('.status-label');
const fab = createFab();

// ── Tab Navigation ─────────────────────────────────────────────
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === currentTab) return;
    switchTab(tab);
  });
});

function switchTab(tab) {
  currentTab = tab;

  // Update active tab button
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  // Show/hide FAB (only on users tab)
  fab.classList.toggle('visible', tab === 'users');

  // Render tab content
  renderTab();
}

function renderTab() {
  mainContent.innerHTML = '';
  switch (currentTab) {
    case 'health':
      renderHealth(mainContent);
      if (window.__lastStreamData) updateHealth(window.__lastStreamData);
      break;
    case 'active':
      renderActive(mainContent);
      if (window.__lastStreamData) updateActive(window.__lastStreamData);
      break;
    case 'users':
      renderUsers(mainContent);
      break;
    case 'hosts':
      renderHosts(mainContent);
      break;
  }
}

// ── FAB Button (Add User) ──────────────────────────────────────
function createFab() {
  const btn = document.createElement('button');
  btn.className = 'fab';
  btn.innerHTML = '+';
  btn.title = 'Add User';
  btn.addEventListener('click', () => {
    if (window.__addUser) window.__addUser();
  });
  document.getElementById('app').appendChild(btn);
  return btn;
}

// ── SSE Connection ─────────────────────────────────────────────
function connectSSE() {
  if (eventSource) {
    eventSource.close();
  }

  setStatus('connecting');
  eventSource = new EventSource('/api/stream');

  eventSource.onopen = () => {
    setStatus('connected');
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      window.__lastStreamData = data;

      // Update health strip (always visible)
      updateStrip(data);

      // Update current tab
      switch (currentTab) {
        case 'health':
          updateHealth(data);
          break;
        case 'active':
          updateActive(data);
          break;
        // Users & Hosts do their own fetching
      }
    } catch (err) {
      console.error('[SSE parse error]', err);
    }
  };

  eventSource.onerror = () => {
    setStatus('error');
    eventSource.close();
    // Reconnect after 5 seconds
    setTimeout(connectSSE, 5000);
  };

  eventSource.addEventListener('error', (event) => {
    // Custom error event from server
    try {
      const data = JSON.parse(event.data);
      console.error('[SSE server error]', data.error);
    } catch {}
  });
}

// ── Health Strip (always visible) ──────────────────────────────
function updateStrip(data) {
  const { resource, interfaces, active } = data;

  // CPU
  const cpuEl = document.getElementById('val-cpu');
  if (cpuEl && resource) cpuEl.textContent = `${resource['cpu-load'] || 0}%`;

  // Memory
  const memEl = document.getElementById('val-mem');
  if (memEl && resource) memEl.textContent = `${memoryPercent(resource)}%`;

  // Uptime
  const upEl = document.getElementById('val-uptime');
  if (upEl && resource) upEl.textContent = formatUptime(resource['uptime']);

  // Total TX/RX from all interfaces
  if (Array.isArray(interfaces)) {
    let totalTx = 0;
    let totalRx = 0;
    interfaces.forEach(iface => {
      totalTx += parseInt(iface['tx-byte'] || 0);
      totalRx += parseInt(iface['rx-byte'] || 0);
    });

    const txEl = document.getElementById('val-tx');
    const rxEl = document.getElementById('val-rx');
    if (txEl) txEl.textContent = formatBytes(totalTx);
    if (rxEl) rxEl.textContent = formatBytes(totalRx);
  }
}

// ── Connection Status ──────────────────────────────────────────
function setStatus(state) {
  statusDot.className = 'status-dot';
  switch (state) {
    case 'connected':
      statusDot.classList.add('connected');
      statusLabel.textContent = 'Live';
      break;
    case 'connecting':
      statusLabel.textContent = 'Connecting…';
      break;
    case 'error':
      statusDot.classList.add('error');
      statusLabel.textContent = 'Disconnected';
      break;
  }
}

// ── Init ────────────────────────────────────────────────────────
renderTab();
connectSSE();
