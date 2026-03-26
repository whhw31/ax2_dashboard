// ── Utility helpers ─────────────────────────────────────────────

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Format bits per second to human-readable
 */
export function formatBps(bps) {
  if (!bps || bps === 0) return '0 bps';
  const k = 1000;
  const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  const i = Math.floor(Math.log(Math.abs(bps)) / Math.log(k));
  return parseFloat((bps / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Parse MikroTik uptime string (e.g. "3d12h5m30s") to readable
 */
export function formatUptime(uptime) {
  if (!uptime) return '—';
  const match = uptime.match(/(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (!match) return uptime;
  const [, w, d, h, m] = match;
  const parts = [];
  if (w && w !== '0') parts.push(`${w}w`);
  if (d && d !== '0') parts.push(`${d}d`);
  if (h && h !== '0') parts.push(`${h}h`);
  if (m && m !== '0') parts.push(`${m}m`);
  return parts.join(' ') || '< 1m';
}

/**
 * Parse MikroTik uptime string to total seconds
 */
export function uptimeToSeconds(uptime) {
  if (!uptime) return 0;
  const match = uptime.match(/(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (!match) return 0;
  const [, w = 0, d = 0, h = 0, m = 0, s = 0] = match;
  return (+w * 604800) + (+d * 86400) + (+h * 3600) + (+m * 60) + (+s);
}

/**
 * Generate a color from a string (for avatars)
 */
export function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 60%)`;
}

/**
 * Get initials from username
 */
export function getInitials(name) {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

/**
 * Calculate memory percentage
 */
export function memoryPercent(resource) {
  if (!resource || !resource['total-memory']) return 0;
  const total = resource['total-memory'];
  const free = resource['free-memory'] || 0;
  return Math.round(((total - free) / total) * 100);
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Show a toast notification
 */
export function showToast(message, type = 'success', duration = 3000) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Debounce function
 */
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
