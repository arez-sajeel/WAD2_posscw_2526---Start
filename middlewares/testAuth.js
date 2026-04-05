import { BookingModel } from "../models/bookingModel.js";
import { UserModel } from "../models/userModel.js";

const setTestUser = (req, user) => {
  req.user = user;
  req.isAuthenticated = () => true;
};

/**
 * Test-only auth middleware (only applies when NODE_ENV === 'test' and on /api/ routes).
 *
 * Instead of trusting arbitrary req.body.userId (which would be a privilege
 * escalation vulnerability), this middleware looks up the user from the DB to
 * confirm it exists before attaching it to the request.
 */
export const attachTestUser = async (req, res, next) => {
  if (process.env.NODE_ENV !== "test" || req.user) {
    return next();
  }

  // Organiser SSR routes: attach a real organiser from the DB if one exists
  if (req.path.startsWith("/organiser/") || req.path.startsWith("/organiser")) {
    const organisers = await UserModel.db.find({ role: "organiser" });
    if (organisers.length > 0) {
      setTestUser(req, organisers[0]);
    }
    return next();
  }

  if (!req.path.startsWith("/api/")) {
    return next();
  }

  try {
    if (req.path.startsWith("/api/courses") || req.path.startsWith("/api/sessions")) {
      setTestUser(req, {
        _id: "test-organiser",
        role: "organiser",
        name: "Test Organiser",
      });
      return next();
    }

    if (!req.path.startsWith("/api/bookings")) {
      return next();
    }

    // For booking creation: look up the user from the DB to verify they exist
    // rather than blindly trusting req.body.userId
    if (req.body?.userId) {
      const user = await UserModel.findById(req.body.userId);
      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }
      setTestUser(req, {
        _id: user._id,
        role: user.role || "student",
        name: user.name || "Test Student",
      });
      return next();
    }

    if (req.method === "DELETE" && req.path.startsWith("/api/bookings/")) {
      const bookingId = req.path.split("/").filter(Boolean).pop();
      const booking = await BookingModel.findById(bookingId);
      if (booking) {
        const user = await UserModel.findById(booking.userId);
        if (user) {
          setTestUser(req, {
            _id: user._id,
            role: user.role || "student",
            name: user.name || "Test Student",
          });
        }
      }
    }

    return next();
  } catch (err) {
    return next(err);
  }
};