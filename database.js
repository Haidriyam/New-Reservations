const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(dbPath);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      withdrawal_pin TEXT DEFAULT '123456',
      invite_code TEXT UNIQUE NOT NULL,
      invited_by TEXT,
      balance REAL DEFAULT 0.00,
      frozen_balance REAL DEFAULT 0.00,
      team_commission_unclaimed REAL DEFAULT 0.00,
      completed_tasks INTEGER DEFAULT 0,
      max_daily_tasks INTEGER DEFAULT 60,
      max_profit REAL DEFAULT 10.00,
      cycle_profit REAL DEFAULT 0.00,
      vip_level INTEGER DEFAULT 1,
      trc20_address TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image_url TEXT NOT NULL,
      price REAL NOT NULL,
      commission_rate REAL DEFAULT 0.006,
      category TEXT DEFAULT 'Featured Products'
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      product_image TEXT NOT NULL,
      amount REAL NOT NULL,
      commission REAL NOT NULL,
      status TEXT NOT NULL, -- 'completed', 'unprepared', 'cancelled'
      is_lucky_order INTEGER DEFAULT 0,
      difference_amount REAL DEFAULT 0.0,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lucky_order_triggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      trigger_type TEXT DEFAULT 'next', -- 'next' or 'task_number'
      target_task_number INTEGER DEFAULT 0,
      amount REAL NOT NULL,
      expected_return REAL NOT NULL,
      product_name TEXT NOT NULL,
      product_image TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recharges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'TRC20-USDT',
      txid TEXT DEFAULT '',
      proof_image TEXT DEFAULT '',
      status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
      admin_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      processed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      trc20_address TEXT NOT NULL,
      fee REAL DEFAULT 0.0,
      actual_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
      admin_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      processed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'superadmin', -- 'superadmin', 'manager', 'finance'
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_invite_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      bonus_balance REAL DEFAULT 200.00,
      max_uses INTEGER DEFAULT 1, -- 0 for unlimited, 1 for single-use
      used_count INTEGER DEFAULT 0,
      vip_level INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active', -- 'active', 'revoked', 'exhausted'
      created_by TEXT DEFAULT 'admin',
      created_at TEXT NOT NULL
    );
  `);

  // Migration: Ensure role column exists in admins table
  try {
    db.exec("ALTER TABLE admins ADD COLUMN role TEXT DEFAULT 'superadmin';");
  } catch (e) {
    // Column already exists
  }

  // Migration: Ensure max_profit, cycle_profit, tasks_allowed exist in users table
  try {
    db.exec("ALTER TABLE users ADD COLUMN max_profit REAL DEFAULT 10.00;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE users ADD COLUMN cycle_profit REAL DEFAULT 0.00;");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE users ADD COLUMN tasks_allowed INTEGER DEFAULT 1;");
  } catch (e) {}

  // Migration: Ensure lucky_order_triggers has minus_amount
  try {
    db.exec("ALTER TABLE lucky_order_triggers ADD COLUMN minus_amount REAL DEFAULT 0;");
  } catch (e) {}

  // Seed default settings if empty
  const getSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?');
  const insertSetting = db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)');

  const defaults = {
    platform_name: 'Review Robot - xinmingzhi',
    trc20_deposit_address: 'TReaAUXRkicHL95Sangr5Bus3Fje7iq48s',
    min_deposit: '20',
    max_deposit: '100000',
    min_withdraw: '30',
    max_withdraw: '50000',
    default_commission_rate: '0.006',
    default_daily_tasks: '60',
    customer_service_url: 'https://t.me/review_robot_support',
    customer_service_whatsapp: '+1 (555) 789-2026',
    admin_secret_path: '/secret-admin-portal-xyz',
    referral_commission_l1: '0.16',
    referral_commission_l2: '0.08',
    referral_commission_l3: '0.04',
    announcement: 'Welcome to Review Robot platform! Complete daily product reviews to earn high USDT commissions.'
  };

  for (const [k, v] of Object.entries(defaults)) {
    if (!getSetting.get(k)) {
      insertSetting.run(k, v);
    }
  }

  // Seed default admins with RBAC roles
  const salt = bcrypt.genSaltSync(10);
  const now = new Date().toISOString();
  const getAdmin = db.prepare('SELECT id FROM admins WHERE username = ?');
  const insertAdmin = db.prepare('INSERT INTO admins (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)');

  if (!getAdmin.get('admin')) {
    insertAdmin.run('admin', bcrypt.hashSync('Admin@2026!Master', salt), 'superadmin', now);
  }
  if (!getAdmin.get('ops_manager')) {
    insertAdmin.run('ops_manager', bcrypt.hashSync('Manager@2026!Pass', salt), 'manager', now);
  }
  if (!getAdmin.get('finance_lead')) {
    insertAdmin.run('finance_lead', bcrypt.hashSync('Finance@2026!Pass', salt), 'finance', now);
  }

  // Seed rich product catalog including latest products: PS5, iPhone 16 Pro, MacBook, etc.
  const latestProducts = [
    {
      name: 'Sony PlayStation 5 Pro Console 2TB SSD with DualSense Wireless Controller',
      price: 699.99,
      commission_rate: 0.006, // Expected Return: 4.20 USDT
      image_url: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=300&auto=format&fit=crop&q=80',
      category: 'Gaming Consoles'
    },
    {
      name: 'Apple iPhone 16 Pro Max 256GB Desert Titanium (Unlocked)',
      price: 1199.00,
      commission_rate: 0.006, // Expected Return: 7.19 USDT
      image_url: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=300&auto=format&fit=crop&q=80',
      category: 'Smartphones'
    },
    {
      name: 'Apple iPhone 16 128GB Teal with Camera Control and 48MP Fusion Camera',
      price: 799.00,
      commission_rate: 0.006, // Expected Return: 4.79 USDT
      image_url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=300&auto=format&fit=crop&q=80',
      category: 'Smartphones'
    },
    {
      name: 'Samsung Galaxy S24 Ultra 5G AI Smartphone 512GB Titanium Black',
      price: 1299.99,
      commission_rate: 0.006, // Expected Return: 7.80 USDT
      image_url: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=300&auto=format&fit=crop&q=80',
      category: 'Smartphones'
    },
    {
      name: 'Apple MacBook Air 15" M3 Chip 16GB Unified Memory 512GB SSD - Midnight',
      price: 1499.00,
      commission_rate: 0.006, // Expected Return: 8.99 USDT
      image_url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=300&auto=format&fit=crop&q=80',
      category: 'Laptops & Computers'
    },
    {
      name: 'Apple AirPods Max Wireless Over-Ear Headphones (USB-C) - Space Black',
      price: 549.00,
      commission_rate: 0.006, // Expected Return: 3.29 USDT
      image_url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=300&auto=format&fit=crop&q=80',
      category: 'Audio'
    },
    {
      name: 'PlayStation VR2 Headset and PlayStation VR2 Sense Controller Horizon Bundle',
      price: 549.99,
      commission_rate: 0.006, // Expected Return: 3.30 USDT
      image_url: 'https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?w=300&auto=format&fit=crop&q=80',
      category: 'Gaming Consoles'
    },
    {
      name: 'Nintendo Switch - OLED Model with White Joy-Con',
      price: 349.99,
      commission_rate: 0.006, // Expected Return: 2.10 USDT
      image_url: 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=300&auto=format&fit=crop&q=80',
      category: 'Gaming Consoles'
    },
    {
      name: 'Meta Quest 3 128GB Breakthrough Mixed Reality All-In-One Headset',
      price: 499.99,
      commission_rate: 0.006, // Expected Return: 3.00 USDT
      image_url: 'https://images.unsplash.com/photo-1593508512255-86ab42a8e620?w=300&auto=format&fit=crop&q=80',
      category: 'Virtual Reality'
    },
    {
      name: 'ASUS ROG Ally X 7" 120Hz Gaming Handheld 1TB AMD Ryzen Z1 Extreme',
      price: 799.99,
      commission_rate: 0.006, // Expected Return: 4.80 USDT
      image_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=300&auto=format&fit=crop&q=80',
      category: 'Gaming Consoles'
    },
    {
      name: 'Bose QuietComfort Ultra Wireless Noise Cancelling Headphones - Black',
      price: 429.00,
      commission_rate: 0.006, // Expected Return: 2.57 USDT
      image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&auto=format&fit=crop&q=80',
      category: 'Audio'
    },
    {
      name: 'Dyson V15 Detect Cordless Vacuum Cleaner with Laser Fluffy Head',
      price: 749.99,
      commission_rate: 0.006, // Expected Return: 4.50 USDT
      image_url: 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=300&auto=format&fit=crop&q=80',
      category: 'Smart Home'
    },
    {
      name: 'AutoCAD Electrical for Electrical and Automation Engineers',
      price: 199.99,
      commission_rate: 0.006,
      image_url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=300&auto=format&fit=crop&q=80',
      category: 'Software & Design'
    },
    {
      name: 'DVa Cosplay Headset | Officer Dva headset props | Diva cosplay',
      price: 114.00,
      commission_rate: 0.006,
      image_url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=300&auto=format&fit=crop&q=80',
      category: 'Consumer Electronics'
    },
    {
      name: 'SAMSUNG Galaxy Tab A7 Lite 8.7" 32GB WiFi Android Tablet w/ Long Lasting Battery',
      price: 139.00,
      commission_rate: 0.006,
      image_url: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=300&auto=format&fit=crop&q=80',
      category: 'Computers & Tablets'
    },
    {
      name: 'Springer Nature Mathematical And Computer Programming Techniques For Computer Graphics Size 2',
      price: 169.99,
      commission_rate: 0.006,
      image_url: 'https://images.unsplash.com/photo-1532012164546-f432f2e3777a?w=300&auto=format&fit=crop&q=80',
      category: 'Education & Books'
    }
  ];

  const checkProduct = db.prepare('SELECT id FROM products WHERE name = ?');
  const insertProduct = db.prepare('INSERT INTO products (name, price, commission_rate, image_url, category) VALUES (?, ?, ?, ?, ?)');

  for (const p of latestProducts) {
    if (!checkProduct.get(p.name)) {
      insertProduct.run(p.name, p.price, p.commission_rate, p.image_url, p.category);
    }
  }

  // Seed initial Admin Invite Codes / VIP Tokens if empty
  const codeCheck = db.prepare('SELECT COUNT(*) as count FROM admin_invite_codes').get();
  if (codeCheck.count === 0) {
    const insertCode = db.prepare(`
      INSERT INTO admin_invite_codes (code, bonus_balance, max_uses, used_count, vip_level, status, created_by, created_at)
      VALUES (?, ?, ?, 0, ?, 'active', 'admin', ?)
    `);
    const now = new Date().toISOString();
    insertCode.run('VIP2026', 200.00, 0, 1, now); // Unlimited public promo code
    insertCode.run('PRO777', 300.00, 5, 2, now);  // VIP 2 code (5 uses)
    insertCode.run('GOLD888', 500.00, 1, 3, now); // Exclusive single-use VIP 3 token
  }

  // Seed demo user if empty
  const userCheck = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCheck.count === 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('123456', salt);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (username, password_hash, withdrawal_pin, invite_code, invited_by, balance, team_commission_unclaimed, completed_tasks, max_daily_tasks, vip_level, trc20_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('Rosy', hash, '123456', 'ROSY88', null, 500.00, 0.00, 60, 60, 2, 'TRosy8899XXYYZZaab77cc88', now);

    db.prepare(`
      INSERT INTO users (username, password_hash, withdrawal_pin, invite_code, invited_by, balance, team_commission_unclaimed, completed_tasks, max_daily_tasks, vip_level, trc20_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('demo_user', hash, '123456', 'VIP6688', 'ROSY88', 201.08, 14.43, 1, 60, 1, 'TReaAUXRkicHL95Sangr5Bus3Fje7iq48s', now);
  }
}

initDatabase();

module.exports = {
  db,
  initDatabase
};
