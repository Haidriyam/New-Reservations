// ===================================================
// ADMIN PORTAL CONTROL JAVASCRIPT
// Full control over users, balance, tasks, lucky orders,
// invite codes, RBAC team roles & catalog
// ===================================================

const ADMIN_API = '/api/admin';

const adminState = {
  token: localStorage.getItem('rr_admin_token') || '',
  admin: JSON.parse(localStorage.getItem('rr_admin_user') || 'null'),
  currentSection: 'overview',
  activeUserId: null
};

// API Fetch with Admin Auth
async function adminApi(endpoint, options = {}) {
  const headers = options.headers || {};
  if (adminState.token) {
    headers['Authorization'] = `Bearer ${adminState.token}`;
  }
  if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(`${ADMIN_API}${endpoint}`, {
      ...options,
      headers
    });
    const data = await res.json();
    if (res.status === 401) {
      showAdminLogin();
    }
    return data;
  } catch (err) {
    console.error('Admin API Error:', err);
    return { success: false, message: 'Server connection error.' };
  }
}

function applyRoleVisibility(role) {
  const adminNav = document.getElementById('nav-item-admins');
  const settingsNav = document.getElementById('nav-item-settings');
  if (role !== 'superadmin') {
    if (adminNav) adminNav.style.display = 'none';
    if (settingsNav) settingsNav.style.display = 'none';
  } else {
    if (adminNav) adminNav.style.display = 'flex';
    if (settingsNav) settingsNav.style.display = 'flex';
  }
}

function showAdminLogin() {
  document.getElementById('admin-login-view').style.display = 'flex';
  document.getElementById('admin-dashboard-view').style.display = 'none';
}

function showAdminDashboard() {
  document.getElementById('admin-login-view').style.display = 'none';
  document.getElementById('admin-dashboard-view').style.display = 'flex';
  if (adminState.admin) {
    document.getElementById('admin-user-name').textContent = adminState.admin.username;
    document.getElementById('admin-user-role-label').textContent = adminState.admin.role || 'superadmin';
    applyRoleVisibility(adminState.admin.role);
  }
  loadDashboardStats();
  switchAdminSection('overview');
}

// Admin Login Form
document.getElementById('form-admin-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('admin-username-input').value.trim();
  const password = document.getElementById('admin-password-input').value;

  const data = await adminApi('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });

  if (data.success) {
    adminState.token = data.token;
    adminState.admin = data.admin;
    localStorage.setItem('rr_admin_token', data.token);
    localStorage.setItem('rr_admin_user', JSON.stringify(data.admin));
    showAdminDashboard();
  } else {
    alert(data.message || 'Login failed.');
  }
});

// Admin Logout
document.getElementById('btn-admin-logout').addEventListener('click', () => {
  localStorage.removeItem('rr_admin_token');
  localStorage.removeItem('rr_admin_user');
  adminState.token = '';
  adminState.admin = null;
  showAdminLogin();
});

// Section Navigation
function switchAdminSection(secName) {
  adminState.currentSection = secName;

  document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
    if (link.dataset.section === secName) link.classList.add('active');
    else link.classList.remove('active');
  });

  document.querySelectorAll('.admin-section').forEach(sec => {
    sec.style.display = 'none';
  });

  const target = document.getElementById(`sec-${secName}`);
  if (target) target.style.display = 'block';

  const titles = {
    overview: 'Dashboard Overview',
    users: 'Users Management & Task Controls',
    'invite-codes': 'Code & Token Generator',
    'lucky-orders': 'Lucky Orders Injector',
    recharges: 'Recharge Approvals',
    withdrawals: 'Withdrawal Requests',
    products: 'Products Catalog Pool',
    admins: 'Admin Team & RBAC Management',
    settings: 'Global Platform Settings'
  };
  document.getElementById('admin-page-title').textContent = titles[secName] || 'HQ Control';

  if (secName === 'overview') loadDashboardStats();
  if (secName === 'users') loadUsersTable();
  if (secName === 'invite-codes') loadInviteCodesTable();
  if (secName === 'lucky-orders') loadLuckyOrdersSection();
  if (secName === 'recharges') loadRechargesTable();
  if (secName === 'withdrawals') loadWithdrawalsTable();
  if (secName === 'products') loadProductsTable();
  if (secName === 'admins') loadAdminsTable();
  if (secName === 'settings') loadSettingsForm();
}

document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
  link.addEventListener('click', () => switchAdminSection(link.dataset.section));
});

// -------------------------------------------------------------
// 1. DASHBOARD OVERVIEW
// -------------------------------------------------------------
async function loadDashboardStats() {
  const data = await adminApi('/dashboard-stats');
  if (data.success && data.stats) {
    document.getElementById('stat-total-users').textContent = data.stats.total_users;
    document.getElementById('stat-total-balance').textContent = data.stats.total_user_balance;
    document.getElementById('stat-pending-recharges').textContent = data.stats.pending_recharges;
    document.getElementById('stat-pending-withdrawals').textContent = data.stats.pending_withdrawals;
    document.getElementById('stat-completed-orders').textContent = data.stats.completed_orders;
    document.getElementById('stat-active-lucky').textContent = data.stats.active_lucky_triggers;
    const elTokens = document.getElementById('stat-active-tokens');
    if (elTokens) elTokens.textContent = data.stats.active_tokens || 0;
  }
}

// -------------------------------------------------------------
// 2. USERS MANAGEMENT (Create, Delete, Freeze, Adjust)
// -------------------------------------------------------------
async function loadUsersTable() {
  const data = await adminApi('/users');
  if (data.success) {
    const tbody = document.getElementById('admin-users-table-body');
    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#94a3b8;">No registered users yet</td></tr>`;
      return;
    }

    tbody.innerHTML = data.users.map(u => `
      <tr>
        <td>#${u.id}</td>
        <td>
          <strong style="color:#fff;">${u.username}</strong>
          <div style="font-size:11px; color:#94a3b8;">VIP ${u.vip_level}</div>
        </td>
        <td>
          <div style="font-weight:700; color:#10b981;">${parseFloat(u.balance).toFixed(2)} USDT</div>
          ${u.frozen_balance > 0 ? `<div style="font-size:11px; color:#ef4444;">Frozen: ${parseFloat(u.frozen_balance).toFixed(2)}</div>` : ''}
        </td>
        <td>
          <strong>${u.completed_tasks} / ${u.max_daily_tasks}</strong>
          <button class="btn-sm btn-secondary-sm" style="margin-left:6px; font-size:11px;" onclick="openAdjustTasksModal(${u.id}, '${u.username}', ${u.completed_tasks}, ${u.max_daily_tasks})">✏️ Edit</button>
        </td>
        <td><code style="color:#ea580c; font-weight:700;">${u.invite_code}</code></td>
        <td>${u.invited_by ? `<code style="color:#94a3b8;">${u.invited_by}</code>` : '<span style="color:#64748b;">Direct</span>'}</td>
        <td>
          <span class="badge-status ${u.status === 'active' ? 'badge-active' : 'badge-suspended'}">${u.status}</span>
        </td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn-sm btn-primary-sm" onclick="openAdjustBalModal(${u.id}, '${u.username}', ${u.balance})">± Bal</button>
            <button class="btn-sm btn-warning-sm" style="background:#f59e0b; color:#fff;" onclick="prepareLuckyOrderForUser(${u.id})">✨ Lucky</button>
            <button class="btn-sm ${u.status === 'active' ? 'btn-secondary-sm' : 'btn-success-sm'}" onclick="toggleUserStatus(${u.id})">
              ${u.status === 'active' ? 'Freeze' : 'Unfreeze'}
            </button>
            <button class="btn-sm btn-danger-sm" onclick="deleteUser(${u.id}, '${u.username}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  }
}

// Add User Modal
window.openAddUserModal = function() {
  document.getElementById('modal-add-user').classList.add('active');
};

document.getElementById('form-create-user-modal').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    username: document.getElementById('newuser-name').value.trim(),
    password: document.getElementById('newuser-pass').value,
    balance: parseFloat(document.getElementById('newuser-bal').value) || 0,
    max_daily_tasks: parseInt(document.getElementById('newuser-tasks').value) || 60,
    vip_level: parseInt(document.getElementById('newuser-vip').value) || 1,
    withdrawal_pin: document.getElementById('newuser-pin').value || '123456',
    invite_code: document.getElementById('newuser-code').value.trim() || undefined,
    invited_by: document.getElementById('newuser-inviter').value.trim() || undefined
  };

  const data = await adminApi('/users', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (data.success) {
    alert(data.message || 'User created successfully!');
    closeModal('modal-add-user');
    document.getElementById('form-create-user-modal').reset();
    loadUsersTable();
    loadDashboardStats();
  } else {
    alert(data.message || 'Failed to create user.');
  }
});

// Delete User
window.deleteUser = async function(id, username) {
  if (!confirm(`Are you sure you want to permanently delete user "${username}"?\nAll associated orders, transactions, and lucky triggers will be wiped.`)) return;
  const data = await adminApi(`/users/${id}`, { method: 'DELETE' });
  if (data.success) {
    alert(data.message || 'User deleted successfully.');
    loadUsersTable();
    loadDashboardStats();
  } else {
    alert(data.message || 'Failed to delete user.');
  }
};

// Adjust Balance Modal
window.openAdjustBalModal = function(id, username, currentBal) {
  adminState.activeUserId = id;
  document.getElementById('bal-modal-user').textContent = username;
  document.getElementById('bal-modal-current').textContent = parseFloat(currentBal).toFixed(2);
  document.getElementById('bal-modal-amount').value = '';
  document.getElementById('modal-adjust-balance').classList.add('active');
};

document.getElementById('btn-confirm-adjust-bal').addEventListener('click', async () => {
  const amount = document.getElementById('bal-modal-amount').value;
  if (!amount || isNaN(amount)) {
    alert('Please enter a valid amount.');
    return;
  }

  const data = await adminApi(`/users/${adminState.activeUserId}/adjust-balance`, {
    method: 'POST',
    body: JSON.stringify({ amount: parseFloat(amount) })
  });

  if (data.success) {
    alert(data.message);
    closeModal('modal-adjust-balance');
    loadUsersTable();
    loadDashboardStats();
  } else {
    alert(data.message || 'Failed to adjust balance.');
  }
});

// Adjust Tasks Modal
window.openAdjustTasksModal = function(id, username, completed, max) {
  adminState.activeUserId = id;
  document.getElementById('task-modal-user').textContent = username;
  document.getElementById('task-modal-completed').value = completed;
  document.getElementById('task-modal-max').value = max;
  document.getElementById('modal-adjust-tasks').classList.add('active');
};

document.getElementById('btn-confirm-adjust-tasks').addEventListener('click', async () => {
  const completed = document.getElementById('task-modal-completed').value;
  const max = document.getElementById('task-modal-max').value;

  const data = await adminApi(`/users/${adminState.activeUserId}/update-tasks`, {
    method: 'POST',
    body: JSON.stringify({ completed_tasks: completed, max_daily_tasks: max })
  });

  if (data.success) {
    alert(data.message);
    closeModal('modal-adjust-tasks');
    loadUsersTable();
  } else {
    alert(data.message || 'Failed to update tasks.');
  }
});

// Toggle User Status
window.toggleUserStatus = async function(id) {
  const data = await adminApi(`/users/${id}/toggle-status`, { method: 'POST' });
  if (data.success) {
    alert(data.message);
    loadUsersTable();
  }
};

window.closeModal = function(modalId) {
  document.getElementById(modalId).classList.remove('active');
};

// -------------------------------------------------------------
// 3. INVITATION CODES & TOKENS GENERATOR
// -------------------------------------------------------------
async function loadInviteCodesTable() {
  const data = await adminApi('/invite-codes');
  const tbody = document.getElementById('admin-codes-table-body');
  if (!tbody) return;

  if (data.success) {
    if (!data.codes || data.codes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">No invitation codes created yet</td></tr>`;
      return;
    }

    tbody.innerHTML = data.codes.map(c => `
      <tr>
        <td><code style="color:#38bdf8; font-weight:700; font-size:13px;">${c.code}</code></td>
        <td><strong style="color:#10b981;">${parseFloat(c.bonus_balance).toFixed(2)} USDT</strong></td>
        <td><strong>${c.times_used}</strong> / ${c.max_uses === 0 ? '<span style="color:#94a3b8;">Unlimited</span>' : c.max_uses}</td>
        <td><span style="font-size:12px; color:#f8fafc;">VIP ${c.vip_level}</span></td>
        <td><span style="font-size:12px; color:#94a3b8;">${c.created_by || 'system'}</span></td>
        <td>
          <span class="badge-status ${c.is_active ? 'badge-active' : 'badge-suspended'}">
            ${c.is_active ? 'Active' : 'Disabled'}
          </span>
        </td>
        <td>
          <button class="btn-sm btn-danger-sm" onclick="deleteInviteCode(${c.id}, '${c.code}')">Delete</button>
        </td>
      </tr>
    `).join('');
  }
}

document.getElementById('form-generate-codes').addEventListener('submit', async (e) => {
  e.preventDefault();
  const customCode = document.getElementById('gen-custom-code').value.trim();
  const count = parseInt(document.getElementById('gen-batch-count').value) || 1;
  const bonusBal = parseFloat(document.getElementById('gen-bonus-bal').value) || 0;
  const maxUses = parseInt(document.getElementById('gen-max-uses').value) || 1;
  const vipLevel = parseInt(document.getElementById('gen-vip-level').value) || 1;

  const data = await adminApi('/invite-codes/generate', {
    method: 'POST',
    body: JSON.stringify({
      code: customCode || undefined,
      count: count,
      bonus_balance: bonusBal,
      max_uses: maxUses,
      vip_level: vipLevel
    })
  });

  if (data.success) {
    alert(data.message || 'Invite code(s) generated!');
    document.getElementById('gen-custom-code').value = '';
    loadInviteCodesTable();
    loadDashboardStats();
  } else {
    alert(data.message || 'Failed to generate codes.');
  }
});

window.deleteInviteCode = async function(id, code) {
  if (!confirm(`Delete invite code "${code}"?`)) return;
  const data = await adminApi(`/invite-codes/${id}`, { method: 'DELETE' });
  if (data.success) {
    alert(data.message || 'Invite code deleted.');
    loadInviteCodesTable();
    loadDashboardStats();
  } else {
    alert(data.message || 'Failed to delete code.');
  }
};

// -------------------------------------------------------------
// 4. LUCKY ORDERS INJECTOR (Core Feature)
// -------------------------------------------------------------
async function loadLuckyOrdersSection() {
  const usersData = await adminApi('/users');
  const userSelect = document.getElementById('lucky-target-user-select');
  if (usersData.success && usersData.users) {
    userSelect.innerHTML = usersData.users.map(u => `
      <option value="${u.id}">${u.username} (Bal: ${parseFloat(u.balance).toFixed(2)} USDT, Task: ${u.completed_tasks}/${u.max_daily_tasks})</option>
    `).join('');
  }
  loadLuckyOrdersTable();
}

async function loadLuckyOrdersTable() {
  const data = await adminApi('/lucky-orders');
  const tbody = document.getElementById('admin-lucky-table-body');
  if (data.success) {
    if (!data.lucky_orders || data.lucky_orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#94a3b8;">No active lucky order triggers in queue</td></tr>`;
      return;
    }

    tbody.innerHTML = data.lucky_orders.map(t => `
      <tr>
        <td>#${t.id}</td>
        <td><strong style="color:#fff;">${t.username}</strong></td>
        <td>
          <span style="color:#f59e0b; font-weight:600;">
            ${t.trigger_type === 'next' ? 'Next "Start Matching"' : `At Task #${t.target_task_number}`}
          </span>
        </td>
        <td><strong style="color:#ea580c;">${parseFloat(t.amount).toFixed(2)} USDT</strong></td>
        <td><strong style="color:#10b981;">+${parseFloat(t.expected_return).toFixed(2)} USDT</strong></td>
        <td>${parseFloat(t.user_balance).toFixed(2)} USDT</td>
        <td>
          <span class="badge-status ${t.is_active ? 'badge-pending' : 'badge-completed'}">
            ${t.is_active ? 'Waiting Trigger' : 'Triggered / Used'}
          </span>
        </td>
        <td>
          <button class="btn-sm btn-danger-sm" onclick="deleteLuckyOrder(${t.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  }
}

document.getElementById('form-inject-lucky-order').addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = document.getElementById('lucky-target-user-select').value;
  const triggerType = document.getElementById('lucky-trigger-type').value;
  const targetTaskNum = document.getElementById('lucky-target-task-num').value;
  const amount = document.getElementById('lucky-amount-input').value;
  const expectedReturn = document.getElementById('lucky-return-input').value;
  const prodName = document.getElementById('lucky-prod-name-input').value;

  const data = await adminApi(`/users/${userId}/inject-lucky-order`, {
    method: 'POST',
    body: JSON.stringify({
      trigger_type: triggerType,
      target_task_number: targetTaskNum,
      amount: parseFloat(amount),
      expected_return: parseFloat(expectedReturn),
      product_name: prodName
    })
  });

  if (data.success) {
    alert(data.message);
    loadLuckyOrdersTable();
    loadDashboardStats();
  } else {
    alert(data.message || 'Failed to inject lucky order.');
  }
});

window.prepareLuckyOrderForUser = function(userId) {
  switchAdminSection('lucky-orders');
  document.getElementById('lucky-target-user-select').value = userId;
};

window.deleteLuckyOrder = async function(id) {
  if (confirm('Delete this lucky order trigger?')) {
    const data = await adminApi(`/lucky-orders/${id}`, { method: 'DELETE' });
    if (data.success) {
      loadLuckyOrdersTable();
      loadDashboardStats();
    }
  }
};

// -------------------------------------------------------------
// 5. RECHARGE APPROVALS (Credits Balance to User)
// -------------------------------------------------------------
async function loadRechargesTable() {
  const data = await adminApi('/recharges');
  const tbody = document.getElementById('admin-recharge-table-body');
  if (data.success) {
    if (!data.recharges || data.recharges.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#94a3b8;">No recharge requests found</td></tr>`;
      return;
    }

    tbody.innerHTML = data.recharges.map(r => `
      <tr>
        <td>#${r.id}</td>
        <td>
          <strong style="color:#fff;">${r.username}</strong>
          <div style="font-size:11px; color:#94a3b8;">Current: ${parseFloat(r.user_balance).toFixed(2)} USDT</div>
        </td>
        <td><strong style="color:#10b981; font-size:14px;">+${parseFloat(r.amount).toFixed(2)} USDT</strong></td>
        <td>
          <code style="font-size:11px; color:#ea580c;">${r.txid || 'Direct transfer'}</code>
        </td>
        <td>
          ${r.proof_image ? `<a href="${r.proof_image}" target="_blank" style="color:#38bdf8; font-weight:600;">View Receipt ↗</a>` : '<span style="color:#64748b;">None</span>'}
        </td>
        <td style="font-size:12px; color:#94a3b8;">${r.created_at.slice(0, 16)}</td>
        <td>
          <span class="badge-status badge-${r.status}">${r.status}</span>
        </td>
        <td>
          ${r.status === 'pending' ? `
            <div style="display:flex; gap:6px;">
              <button class="btn-sm btn-success-sm" onclick="processRecharge(${r.id}, 'approve')">Approve & Credit</button>
              <button class="btn-sm btn-danger-sm" onclick="processRecharge(${r.id}, 'reject')">Reject</button>
            </div>
          ` : `<span style="font-size:12px; color:#94a3b8;">Processed</span>`}
        </td>
      </tr>
    `).join('');
  }
}

window.processRecharge = async function(id, action) {
  const notes = prompt(`Enter notes for ${action}:`, action === 'approve' ? 'Confirmed on Tronscan' : 'Invalid receipt');
  const data = await adminApi(`/recharges/${id}/process`, {
    method: 'POST',
    body: JSON.stringify({ action, notes })
  });

  if (data.success) {
    alert(data.message);
    loadRechargesTable();
    loadDashboardStats();
  } else {
    alert(data.message || 'Operation failed.');
  }
};

// -------------------------------------------------------------
// 6. WITHDRAWAL APPROVALS
// -------------------------------------------------------------
async function loadWithdrawalsTable() {
  const data = await adminApi('/withdrawals');
  const tbody = document.getElementById('admin-withdrawals-table-body');
  if (data.success) {
    if (!data.withdrawals || data.withdrawals.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">No withdrawal requests found</td></tr>`;
      return;
    }

    tbody.innerHTML = data.withdrawals.map(w => `
      <tr>
        <td>#${w.id}</td>
        <td><strong style="color:#fff;">${w.username}</strong></td>
        <td><strong style="color:#ef4444; font-size:14px;">-${parseFloat(w.amount).toFixed(2)} USDT</strong></td>
        <td><code style="font-size:11px; color:#38bdf8;">${w.trc20_address}</code></td>
        <td style="font-size:12px; color:#94a3b8;">${w.created_at.slice(0, 16)}</td>
        <td><span class="badge-status badge-${w.status}">${w.status}</span></td>
        <td>
          ${w.status === 'pending' ? `
            <div style="display:flex; gap:6px;">
              <button class="btn-sm btn-success-sm" onclick="processWithdrawal(${w.id}, 'approve')">Approve</button>
              <button class="btn-sm btn-danger-sm" onclick="processWithdrawal(${w.id}, 'reject')">Reject & Refund</button>
            </div>
          ` : `<span style="font-size:12px; color:#94a3b8;">Processed</span>`}
        </td>
      </tr>
    `).join('');
  }
}

window.processWithdrawal = async function(id, action) {
  const notes = prompt(`Enter notes for ${action}:`, action === 'approve' ? 'Transfer sent' : 'Rejected');
  const data = await adminApi(`/withdrawals/${id}/process`, {
    method: 'POST',
    body: JSON.stringify({ action, notes })
  });

  if (data.success) {
    alert(data.message);
    loadWithdrawalsTable();
    loadDashboardStats();
  } else {
    alert(data.message || 'Operation failed.');
  }
};

// -------------------------------------------------------------
// 7. PRODUCTS CATALOG
// -------------------------------------------------------------
async function loadProductsTable() {
  const data = await adminApi('/products');
  const tbody = document.getElementById('admin-products-table-body');
  if (data.success) {
    tbody.innerHTML = data.products.map(p => `
      <tr>
        <td><img src="${p.image_url}" style="width:48px; height:40px; object-fit:cover; border-radius:4px; background:#334155;"></td>
        <td><strong style="color:#fff;">${p.name}</strong></td>
        <td><strong style="color:#ea580c;">${parseFloat(p.price).toFixed(2)} USDT</strong></td>
        <td>${(parseFloat(p.commission_rate) * 100).toFixed(1)}%</td>
        <td>
          <button class="btn-sm btn-danger-sm" onclick="deleteProduct(${p.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  }
}

document.getElementById('form-add-product').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('prod-name-in').value;
  const price = document.getElementById('prod-price-in').value;
  const commission_rate = document.getElementById('prod-comm-in').value;
  const image_url = document.getElementById('prod-img-in').value;

  const data = await adminApi('/products', {
    method: 'POST',
    body: JSON.stringify({ name, price, commission_rate, image_url })
  });

  if (data.success) {
    alert('Product added!');
    document.getElementById('prod-name-in').value = '';
    document.getElementById('prod-price-in').value = '';
    loadProductsTable();
  }
});

window.deleteProduct = async function(id) {
  if (confirm('Delete this product from catalog?')) {
    const data = await adminApi(`/products/${id}`, { method: 'DELETE' });
    if (data.success) loadProductsTable();
  }
};

// -------------------------------------------------------------
// 8. ADMIN TEAM & RBAC MANAGEMENT
// -------------------------------------------------------------
async function loadAdminsTable() {
  const data = await adminApi('/admins');
  const tbody = document.getElementById('admin-roster-table-body');
  if (!tbody) return;

  if (data.success) {
    if (!data.admins || data.admins.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#94a3b8;">No admin users found</td></tr>`;
      return;
    }

    tbody.innerHTML = data.admins.map(a => `
      <tr>
        <td>#${a.id}</td>
        <td><strong style="color:#fff;">${a.username}</strong></td>
        <td><span class="badge-role badge-${a.role}">${a.role}</span></td>
        <td style="font-size:12px; color:#94a3b8;">${(a.created_at || '').slice(0, 16)}</td>
        <td>
          ${a.username === 'admin' ? '<span style="font-size:12px; color:#64748b;">Primary Superadmin</span>' : `
            <button class="btn-sm btn-danger-sm" onclick="deleteAdmin(${a.id}, '${a.username}')">Remove</button>
          `}
        </td>
      </tr>
    `).join('');
  }
}

document.getElementById('form-add-admin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('admin-new-username').value.trim();
  const password = document.getElementById('admin-new-password').value;
  const role = document.getElementById('admin-new-role').value;

  const data = await adminApi('/admins', {
    method: 'POST',
    body: JSON.stringify({ username, password, role })
  });

  if (data.success) {
    alert(data.message || 'Admin account created!');
    document.getElementById('admin-new-username').value = '';
    document.getElementById('admin-new-password').value = '';
    loadAdminsTable();
  } else {
    alert(data.message || 'Failed to create admin.');
  }
});

window.deleteAdmin = async function(id, username) {
  if (!confirm(`Revoke admin privileges and delete "${username}"?`)) return;
  const data = await adminApi(`/admins/${id}`, { method: 'DELETE' });
  if (data.success) {
    alert(data.message || 'Admin deleted.');
    loadAdminsTable();
  } else {
    alert(data.message || 'Failed to delete admin.');
  }
};

// -------------------------------------------------------------
// 9. SYSTEM SETTINGS
// -------------------------------------------------------------
async function loadSettingsForm() {
  const data = await adminApi('/settings');
  if (data.success && data.settings) {
    document.getElementById('set-platform-title').value = data.settings.platform_name || '';
    document.getElementById('set-deposit-addr').value = data.settings.trc20_deposit_address || '';
    document.getElementById('set-daily-tasks').value = data.settings.default_daily_tasks || 60;
    document.getElementById('set-min-dep').value = data.settings.min_deposit || 20;
    document.getElementById('set-min-with').value = data.settings.min_withdraw || 30;
    document.getElementById('set-tg-url').value = data.settings.customer_service_url || '';
    document.getElementById('set-admin-path').value = data.settings.admin_secret_path || '/secret-admin-portal-xyz';
  }
}

document.getElementById('form-admin-settings').addEventListener('submit', async (e) => {
  e.preventDefault();
  const settings = {
    platform_name: document.getElementById('set-platform-title').value,
    trc20_deposit_address: document.getElementById('set-deposit-addr').value,
    default_daily_tasks: document.getElementById('set-daily-tasks').value,
    min_deposit: document.getElementById('set-min-dep').value,
    min_withdraw: document.getElementById('set-min-with').value,
    customer_service_url: document.getElementById('set-tg-url').value,
    admin_secret_path: document.getElementById('set-admin-path').value
  };

  const data = await adminApi('/settings', {
    method: 'POST',
    body: JSON.stringify({ settings })
  });

  if (data.success) {
    alert('Settings saved successfully!');
  } else {
    alert(data.message || 'Failed to save settings.');
  }
});

// Initialization
if (adminState.token) {
  showAdminDashboard();
} else {
  showAdminLogin();
}
