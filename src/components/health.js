// ── Health Panel Component ──────────────────────────────────────
import { formatBytes, formatUptime, memoryPercent, formatBps } from '../utils.js';

const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 38; // radius=38 in SVG

function createGauge(id, label, color) {
  return `
    <div class="glass-card gauge-card">
      <div class="gauge-ring">
        <svg width="90" height="90" viewBox="0 0 90 90">
          <circle class="gauge-bg" cx="45" cy="45" r="38"/>
          <circle class="gauge-fill" id="gauge-fill-${id}" cx="45" cy="45" r="38"
            stroke="${color}"
            stroke-dasharray="${GAUGE_CIRCUMFERENCE}"
            stroke-dashoffset="${GAUGE_CIRCUMFERENCE}"/>
        </svg>
        <div class="gauge-text">
          <span id="gauge-val-${id}">—</span>
          <small>${label}</small>
        </div>
      </div>
      <div class="gauge-label">${label}</div>
    </div>`;
}

export function renderHealth(container) {
  container.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Router Health</h2>
    </div>
    <div class="health-grid">
      ${createGauge('cpu', 'CPU', 'var(--accent-cyan)')}
      ${createGauge('mem', 'Memory', 'var(--accent-purple)')}
      ${createGauge('disk', 'Disk', 'var(--accent-orange)')}
      ${createGauge('active', 'Active', 'var(--accent-green)')}
    </div>

    <div class="glass-card" id="system-info-card">
      <div class="section-header" style="margin-bottom:var(--space-sm)">
        <h3 style="font-size:14px;font-weight:700;">System Info</h3>
      </div>
      <div id="system-info-rows">
        <div class="skeleton" style="height:120px;"></div>
      </div>
    </div>

    <div class="glass-card" id="interfaces-card">
      <div class="section-header" style="margin-bottom:var(--space-sm)">
        <h3 style="font-size:14px;font-weight:700;">Interfaces</h3>
      </div>
      <div id="interfaces-list">
        <div class="skeleton" style="height:160px;"></div>
      </div>
    </div>
  `;
}

export function updateHealth(data) {
  if (!data) return;
  const { resource, health, interfaces, active } = data;

  // CPU gauge
  const cpuLoad = resource?.['cpu-load'] ?? 0;
  updateGauge('cpu', cpuLoad, `${cpuLoad}%`);

  // Memory gauge
  const memPct = memoryPercent(resource);
  updateGauge('mem', memPct, `${memPct}%`);

  // Disk gauge
  const totalDisk = resource?.['total-hdd-space'] ?? 0;
  const freeDisk = resource?.['free-hdd-space'] ?? 0;
  const diskPct = totalDisk > 0 ? Math.round(((totalDisk - freeDisk) / totalDisk) * 100) : 0;
  updateGauge('disk', diskPct, `${diskPct}%`);

  // Active sessions gauge (cap at 50 for visual)
  const activeCount = Array.isArray(active) ? active.length : 0;
  const activePct = Math.min(activeCount * 2, 100); // scale: 50 active = 100%
  updateGauge('active', activePct, `${activeCount}`);

  // System info
  const infoEl = document.getElementById('system-info-rows');
  if (infoEl && resource) {
    const rows = [
      ['Board', resource['board-name'] || '—'],
      ['RouterOS', resource['version'] || '—'],
      ['Architecture', resource['architecture-name'] || '—'],
      ['Uptime', formatUptime(resource['uptime'])],
      ['Total Memory', formatBytes(resource['total-memory'])],
      ['Free Memory', formatBytes(resource['free-memory'])],
      ['Total Disk', formatBytes(resource['total-hdd-space'])],
      ['Free Disk', formatBytes(resource['free-hdd-space'])],
    ];

    // Add health entries if available
    if (Array.isArray(health)) {
      health.forEach(h => {
        if (h.name && h.value !== undefined) {
          rows.push([h.name, `${h.value}${h.type === 'C' ? '°C' : h.type === 'V' ? 'V' : ''}`]);
        }
      });
    }

    infoEl.innerHTML = rows.map(([label, value]) => `
      <div class="info-row">
        <span class="info-label">${label}</span>
        <span class="info-value">${value}</span>
      </div>
    `).join('');
  }

  // Interfaces
  const ifaceEl = document.getElementById('interfaces-list');
  if (ifaceEl && Array.isArray(interfaces)) {
    const sorted = [...interfaces].sort((a, b) => {
      if (a.running === 'true' && b.running !== 'true') return -1;
      if (a.running !== 'true' && b.running === 'true') return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    ifaceEl.innerHTML = sorted.map(iface => {
      const isUp = iface.running === 'true' || iface.running === true;
      const tx = parseInt(iface['tx-byte'] || 0);
      const rx = parseInt(iface['rx-byte'] || 0);
      return `
        <div class="iface-item">
          <div style="display:flex;align-items:center;gap:var(--space-sm)">
            <span class="iface-status ${isUp ? 'up' : 'down'}"></span>
            <span class="iface-name">${iface.name || '—'}</span>
          </div>
          <div class="iface-traffic">
            <span class="iface-tx">▲ ${formatBytes(tx)}</span>
            <span class="iface-rx">▼ ${formatBytes(rx)}</span>
          </div>
        </div>`;
    }).join('');
  }
}

function updateGauge(id, percent, text) {
  const fill = document.getElementById(`gauge-fill-${id}`);
  const val = document.getElementById(`gauge-val-${id}`);
  if (fill) {
    const offset = GAUGE_CIRCUMFERENCE - (percent / 100) * GAUGE_CIRCUMFERENCE;
    fill.style.strokeDashoffset = offset;

    // Color transitions based on load
    if (id === 'cpu' || id === 'mem' || id === 'disk') {
      if (percent > 85) fill.style.stroke = 'var(--accent-red)';
      else if (percent > 60) fill.style.stroke = 'var(--accent-orange)';
      else fill.style.stroke = '';
    }
  }
  if (val) val.textContent = text;
}
