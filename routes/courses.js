// routes/courses.js
import { Router } from "express";
import { body } from "express-validator";
import {
  listCourses,
  createCourse,
  getCourseById,
  deleteCourse,
} from "../controllers/coursesController.js";
import { ensureRole } from "../middlewares/authGuard.js";

const router = Router();

const courseValidators = [
  body('title').trim().notEmpty().withMessage('Title is required.')
    .isLength({ max: 200 }).withMessage('Title must be under 200 characters.').escape(),
  body('level').isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Level must be beginner, intermediate, or advanced.'),
  body('type').isIn(['WEEKEND_WORKSHOP', 'WEEKLY_BLOCK'])
    .withMessage('Type must be WEEKEND_WORKSHOP or WEEKLY_BLOCK.'),
  body('description').optional({ checkFalsy: true }).trim()
    .isLength({ max: 1000 }).withMessage('Description must be under 1000 characters.').escape(),
  body('startDate').notEmpty().withMessage('Start date is required.')
    .isISO8601().withMessage('Start date must be a valid date.'),
  body('endDate').notEmpty().withMessage('End date is required.')
    .isISO8601().withMessage('End date must be a valid date.'),
];

router.get("/", listCourses);
router.post("/", ensureRole('organiser'), courseValidators, createCourse);
router.get("/:id", getCourseById);
router.delete("/:id", ensureRole('organiser'), deleteCourse);

export default router;
