// controllers/bookingController.js
//
// All data access is mediated through bookingService — no model or Datastore
// calls live here. This establishes a clean Controller layer in MVC.
import { validationResult } from 'express-validator';
import {
  bookCourseForUser,
  bookSessionForUser,
  cancelBookingForUser,
} from "../services/bookingService.js";

export const bookCourse = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  try {
    const userId = req.user._id;
    const { courseId } = req.body;
    const booking = await bookCourseForUser(userId, courseId);
    res.status(201).json({ booking });
  } catch (err) {
    console.error(err);
    const status = err.code === 'DUPLICATE_BOOKING' ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
};

export const bookSession = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  try {
    const userId = req.user._id;
    const { sessionId } = req.body;
    const booking = await bookSessionForUser(userId, sessionId);
    res.status(201).json({ booking });
  } catch (err) {
    console.error(err);
    const status = err.code === "DROPIN_NOT_ALLOWED" ? 400
                 : err.code === "DUPLICATE_BOOKING"  ? 409
                 : 500;
    res.status(status).json({ error: err.message });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await cancelBookingForUser(bookingId, req.user._id);
    res.json({ booking });
  } catch (err) {
    console.error(err);
    if (err.code === "NOT_FOUND")
      return res.status(404).json({ error: err.message });
    if (err.code === "FORBIDDEN")
      return res.status(403).json({ error: err.message });
    res.status(500).json({ error: "Failed to cancel booking" });
  }
};
