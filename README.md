# 🚀 Review Robot (xinmingzhi) - Order Matching & Commission Platform

A complete, full-stack order matching, commission review, and VIP task platform accurately reproducing the exact functionality, UI, and workflows seen in the reference videos, with user registration tied to invitation codes, team referral earnings, and a **hidden, fully empowered Admin Control Portal**.

---

## 🌟 Key Highlights & Features

### 1. 📱 Mobile-First Frontend Web Application
- **Exact Visual Reproduction**: Matches the warm terracotta/orange gradient cards, typography, transaction introduction, and counters seen in the videos (`xinmingzhi.com`).
- **5-Tab Responsive Navigation**:
  1. **Trade**:
     - Real-time USDT Account Balance display.
     - "Transaction introduction" explaining daily product feedback reviews.
     - Task counters: `Completed number | Total task` (e.g. `19 | 60`).
     - **Start Matching**: Interactive matching flow with live spinner animations.
     - **Normal Order Popup**: Displays product image, title, price, quantity `x1`, expected return (orange text), amount, and transaction hour timestamp.
     - **Start Trading**: Transitions to animated `in transaction...` state, then displays the exact dark `Successful operation` checkmark toast modal and credits commission to user balance.
     - **Lucky Order Mechanism**: When triggered, pops up:
       ```
       Congratulations on your lucky order
       Insufficient balance, please recharge first
       Difference {diff}USDT
       Whether to recharge
       Cancel | Confirm
       ```
       Clicking **Confirm** redirects directly to the **Recharge** page.
     - **Unfinished Order Guard**: If an unfinished order exists, attempting to match alerts: *"You still have unfinished orders, whether to jump to the unprepared order page"*.
  2. **Team**:
     - Top card displaying `Balance $0.00 | Commission $14.43`.
     - **Receive** button: Claims accumulated team referral commission into main wallet with the `Successful operation` toast.
     - `Total people` count and referral member contribution table (`User | Number of contributions | State: Open up`).
     - Personal invitation code sharing and 1-click clipboard copy.
  3. **Recharge (USDT TRC-20)**:
     - Tether TRC-20 green badge with instructions: *"The deposit address only supports TRC20-USDT, and the minimum deposit amount is 20USDT"*.
     - Dynamic TRC-20 QR code generation.
     - System deposit address with 1-click **Copy** button.
     - Deposit amount input, optional TXID hash, and receipt voucher image upload.
     - **I have recharged** submission button sending requests to the admin queue.
  4. **Order History**:
     - Sub-tabs: `All`, `Unprepared`, and `Completed`.
     - Unprepared tab displays pending Lucky Orders with a **Pay & Complete Order** button once balance is recharged.
  5. **Personal / Profile Center**:
     - UID, username, VIP tier, total USDT balance, and frozen balance.
     - Bind TRC-20 withdrawal wallet address.
     - Apply for USDT withdrawals with security PIN verification.
     - Direct access to Customer Service (Telegram / WhatsApp).
     - Logout and session management.
  6. **Index / Home Dashboard**:
     - Platform announcements, live payout ticker, and VIP level benefit tiers.

---

### 2. 🔐 Registration on the Basis of Invitation Codes
- Users **must** enter a valid invitation code to create an account.
- Automatically connects the new user to their inviter's referral downline.
- Generates a unique 6-character referral code for every newly registered user.
- Supports pre-filling invitation codes via URL query parameter (e.g. `http://localhost:3000/?ref=ROSY88`).

---

### 3. 🛡️ Hidden & Secure Admin Control Portal
- **Hidden Route**: Not linked anywhere in public menus or footers. Default accessible at:
  ```
  http://localhost:3000/secret-admin-portal-xyz
  ```
  *(Route path is also customizable inside System Settings)*.
- **Master Admin Credentials**:
  - **Username**: `admin`
  - **Password**: `Admin@2026!Master`

#### Admin Capabilities & Controls:
1. **Live Dashboard Overview**: Real-time counters for registered users, cumulative platform USDT balances, pending deposit requests, pending withdrawal requests, and completed orders.
2. **User Management**:
   - View full details of every user (UID, balance, frozen balance, tasks completed, invite code, inviter, status).
   - **Direct Balance Adjustment**: Add or subtract USDT to any user balance instantly (`+` / `-`).
   - **Task Counter & Limit Adjustment**: Manually set completed tasks (e.g. reset from 19 to 0 or 59) and max daily task quota (default 60).
   - **Account Freeze / Unfreeze**: Suspend or reactivate user accounts.
3. **✨ Lucky Order Injector (Full Control over Video 2 Flow)**:
   - Target any registered user.
   - Set trigger condition: **Next "Start Matching" click** or **At a specific task number** (e.g. Task #20).
   - Set custom Order Amount (e.g. 315.72 USDT) and Expected Return (e.g. 18.94 USDT).
   - When the target user matches, the system calculates the exact difference from their balance and delivers the Lucky Order popup!
4. **Recharge Approvals**:
   - View pending deposit requests with user, amount, TXID, and uploaded voucher receipt.
   - **Approve & Credit**: Instantly credits USDT to the user's available balance.
   - **Reject**: Marks deposit rejected with audit notes.
5. **Withdrawal Approvals**:
   - View pending withdrawal requests, destination TRC-20 addresses, and amounts.
   - **Approve**: Finalizes payout.
   - **Reject & Refund**: Immediately restores frozen funds back to the user's available balance.
6. **Product Catalog Manager**:
   - Add, edit, or delete items in the review matching product pool (Title, Image URL, Price, Commission Rate).
7. **Global System Settings**:
   - Platform title.
   - System TRC-20 deposit wallet address and QR code update.
   - Minimum deposit and withdrawal thresholds.
   - Customer Service links (Telegram / WhatsApp).
   - Hidden Admin Portal secret route path.

---

## 🛠️ Tech Stack & Architecture

- **Backend**: Node.js & Express
- **Database**: SQLite with native `node:sqlite` (zero compilation, zero native build tools required, instant persistence)
- **Authentication**: JWT (JSON Web Tokens) & `bcryptjs` password hashing
- **File Uploads**: `multer` for deposit payment vouchers
- **QR Code**: `qrcode` library for client TRC-20 wallet deposit QR codes
- **Frontend**: Responsive Mobile-First SPA using HTML5, CSS3, and JavaScript with zero external CDN dependencies.

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
# Or directly:
node server.js
```

The server starts on port `3000`:
- **Main Client Application**: [http://localhost:3000](http://localhost:3000)
- **Hidden Admin Portal**: [http://localhost:3000/secret-admin-portal-xyz](http://localhost:3000/secret-admin-portal-xyz)

---

## 👥 Pre-Configured Demo Accounts

| Role | Username | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `Admin@2026!Master` | Master control over users, balance, lucky orders, deposits |
| **Demo User** | `demo_user` | `123456` | Starts with 201.08 USDT & 1 completed task as seen in video |
| **Inviter** | `Rosy` | `123456` | Invite Code: `ROSY88` (referenced in video 1 team screen) |
