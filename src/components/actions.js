// ── Actions / Modal Dialogs ─────────────────────────────────────
import { escapeHtml } from '../utils.js';

const overlay = () => document.getElementById('modal-overlay');
const card = () => document.getElementById('modal-card');

function openModal(html) {
  card().innerHTML = html;
  overlay().classList.remove('hidden');

  // Close on overlay click
  overlay().onclick = (e) => {
    if (e.target === overlay()) closeModal();
  };

  // Close on Escape
  const handler = (e) => {
    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', handler); }
  };
  document.addEventListener('keydown', handler);
}

function closeModal() {
  overlay().classList.add('hidden');
}

// ── Profile Modal ────────────────────────────────────────────────
export function showProfileModal(username, currentProfile, profiles, onConfirm) {
  const profileOptions = (profiles || []).map(p =>
    `<option value="${escapeHtml(p.name)}" ${p.name === currentProfile ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');

  openModal(`
    <h3 class="modal-title">⚡ Assign Profile — ${escapeHtml(username)}</h3>
    <div class="modal-body">
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:var(--space-lg)">
        Select a predefined router profile to limit the user's bandwidth securely.
      </p>
      <div class="form-group">
        <label class="form-label">Profile</label>
        <select class="form-select" id="profile-select">
          <option value="default" ${currentProfile === 'default' || !currentProfile ? 'selected' : ''}>Default</option>
          ${profileOptions}
        </select>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" style="flex:1" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" style="flex:1" id="modal-confirm">Apply</button>
    </div>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', () => {
    const profile = document.getElementById('profile-select').value;
    closeModal();
    onConfirm(profile);
  });
}

// ── Confirm Modal ──────────────────────────────────────────────
export function showConfirmModal(title, message, onConfirm) {
  openModal(`
    <h3 class="modal-title">${escapeHtml(title)}</h3>
    <div class="modal-body">
      <p style="color:var(--text-secondary);font-size:13px;line-height:1.6">${escapeHtml(message)}</p>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" style="flex:1" id="modal-cancel">Cancel</button>
      <button class="btn btn-danger" style="flex:1" id="modal-confirm">Confirm</button>
    </div>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
}

// ── Add User Modal ─────────────────────────────────────────────
export function showAddUserModal(profiles, onConfirm) {
  const profileOptions = (profiles || []).map(p =>
    `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`
  ).join('');

  openModal(`
    <h3 class="modal-title">➕ Add Hotspot User</h3>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Username</label>
        <input type="text" class="form-input" id="add-username" placeholder="Enter username" autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input type="text" class="form-input" id="add-password" placeholder="Enter password" autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label">MAC Address (optional)</label>
        <input type="text" class="form-input" id="add-mac" placeholder="e.g. 00:11:22:33:44:55" autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label">Data Limit (Total Vol.)</label>
        <input type="text" class="form-input" id="add-limit" placeholder="e.g. 2G, 500M, or leave empty" autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label">Profile</label>
        <select class="form-select" id="add-profile">
          <option value="">Default</option>
          ${profileOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Comment (optional)</label>
        <input type="text" class="form-input" id="add-comment" placeholder="Optional note" />
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" style="flex:1" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" style="flex:1" id="modal-confirm">Add User</button>
    </div>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', () => {
    const name = document.getElementById('add-username').value.trim();
    const password = document.getElementById('add-password').value.trim();
    const mac = document.getElementById('add-mac').value.trim();
    const limitInput = document.getElementById('add-limit').value.trim();
    const profile = document.getElementById('add-profile').value;
    const comment = document.getElementById('add-comment').value.trim();

    if (!name) { document.getElementById('add-username').focus(); return; }
    if (!password) { document.getElementById('add-password').focus(); return; }

    const limitBytes = parseByteSuffix(limitInput);

    closeModal();
    onConfirm({ 
      name, 
      password, 
      'mac-address': mac || undefined,
      'limit-bytes-total': limitBytes || undefined,
      profile: profile || undefined, 
      comment: comment || undefined 
    });
  });
}

// ── Edit User Modal ────────────────────────────────────────────
export function showEditUserModal(user, profiles, onConfirm) {
  const profileOptions = (profiles || []).map(p =>
    `<option value="${escapeHtml(p.name)}" ${p.name === user.profile ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');

  // Format existing limit back to a readable string cleanly (e.g. 2147483648 -> 2G)
  let currentLimit = user['limit-bytes-total'] || '';
  if (currentLimit && !isNaN(currentLimit)) {
    const bytes = parseInt(currentLimit);
    if (bytes >= 1073741824) currentLimit = parseFloat((bytes/1073741824).toFixed(3)) + 'G';
    else if (bytes >= 1048576) currentLimit = parseFloat((bytes/1048576).toFixed(2)) + 'M';
    else if (bytes >= 1024) currentLimit = parseFloat((bytes/1024).toFixed(2)) + 'K';
  }

  openModal(`
    <h3 class="modal-title">✏️ Edit User — ${escapeHtml(user.name)}</h3>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Password</label>
        <input type="text" class="form-input" id="edit-password" placeholder="Leave empty to keep current" />
      </div>
      <div class="form-group">
        <label class="form-label">MAC Address</label>
        <input type="text" class="form-input" id="edit-mac" placeholder="e.g. 00:11:22:33:44:55" value="${escapeHtml(user['mac-address'] || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label">Data Limit (Total Vol.)</label>
        <input type="text" class="form-input" id="edit-limit" placeholder="e.g. 2G, 500M, or empty for none" value="${escapeHtml(currentLimit)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Profile</label>
        <select class="form-select" id="edit-profile">
          <option value="">Default</option>
          ${profileOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Comment</label>
        <input type="text" class="form-input" id="edit-comment" value="${escapeHtml(user.comment || '')}" />
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" style="flex:1" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" style="flex:1" id="modal-confirm">Save</button>
    </div>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', () => {
    const updates = {};
    const pw = document.getElementById('edit-password').value.trim();
    const mac = document.getElementById('edit-mac').value.trim();
    const limitInput = document.getElementById('edit-limit').value.trim();
    const profile = document.getElementById('edit-profile').value;
    const comment = document.getElementById('edit-comment').value.trim();

    if (pw) updates.password = pw;
    if (profile !== user.profile) updates.profile = profile || 'default';
    updates.comment = comment;
    
    // Process MAC changes safely
    if (mac) updates['mac-address'] = mac;
    else if (user['mac-address']) updates['mac-address'] = ''; // clear if erased

    // Process limit changes
    const limitBytes = parseByteSuffix(limitInput);
    if (limitBytes) updates['limit-bytes-total'] = limitBytes;
    else if (user['limit-bytes-total']) updates['limit-bytes-total'] = '0'; // MikroTik clearing value might be 0/unset
    
    // Always include name to prevent RouterOS bugs where mac-address drops on update
    updates.name = user.name;
    
    closeModal();
    onConfirm(updates);
  });
}

// ── Helper: Parse G/M/K Suffixes to Base Bytes ─────────────────
function parseByteSuffix(str) {
  if (!str) return '';
  str = str.toUpperCase().replace(/\\s/g, '');
  const m = str.match(/^(\\d+(?:\\.\\d+)?)([KMG]?B?)?$/);
  if (!m) return str; // return raw if doesn't match short syntax
  let val = parseFloat(m[1]);
  const unit = (m[2] || '').replace('B', '');
  if (unit === 'K') val *= 1024;
  else if (unit === 'M') val *= 1048576;
  else if (unit === 'G') val *= 1073741824;
  return Math.floor(val).toString();
}
