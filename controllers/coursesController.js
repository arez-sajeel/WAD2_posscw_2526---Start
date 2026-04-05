// controllers/coursesController.js
//
// JSON API controller for the /courses resource.
// Data access is delegated exclusively to model methods and services —
// no Datastore calls appear here — establishing a clean Controller layer.

import { validationResult } from "express-validator";
import { CourseModel } from "../models/courseModel.js";
import { SessionModel } from "../models/sessionModel.js";
import { deleteCourseCascade } from "../services/courseService.js";

export const listCourses = async (req, res) => {
  try {
    const courses = await CourseModel.list();
    res.json({ courses });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to retrieve courses" });
  }
};

export const createCourse = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  try {
    const course = await CourseModel.create({
      title: req.body.title.trim(),
      level: req.body.level,
      type: req.body.type,
      allowDropIn: req.body.allowDropIn ?? false,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      description: req.body.description?.trim() || '',
      instructorId: req.body.instructorId || null,
      sessionIds: [],
      locationId: req.body.locationId || null,
      price: req.body.price != null ? parseFloat(req.body.price) : null,
    });
    res.status(201).json({ course });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};

export const getCourseById = async (req, res) => {
  try {
    const course = await CourseModel.findById(req.params.id);
    if (!course) return res.status(404).json({ error: "Course not found" });
    const sessions = await SessionModel.listByCourse(course._id);
    res.json({ course, sessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to retrieve course" });
  }
};

export const deleteCourse = async (req, res) => {
  try {
    const result = await deleteCourseCascade(req.params.id);
    res.json({
      message: "Course and all associated sessions deleted. Bookings cancelled.",
      ...result,
    });
  } catch (err) {
    console.error(err);
    if (err.code === "NOT_FOUND")
      return res.status(404).json({ error: err.message });
    res.status(500).json({ error: "Failed to delete course" });
  }
};
