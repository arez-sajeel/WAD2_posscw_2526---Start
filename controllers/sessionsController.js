// controllers/sessionsController.js
//
// JSON API controller for the /sessions resource.
// Data access is delegated exclusively to model methods — no Datastore
// calls appear here — establishing a clean Controller layer in the MVC stack.

import { validationResult } from "express-validator";
import { SessionModel } from "../models/sessionModel.js";

export const createSession = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  try {
    const session = await SessionModel.create({
      courseId: req.body.courseId,
      startDateTime: req.body.startDateTime,
      endDateTime: req.body.endDateTime,
      capacity: parseInt(req.body.capacity, 10),
      bookedCount: 0,
    });
    res.status(201).json({ session });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};

export const getSessionsByCourse = async (req, res) => {
  try {
    const sessions = await SessionModel.listByCourse(req.params.courseId);
    res.json({ sessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to retrieve sessions" });
  }
};
