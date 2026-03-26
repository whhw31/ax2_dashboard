// ── API Client — wraps fetch calls to the backend proxy ─────────
const API_BASE = '/api';

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.detail || 'API request failed');
  }
  return res.json();
}

export const api = {
  // System
  getResource: () => request('GET', '/system/resource'),
  getHealth: () => request('GET', '/system/health'),

  // Interfaces
  getInterfaces: () => request('GET', '/interfaces'),

  // Hotspot — Active
  getActive: () => request('GET', '/hotspot/active'),
  disconnect: (id) => request('POST', '/hotspot/disconnect', { id }),

  // Hotspot — Users
  getUsers: () => request('GET', '/hotspot/users'),
  addUser: (data) => request('POST', '/hotspot/users', data),
  updateUser: (id, data) => request('PATCH', `/hotspot/users/${id}`, data),
  deleteUser: (id) => request('DELETE', `/hotspot/users/${id}`),
  resetCounters: (id) => request('POST', '/hotspot/users/reset-counters', { id }),
  resetAllCounters: () => request('POST', '/hotspot/users/reset-all-counters', {}),

  // Hotspot — Profiles
  getProfiles: () => request('GET', '/hotspot/profiles'),

  // Hotspot — Hosts
  getHosts: () => request('GET', '/hotspot/hosts'),

  // Queues
  getQueues: () => request('GET', '/queues'),
};
