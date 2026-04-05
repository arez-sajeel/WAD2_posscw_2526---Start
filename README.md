# WAD2 Yoga & Mindfulness Booking System

## Demo Credentials
*Please use these accounts to test role-based access.*

**Organiser (Admin)**
- Email: `admin@yoga.local`
- Password: `organiser123`

**Standard User (Student)**
- Email: `fiona@student.local`
- Password: `student123`

---

## 60-Second Install

Run the following commands from a terminal to clone, install, and populate the database with demo data:

```bash
git clone <repository-url>
cd WAD2_posscw_2526---Start
npm install
npm run start:seeded
```

* The server will start on `http://localhost:3000`
* **Login page:** `http://localhost:3000/auth/login`

---

## Implemented Features

This application implements a strict **Model-View-Controller (MVC)** architecture using Express, NeDB, and Mustache templates.

### 1. Security & Architecture
- Local authentication with secure session handling.
- Strict Role-Based Access Control (RBAC) protecting backend routes.
- Modular JSON API nested under `/api` for decoupled data fetching.

### 2. Public Access (Unregistered Users)
- **Home & Organisation Info:** View details about the studio and locations.
- **Course Listings:** View current and upcoming courses with their duration, dates, descriptions, locations, and prices.

### 3. Registered Users (Students)
- **Authentication:** Secure registration, login, and logout.
- **Enrolment:** Book attendance for full courses or individual sessions.
- **Confirmation:** View booking confirmation receipts.

### 4. Organiser Access (Admins)
- **Course & Session Management (CRUD):** Create, edit, and safely delete courses and nested sessions.
- **Participant Tracking:** Generate and view detailed class lists with participant names.
- **User Management:** View all registered users, promote or demote roles, or delete accounts.