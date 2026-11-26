// ===================================================
// REVIEW ROBOT - FRONTEND APP ENGINE
// Exact reproduction of the flows seen in reference videos
// Production-ready Auth Gate & Interactive Dashboard
// ===================================================

const API_BASE = '/api';

const state = {
  token: localStorage.getItem('rr_token') || '',
  user: null,
  currentTab: 'trade',
  matchedProduct: null,
  activeLuckyOrder: null,
  unpreparedOrder: null,
  publicConfig: {}
};

// DOM Selectors
const el = {
  authGateView: document.getElementById('auth-gate-view'),
  appMainView: document.getElementById('app-main-view'),

  pageTitle: document.getElementById('page-title'),
  headerBackBtn: document.getElementById('header-back-btn'),
  userBalanceVal: document.getElementById('user-balance-val'),
  completedTasksVal: document.getElementById('completed-tasks-val'),
  totalTasksVal: document.getElementById('total-tasks-val'),
  btnStartMatching: document.getElementById('btn-start-matching'),
  matchingBtnText: document.getElementById('matching-btn-text'),
  
  // Modals
  modalMatchedOrder: document.getElementById('modal-matched-order'),
  matchedProductTitle: document.getElementById('matched-product-title'),
  matchedProductImg: document.getElementById('matched-product-img'),
  matchedPriceVal: document.getElementById('matched-price-val'),
  matchedReturnVal: document.getElementById('matched-return-val'),
  matchedAmountVal: document.getElementById('matched-amount-val'),
  matchedHourVal: document.getElementById('matched-hour-val'),
  btnStartTrading: document.getElementById('btn-start-trading'),
  btnCancelTrading: document.getElementById('btn-cancel-trading'),

  modalLuckyOrder: document.getElementById('modal-lucky-order'),
  luckyDiffVal: document.getElementById('lucky-diff-val'),
  luckyReturnVal: document.getElementById('lucky-return-val'),
  luckyAmountVal: document.getElementById('lucky-amount-val'),
  luckyHourVal: document.getElementById('lucky-hour-val'),
  btnLuckyCancel: document.getElementById('btn-lucky-cancel'),
  btnLuckyConfirm: document.getElementById('btn-lucky-confirm'),

  modalUnfinishedOrder: document.getElementById('modal-unfinished-order'),
  btnUnfinishedCancel: document.getElementById('btn-unfinished-cancel'),
  btnUnfinishedConfirm: document.getElementById('btn-unfinished-confirm'),

  toastSuccess: document.getElementById('toast-success'),

  // Team
  teamBalanceVal: document.getElementById('team-balance-val'),
  teamCommissionVal: document.getElementById('team-commission-val'),
  btnReceiveCommission: document.getElementById('btn-receive-commission'),
  totalPeopleVal: document.getElementById('total-people-val'),
  teamTableBody: document.getElementById('team-table-body'),
  myInviteCodeDisplay: document.getElementById('my-invite-code-display'),
  btnCopyInvite: document.getElementById('btn-copy-invite'),

  // Recharge
  rechargeAddressText: document.getElementById('recharge-address-text'),
  rechargeQrImg: document.getElementById('recharge-qr-img'),
  btnCopyAddress: document.getElementById('btn-copy-address'),
  depositAmountInput: document.getElementById('deposit-amount-input'),
  depositTxidInput: document.getElementById('deposit-txid-input'),
  depositProofFile: document.getElementById('deposit-proof-file'),
  btnIRecharged: document.getElementById('btn-i-recharged'),

  // Orders
  ordersListContainer: document.getElementById('orders-list-container'),

  // Profile
  profileUsername: document.getElementById('profile-username'),
  profileInviteCode: document.getElementById('profile-invite-code'),
  profileBalance: document.getElementById('profile-balance'),
  profileFrozen: document.getElementById('profile-frozen'),
  withdrawAvailableBal: document.getElementById('withdraw-available-bal'),
  withdrawAmountInput: document.getElementById('withdraw-amount-input'),
  withdrawAddressInput: document.getElementById('withdraw-address-input'),
  withdrawPinInput: document.getElementById('withdraw-pin-input'),
  btnSubmitWithdraw: document.getElementById('btn-submit-withdraw')
};

// Helper: API Fetch with Auth
async function api(endpoint, options = {}) {
  const headers = options.headers || {};
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });
    const data = await res.json();
    if (res.status === 401) {
      logoutUser();
    }
    return data;
  } catch (err) {
    console.error('API Error:', err);
    return { success: false, message: 'Network error. Please try again.' };
  }
}

// Show "Successful operation" Toast
function showSuccessToast(callback) {
  if (!el.toastSuccess) {
    if (callback) callback();
    return;
  }
  el.toastSuccess.classList.add('active');
  setTimeout(() => {
    el.toastSuccess.classList.remove('active');
    if (callback) callback();
  }, 1200);
}

// -------------------------------------------------------------
// AUTHENTICATION VIEW GATEWAY (Sign In / Sign Up)
// -------------------------------------------------------------
function showAuthGate() {
  if (el.authGateView) el.authGateView.style.display = 'flex';
  if (el.appMainView) el.appMainView.style.display = 'none';
}

function showAppMain() {
  if (el.authGateView) el.authGateView.style.display = 'none';
  if (el.appMainView) el.appMainView.style.display = 'flex';

  if (state.user) {
    const deskUser = document.getElementById('desktop-header-username');
    if (deskUser) deskUser.textContent = state.user.username;
    const deskBal = document.getElementById('desktop-header-balance');
    if (deskBal) deskBal.textContent = parseFloat(state.user.balance || 0).toFixed(2);
  }

  switchTab('index');
}

function logoutUser() {
  localStorage.removeItem('rr_token');
  state.token = '';
  state.user = null;
  const passIn = document.getElementById('gate-login-password');
  if (passIn) passIn.value = '';
  showAuthGate();
}

// Tab Switching inside Auth Gate
const btnGateTabLogin = document.getElementById('btn-gate-tab-login');
const btnGateTabRegister = document.getElementById('btn-gate-tab-register');
const formGateLogin = document.getElementById('gate-form-login');
const formGateRegister = document.getElementById('gate-form-register');

function setAuthMode(mode) {
  if (mode === 'login') {
    btnGateTabLogin.classList.add('active');
    btnGateTabRegister.classList.remove('active');
    formGateLogin.style.display = 'block';
    formGateRegister.style.display = 'none';
  } else {
    btnGateTabRegister.classList.add('active');
    btnGateTabLogin.classList.remove('active');
    formGateLogin.style.display = 'none';
    formGateRegister.style.display = 'block';
  }
}

btnGateTabLogin.addEventListener('click', () => setAuthMode('login'));
btnGateTabRegister.addEventListener('click', () => setAuthMode('register'));
document.getElementById('link-to-register').addEventListener('click', (e) => {
  e.preventDefault();
  setAuthMode('register');
});
document.getElementById('link-to-login').addEventListener('click', (e) => {
  e.preventDefault();
  setAuthMode('login');
});

// Quick Fill Demo Account
document.getElementById('gate-btn-fill-demo').addEventListener('click', () => {
  document.getElementById('gate-login-username').value = 'demo_user';
  document.getElementById('gate-login-password').value = '123456';
});

// Sign In Form Submit
formGateLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('gate-login-username').value.trim();
  const password = document.getElementById('gate-login-password').value;

  const btn = document.getElementById('gate-login-btn');
  const btnText = document.getElementById('gate-login-btn-text');
  btn.disabled = true;
  btnText.textContent = 'Signing in...';

  const data = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });

  btn.disabled = false;
  btnText.textContent = 'Sign In to Account';

  if (data.success) {
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('rr_token', data.token);
    showAppMain();
  } else {
    alert(data.message || 'Login failed. Please verify credentials.');
  }
});

// Sign Up / Register Form Submit
formGateRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('gate-reg-username').value.trim();
  const password = document.getElementById('gate-reg-password').value;
  const confirmPassword = document.getElementById('gate-reg-confirm-password').value;
  const invite_code = document.getElementById('gate-reg-invite-code').value.trim();
  const withdrawal_pin = document.getElementById('gate-reg-pin').value.trim();

  if (password.length < 6) {
    alert('Password must be at least 6 characters long.');
    return;
  }

  if (password !== confirmPassword) {
    alert('Passwords do not match. Please re-enter.');
    return;
  }

  if (!invite_code) {
    alert('Invitation code is mandatory. Please enter an inviter code or VIP token.');
    return;
  }

  const btn = document.getElementById('gate-reg-btn');
  const btnText = document.getElementById('gate-reg-btn-text');
  btn.disabled = true;
  btnText.textContent = 'Creating account...';

  const data = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, invite_code, withdrawal_pin })
  });

  btn.disabled = false;
  btnText.textContent = 'Create Account & Claim Bonus';

  if (data.success) {
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('rr_token', data.token);
    alert(`Account created successfully!\nStarting balance of ${parseFloat(data.user.balance).toFixed(2)} USDT credited.`);
    showAppMain();
  } else {
    alert(data.message || 'Registration failed.');
  }
});

// Desktop Top Navigation Logout Button
document.getElementById('desktop-btn-logout')?.addEventListener('click', logoutUser);

// -------------------------------------------------------------
// TAB NAVIGATION (Mobile & Desktop)
// -------------------------------------------------------------
function switchTab(tabName) {
  state.currentTab = tabName;

  // Update mobile tabs active state
  document.querySelectorAll('.nav-tab').forEach(tab => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Update desktop nav links active state
  document.querySelectorAll('.desktop-nav-item').forEach(item => {
    if (item.dataset.tab === tabName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Hide all views
  document.querySelectorAll('.app-view').forEach(view => {
    view.style.display = 'none';
  });

  // Show target view
  const targetView = document.getElementById(`view-${tabName}`);
  if (targetView) targetView.style.display = 'block';

  // Update Header Title
  const titles = {
    index: 'Review Robot',
    order: 'Order',
    trade: 'Trade',
    team: 'Team',
    personal: 'Personal',
    recharge: 'Recharge',
    withdraw: 'Withdrawal'
  };
  el.pageTitle.textContent = titles[tabName] || 'Review Robot';

  // Mobile app-header visibility (Index has no header bar in video)
  const appHeader = document.querySelector('.app-header');
  if (appHeader) {
    if (tabName === 'index') {
      appHeader.style.display = 'none';
    } else {
      appHeader.style.display = 'flex';
    }
  }

  // Back button visibility
  if (tabName === 'recharge' || tabName === 'withdraw') {
    el.headerBackBtn.style.visibility = 'visible';
  } else {
    el.headerBackBtn.style.visibility = 'hidden';
  }

  // Load view-specific data
  if (tabName === 'index') loadIndexView();
  if (tabName === 'trade') loadTradeStatus();
  if (tabName === 'team') loadTeamData();
  if (tabName === 'order') loadOrders('all');
  if (tabName === 'recharge') loadRechargeInfo();
  if (tabName === 'personal') loadUserProfile();
  if (tabName === 'withdraw') loadWithdrawalView();
}

// -------------------------------------------------------------
// 0. INDEX / HOME VIEW LOGIC (Exact Match to Reference Video)
// -------------------------------------------------------------
let indexTickerInterval = null;
let hallOfFameInterval = null;

const tickerAnnouncements = [
  '312***158 Recharge 2670USDT',
  '07***250 Successful withdrawal 1494USDT',
  '815***265 Recharge 1720USDT',
  '139***811 Successful withdrawal 1523USDT',
  '019***479 Successful withdrawal 1124USDT',
  '456***542 Successful withdrawal 625USDT',
  '356***453 Successful withdrawal 1849USDT',
  '921***402 Recharge 3200USDT'
];

let tickerIndex = 0;
function startIndexTicker() {
  if (indexTickerInterval) return;
  const tickerEl = document.getElementById('index-news-ticker-text');
  if (!tickerEl) return;

  indexTickerInterval = setInterval(() => {
    tickerIndex = (tickerIndex + 1) % tickerAnnouncements.length;
    tickerEl.style.opacity = '0';
    tickerEl.style.transform = 'translateY(-6px)';
    setTimeout(() => {
      tickerEl.textContent = tickerAnnouncements[tickerIndex];
      tickerEl.style.opacity = '1';
      tickerEl.style.transform = 'translateY(0)';
    }, 250);
  }, 2800);
}

const hallOfFameRecords = [
  { user: '815***265', action: 'Recharge', amount: '1720USDT' },
  { user: '139***811', action: 'Successful withdrawal', amount: '1523USDT' },
  { user: '017***056', action: 'Successful withdrawal', amount: '951USDT' },
  { user: '456***542', action: 'Successful withdrawal', amount: '625USDT' },
  { user: '301***326', action: 'Recharge', amount: '525USDT' },
  { user: '312***158', action: 'Recharge', amount: '2670USDT' },
  { user: '019***479', action: 'Successful withdrawal', amount: '1124USDT' },
  { user: '356***453', action: 'Successful withdrawal', amount: '1849USDT' },
  { user: '921***402', action: 'Recharge', amount: '3200USDT' },
  { user: '084***771', action: 'Successful withdrawal', amount: '2150USDT' },
  { user: '553***109', action: 'Recharge', amount: '800USDT' },
  { user: '612***899', action: 'Successful withdrawal', amount: '1494USDT' }
];

let fameCurrentIndex = 0;
function renderHallOfFame() {
  const container = document.getElementById('hall-of-fame-list');
  if (!container) return;

  const items = [];
  for (let i = 0; i < 5; i++) {
    const item = hallOfFameRecords[(fameCurrentIndex + i) % hallOfFameRecords.length];
    items.push(`
      <div class="fame-row">
        <span class="fame-user">${item.user}</span>
        <span class="fame-action">${item.action}</span>
        <span class="fame-amount">${item.amount}</span>
      </div>
    `);
  }
  container.innerHTML = items.join('');
}

function startHallOfFame() {
  renderHallOfFame();
  if (hallOfFameInterval) return;
  hallOfFameInterval = setInterval(() => {
    fameCurrentIndex = (fameCurrentIndex + 1) % hallOfFameRecords.length;
    renderHallOfFame();
  }, 2400);
}

function loadIndexView() {
  // Update cumulative income
  const cumEl = document.getElementById('index-cumulative-income');
  if (cumEl) {
    if (state.user && state.user.balance !== undefined && parseFloat(state.user.balance) > 0) {
      cumEl.textContent = parseFloat(state.user.balance).toFixed(2);
    } else {
      cumEl.textContent = '546.12';
    }
  }

  startIndexTicker();
  startHallOfFame();
}

// -------------------------------------------------------------
// 1. TRADE LOGIC (Order Matching Engine from Videos)
// -------------------------------------------------------------
async function loadTradeStatus() {
  const data = await api('/trade/status');
  if (data.success) {
    el.userBalanceVal.textContent = parseFloat(data.balance).toFixed(2);
    el.completedTasksVal.textContent = data.completed_tasks;
    el.totalTasksVal.textContent = data.total_task;

    const deskBal = document.getElementById('desktop-header-balance');
    if (deskBal) deskBal.textContent = parseFloat(data.balance).toFixed(2);
    const deskUser = document.getElementById('desktop-header-username');
    if (deskUser && state.user) deskUser.textContent = state.user.username;
  }
}

// "Start Matching" Handler
el.btnStartMatching.addEventListener('click', async () => {
  if (!state.token) {
    showAuthGate();
    return;
  }

  // Set button to Matching ... with spinner
  el.btnStartMatching.disabled = true;
  el.matchingBtnText.innerHTML = '<span class="spinner"></span> Matching ...';

  setTimeout(async () => {
    const data = await api('/trade/start-matching', { method: 'POST' });

    // Reset button
    el.btnStartMatching.disabled = false;
    el.matchingBtnText.textContent = 'Start matching';

    // 1. Unfinished Order Prompt
    if (!data.success && data.code === 'UNFINISHED_ORDER') {
      state.unpreparedOrder = data.order;
      el.modalUnfinishedOrder.classList.add('active');
      return;
    }

    // 2. Task Quota Reached or other error
    if (!data.success) {
      alert(data.message || 'Matching failed');
      return;
    }

    // 3. Lucky Order Triggered (Insufficient Balance Prompt)
    if (data.is_lucky_order && data.insufficient_balance) {
      state.activeLuckyOrder = data;
      el.luckyDiffVal.textContent = data.difference;
      el.luckyReturnVal.textContent = data.order.expected_return;
      el.luckyAmountVal.textContent = data.order.amount;
      el.luckyHourVal.textContent = data.order.transaction_hour;
      el.modalLuckyOrder.classList.add('active');
      return;
    }

    // 4. Normal Matched Order
    if (data.product) {
      state.matchedProduct = data.product;
      el.matchedProductTitle.textContent = data.product.name;
      el.matchedProductImg.src = data.product.image_url;
      el.matchedPriceVal.textContent = data.product.price;
      el.matchedReturnVal.textContent = data.product.expected_return;
      el.matchedAmountVal.textContent = data.product.price;
      el.matchedHourVal.textContent = data.product.transaction_hour;
      el.modalMatchedOrder.classList.add('active');
    }
  }, 1200);
});

// "Start Trading" in Normal Order Dialog
el.btnStartTrading.addEventListener('click', async () => {
  if (!state.matchedProduct) return;

  // Change button text to "in transaction..." with spinner (matches reference video)
  el.btnStartTrading.disabled = true;
  el.btnStartTrading.innerHTML = '<span class="spinner"></span> in transaction...';

  setTimeout(async () => {
    const data = await api('/trade/submit-order', {
      method: 'POST',
      body: JSON.stringify({
        product_id: state.matchedProduct.id,
        product_name: state.matchedProduct.name,
        product_image: state.matchedProduct.image_url,
        amount: state.matchedProduct.price,
        expected_return: state.matchedProduct.expected_return
      })
    });

    // Close matched dialog
    el.modalMatchedOrder.classList.remove('active');
    el.btnStartTrading.disabled = false;
    el.btnStartTrading.textContent = 'Start trading';

    if (data.success) {
      showSuccessToast(() => {
        el.userBalanceVal.textContent = parseFloat(data.new_balance).toFixed(2);
        el.completedTasksVal.textContent = data.completed_tasks;
      });
    } else {
      alert(data.message || 'Transaction could not be completed.');
    }
  }, 1400);
});

// Cancel Trading
el.btnCancelTrading.addEventListener('click', () => {
  el.modalMatchedOrder.classList.remove('active');
});

// Lucky Order Confirm -> Jump to Recharge Page
el.btnLuckyConfirm.addEventListener('click', () => {
  el.modalLuckyOrder.classList.remove('active');
  switchTab('recharge');
});

el.btnLuckyCancel.addEventListener('click', () => {
  el.modalLuckyOrder.classList.remove('active');
});

// Unfinished Order Prompt Handlers
el.btnUnfinishedConfirm.addEventListener('click', () => {
  el.modalUnfinishedOrder.classList.remove('active');
  switchTab('order');
  loadOrders('unprepared');
});

el.btnUnfinishedCancel.addEventListener('click', () => {
  el.modalUnfinishedOrder.classList.remove('active');
});

// -------------------------------------------------------------
// 2. TEAM LOGIC (Video 1)
// -------------------------------------------------------------
async function loadTeamData() {
  const data = await api('/team/info');
  if (data.success) {
    el.teamBalanceVal.textContent = `$${parseFloat(data.balance).toFixed(2)}`;
    el.teamCommissionVal.textContent = `$${parseFloat(data.commission).toFixed(2)}`;
    el.totalPeopleVal.textContent = data.total_people;
    el.myInviteCodeDisplay.textContent = data.invite_code;

    // Render team member table
    if (data.team && data.team.length > 0) {
      el.teamTableBody.innerHTML = data.team.map(m => `
        <tr>
          <td style="font-weight: 500;">${m.username}</td>
          <td>${parseFloat(m.contributions || 0).toFixed(2)}</td>
          <td class="state-col">${m.state}</td>
        </tr>
      `).join('');
    } else {
      el.teamTableBody.innerHTML = `<tr><td colspan="3" style="color: #9ca3af; padding: 24px;">No team members yet</td></tr>`;
    }
  }
}

// "Receive" Commission Button
el.btnReceiveCommission.addEventListener('click', async () => {
  const data = await api('/team/claim-commission', { method: 'POST' });
  if (data.success) {
    showSuccessToast(() => {
      el.teamBalanceVal.textContent = `$${parseFloat(data.new_balance).toFixed(2)}`;
      el.teamCommissionVal.textContent = `$0.00`;
    });
  } else {
    alert(data.message || 'No commission to receive.');
  }
});

// Copy Invite Code
el.btnCopyInvite.addEventListener('click', () => {
  const code = el.myInviteCodeDisplay.textContent;
  if (code && code !== '-') {
    navigator.clipboard.writeText(code);
    alert(`Invitation code ${code} copied to clipboard!`);
  }
});

// -------------------------------------------------------------
// 3. RECHARGE LOGIC (Video 2)
// -------------------------------------------------------------
async function loadRechargeInfo() {
  const data = await api('/recharge/info');
  if (data.success) {
    el.rechargeAddressText.textContent = data.deposit_address;
    if (data.qr_code) {
      el.rechargeQrImg.src = data.qr_code;
    }
    if (data.instruction) {
      document.getElementById('recharge-instruction-text').textContent = data.instruction;
    }
  }
}

// Quick Select Amount Chips
window.setRechargeAmount = function(val) {
  el.depositAmountInput.value = val;
};

// Copy Deposit Address
el.btnCopyAddress.addEventListener('click', () => {
  const addr = el.rechargeAddressText.textContent.trim();
  navigator.clipboard.writeText(addr);
  el.btnCopyAddress.textContent = 'Copied!';
  setTimeout(() => {
    el.btnCopyAddress.textContent = 'Copy';
  }, 1500);
});

// Submit Recharge Voucher
el.btnIRecharged.addEventListener('click', async () => {
  const amount = el.depositAmountInput.value;
  const txid = el.depositTxidInput.value;
  const file = el.depositProofFile.files[0];

  if (!amount || parseFloat(amount) < 20) {
    alert('Please enter a valid deposit amount of at least 20 USDT.');
    return;
  }

  const formData = new FormData();
  formData.append('amount', amount);
  formData.append('txid', txid);
  if (file) formData.append('proof', file);

  const res = await fetch(`${API_BASE}/recharge/submit`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${state.token}` },
    body: formData
  });
  const data = await res.json();

  if (data.success) {
    showSuccessToast(() => {
      alert('Deposit submitted! Once approved by admin, funds will be instantly credited to your balance.');
      el.depositAmountInput.value = '';
      el.depositTxidInput.value = '';
      switchTab('trade');
    });
  } else {
    alert(data.message || 'Failed to submit deposit.');
  }
});

// -------------------------------------------------------------
// 4. ORDER HISTORY & UNPREPARED ORDERS
// -------------------------------------------------------------
async function loadOrders(status = 'all') {
  document.querySelectorAll('.order-subtab').forEach(b => {
    if (b.dataset.sub === status) b.classList.add('active');
    else b.classList.remove('active');
  });

  const data = await api(`/orders?status=${status}`);
  if (data.success) {
    if (!data.orders || data.orders.length === 0) {
      el.ordersListContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 16px; color: #94a3b8; font-size: 14px;">
          No orders found in this category.
        </div>
      `;
      return;
    }

    el.ordersListContainer.innerHTML = data.orders.map(o => `
      <div style="background: #fff; border-radius: 14px; padding: 14px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.04);">
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-bottom: 8px;">
          <span>Order #${o.order_no}</span>
          <span style="font-weight: 600; color: ${o.status === 'completed' ? '#10b981' : (o.status === 'unprepared' ? '#ef4444' : '#6b7280')}">
            ${o.status.toUpperCase()}
          </span>
        </div>
        <div style="display: flex; gap: 12px; margin-bottom: 10px;">
          <img src="${o.product_image || 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=100'}" style="width: 60px; height: 50px; object-fit: cover; border-radius: 6px; background: #f1f5f9;">
          <div style="flex: 1;">
            <div style="font-size: 13px; font-weight: 600; color: #111827; line-height: 1.3;">${o.product_name}</div>
            <div style="font-size: 12px; color: #ea580c; font-weight: 700; margin-top: 4px;">USDT ${parseFloat(o.amount).toFixed(2)}</div>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #4b5563; border-top: 1px dashed #e5e7eb; padding-top: 8px;">
          <span>Expected Return: <strong style="color: #ea580c;">+${parseFloat(o.commission).toFixed(2)} USDT</strong></span>
          <span>${(o.created_at || '').slice(0, 16)}</span>
        </div>
        ${o.status === 'unprepared' ? `
          <button onclick="completeUnpreparedOrder(${o.id})" style="width: 100%; height: 38px; margin-top: 10px; background: #ea6c35; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
            Pay & Complete Order
          </button>
        ` : ''}
      </div>
    `).join('');
  }
}

// Complete Unprepared Order
window.completeUnpreparedOrder = async function(orderId) {
  const data = await api('/trade/complete-unprepared-order', {
    method: 'POST',
    body: JSON.stringify({ order_id: orderId })
  });

  if (data.success) {
    showSuccessToast(() => {
      loadOrders('unprepared');
      loadTradeStatus();
    });
  } else {
    if (data.code === 'INSUFFICIENT_BALANCE') {
      alert(data.message);
      switchTab('recharge');
    } else {
      alert(data.message || 'Failed to complete order.');
    }
  }
};

document.querySelectorAll('.order-subtab').forEach(b => {
  b.addEventListener('click', () => loadOrders(b.dataset.sub));
});

// -------------------------------------------------------------
// 5. PERSONAL / PROFILE & WITHDRAWAL
// -------------------------------------------------------------
async function loadUserProfile() {
  const data = await api('/user/profile');
  if (data.success && data.user) {
    state.user = data.user;
    el.profileUsername.textContent = data.user.username;
    el.profileInviteCode.textContent = data.user.invite_code;
    el.profileBalance.textContent = parseFloat(data.user.balance).toFixed(2);
    el.profileFrozen.textContent = parseFloat(data.user.frozen_balance).toFixed(2);

    const deskBal = document.getElementById('desktop-header-balance');
    if (deskBal) deskBal.textContent = parseFloat(data.user.balance).toFixed(2);
    const deskUser = document.getElementById('desktop-header-username');
    if (deskUser) deskUser.textContent = data.user.username;
  }
}

function loadWithdrawalView() {
  if (state.user) {
    el.withdrawAvailableBal.textContent = `${parseFloat(state.user.balance).toFixed(2)} USDT`;
    if (state.user.trc20_address) {
      el.withdrawAddressInput.value = state.user.trc20_address;
    }
  }
}

el.btnSubmitWithdraw.addEventListener('click', async () => {
  const amount = el.withdrawAmountInput.value;
  const address = el.withdrawAddressInput.value;
  const pin = el.withdrawPinInput.value;

  if (!amount || parseFloat(amount) < 30) {
    alert('Minimum withdrawal amount is 30 USDT.');
    return;
  }
  if (!address) {
    alert('Please enter your TRC-20 destination address.');
    return;
  }

  const data = await api('/withdraw/submit', {
    method: 'POST',
    body: JSON.stringify({
      amount: parseFloat(amount),
      trc20_address: address,
      withdrawal_pin: pin
    })
  });

  if (data.success) {
    showSuccessToast(() => {
      alert(data.message);
      switchTab('personal');
    });
  } else {
    alert(data.message || 'Withdrawal failed.');
  }
});

// Profile Menu Action Buttons
document.getElementById('menu-btn-recharge').addEventListener('click', () => switchTab('recharge'));
document.getElementById('menu-btn-withdraw').addEventListener('click', () => switchTab('withdraw'));
document.getElementById('menu-btn-trc20').addEventListener('click', async () => {
  const newAddr = prompt('Enter your TRC-20 USDT Receiving Wallet Address:', state.user?.trc20_address || '');
  if (newAddr && newAddr.trim()) {
    const data = await api('/user/update-trc20', {
      method: 'POST',
      body: JSON.stringify({ trc20_address: newAddr.trim() })
    });
    if (data.success) {
      alert('TRC-20 address successfully bound to account!');
      loadUserProfile();
    } else {
      alert(data.message || 'Failed to update TRC-20 address.');
    }
  }
});
document.getElementById('menu-btn-support').addEventListener('click', () => {
  window.open(state.publicConfig.customer_service_url || 'https://t.me/review_robot_support', '_blank');
});
document.getElementById('menu-btn-logout').addEventListener('click', logoutUser);

// Header Back Button
el.headerBackBtn.addEventListener('click', () => {
  switchTab('index');
});

// Mobile Header Menu Dots -> Navigate to Personal
document.querySelector('.menu-dots')?.addEventListener('click', () => {
  switchTab('personal');
});

// Bottom Navigation Listeners (Mobile)
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    switchTab(tab.dataset.tab);
  });
});

// Top Navigation Listeners (Desktop)
document.querySelectorAll('.desktop-nav-item').forEach(item => {
  item.addEventListener('click', () => {
    switchTab(item.dataset.tab);
  });
});

// Index Page Action Listeners (Serve, About Us, Help, Partner Carousel)
document.getElementById('btn-service-serve')?.addEventListener('click', () => {
  window.open(state.publicConfig.customer_service_url || 'https://t.me/review_robot_support', '_blank');
});

const modalAbout = document.getElementById('modal-about-us');
document.getElementById('btn-service-about')?.addEventListener('click', () => {
  modalAbout?.classList.add('active');
});
document.getElementById('btn-close-about')?.addEventListener('click', () => {
  modalAbout?.classList.remove('active');
});
document.getElementById('btn-confirm-about')?.addEventListener('click', () => {
  modalAbout?.classList.remove('active');
});

const modalHelp = document.getElementById('modal-help-guide');
document.getElementById('btn-service-help')?.addEventListener('click', () => {
  modalHelp?.classList.add('active');
});
document.getElementById('btn-close-help')?.addEventListener('click', () => {
  modalHelp?.classList.remove('active');
});
document.getElementById('btn-confirm-help')?.addEventListener('click', () => {
  modalHelp?.classList.remove('active');
});

// Partner Carousel Scroll
const partnerViewport = document.getElementById('partner-viewport');
document.getElementById('partner-prev-btn')?.addEventListener('click', () => {
  partnerViewport?.scrollBy({ left: -190, behavior: 'smooth' });
});
document.getElementById('partner-next-btn')?.addEventListener('click', () => {
  partnerViewport?.scrollBy({ left: 190, behavior: 'smooth' });
});

// -------------------------------------------------------------
// APP INITIALIZATION
// -------------------------------------------------------------
async function init() {
  // Check URL query for referral code e.g. ?ref=ROSY88
  const urlParams = new URLSearchParams(window.location.search);
  const refParam = urlParams.get('ref') || urlParams.get('code');
  if (refParam) {
    const inviteIn = document.getElementById('gate-reg-invite-code');
    if (inviteIn) inviteIn.value = refParam.toUpperCase();
    setAuthMode('register');
  }

  // Load public settings
  const config = await api('/system/public-config');
  if (config && config.success) {
    state.publicConfig = config;
  }

  // Verify stored token if present
  if (state.token) {
    const res = await api('/user/profile');
    if (res && res.success && res.user) {
      state.user = res.user;
      showAppMain();
      return;
    } else {
      // Stale or invalid token
      logoutUser();
      return;
    }
  }

  // If no token exists: Show Sign In / Sign Up Gate directly!
  showAuthGate();
}

// Start application
init();
