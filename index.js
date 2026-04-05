// // index.js
// import express from "express";
// import cookieParser from "cookie-parser";
// import dotenv from "dotenv";
// import mustacheExpress from "mustache-express";
// import path from "path";
// import { fileURLToPath } from "url";

// // import authRoutes from "./routes/auth.js"; // (optional - if you already had this)
// import courseRoutes from "./routes/courses.js"; // JSON API
// import sessionRoutes from "./routes/sessions.js"; // JSON API
// import bookingRoutes from "./routes/bookings.js"; // JSON API
// import viewRoutes from "./routes/views.js"; // <-- NEW: SSR pages
// import { attachDemoUser } from "./middlewares/demoUser.js";

// import { initDb } from "./models/_db.js";
// await initDb();

// dotenv.config();

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const app = express();

// // View engine (Mustache)
// app.engine(
//   "mustache",
//   mustacheExpress(path.join(__dirname, "views", "partials"), ".mustache")
// );
// app.set("view engine", "mustache");
// app.set("views", path.join(__dirname, "views"));

// // Body parsing for forms (no body-parser package)
// app.use(express.urlencoded({ extended: false }));
// app.use(express.json());
// app.use(cookieParser());

// // Static assets
// app.use("/static", express.static(path.join(__dirname, "public")));

// // Attach a demo user to req/res.locals so pages can show a logged-in user
// app.use(attachDemoUser);

// // Health
// app.get("/health", (req, res) => res.json({ ok: true }));

// // JSON API routes
// // app.use('/auth', authRoutes);
// app.use("/courses", courseRoutes);
// app.use("/sessions", sessionRoutes);
// app.use("/bookings", bookingRoutes);
// app.use("/views", viewRoutes);

// // 404 & 500
// export const not_found = (req, res) =>
//   res.status(404).type("text/plain").send("404 Not found.");
// export const server_error = (err, req, res, next) => {
//   console.error(err);
//   res.status(500).type("text/plain").send("Internal Server Error.");
// };
// app.use(not_found);
// app.use(server_error);

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => console.log(`Yoga booking running`, `port ${PORT}`));

// index.js
import express from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "passport";
import dotenv from "dotenv";
import mustacheExpress from "mustache-express";
import path from "path";
import { fileURLToPath } from "url";

import "./config/passport.js";
import authRoutes from "./routes/auth.js";
import organiserRoutes from "./routes/organiser.js";
import courseRoutes from "./routes/courses.js";
import sessionRoutes from "./routes/sessions.js";
import bookingRoutes from "./routes/bookings.js";
import viewRoutes from "./routes/views.js";
import { initDb } from "./models/_db.js";
import { attachTestUser } from "./middlewares/testAuth.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// View engine (Mustache)
app.engine(
  "mustache",
  mustacheExpress(path.join(__dirname, "views", "partials"), ".mustache")
);
app.set("view engine", "mustache");
app.set("views", path.join(__dirname, "views"));

// Body parsing
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());

// Session
app.use(
  session({
    secret: process.env.SESSION_SECRET || "wad2-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  })
);

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Keep API integration tests isolated from production auth/session setup.
app.use(attachTestUser);

const matchesPath = (pathname, target) =>
  pathname === target || pathname.startsWith(`${target}/`);

const buildNavState = (pathname) => ({
  isHome: pathname === "/",
  isCourses:
    matchesPath(pathname, "/courses") ||
    matchesPath(pathname, "/sessions") ||
    matchesPath(pathname, "/bookings"),
  isLocations: pathname === "/locations",
  isAbout: pathname === "/organisation",
  isDashboard: matchesPath(pathname, "/organiser"),
  isLogin: pathname === "/auth/login",
  isRegister: pathname === "/auth/register",
});

// Expose authenticated user and role flags to all Mustache templates
app.use((req, res, next) => {
  res.locals.year = new Date().getFullYear();
  res.locals.nav = buildNavState(req.path);
  res.locals.user = req.user || null;
  if (req.user) {
    res.locals.user = {
      ...req.user,
      isOrganiser: req.user.role === 'organiser',
      isInstructor: req.user.role === 'instructor',
      isStudent: req.user.role === 'student',
    };
  }
  next();
});

// Static
app.use("/static", express.static(path.join(__dirname, "public")));

// Health
app.get("/health", (req, res) => res.json({ ok: true }));

// Auth routes
app.use("/auth", authRoutes);
app.use("/organiser", organiserRoutes);

// SSR view routes (HTML pages) — mounted BEFORE the JSON API
// so browser requests to /courses, /courses/:id etc. get HTML
app.use("/", viewRoutes);

// JSON API routes — namespaced under /api so they don't shadow HTML pages
app.use("/api/courses", courseRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/bookings", bookingRoutes);

// Errors
export const not_found = (req, res) =>
  res.status(404).type("text/plain").send("404 Not found.");
export const server_error = (err, req, res, next) => {
  console.error(err);
  res.status(500).type("text/plain").send("Internal Server Error.");
};
app.use(not_found);
app.use(server_error);

// Only start the server outside tests
if (process.env.NODE_ENV !== "test") {
  await initDb();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () =>
    console.log(`Yoga booking running on http://localhost:${PORT}`)
  );
}
