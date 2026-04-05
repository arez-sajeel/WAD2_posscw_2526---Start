// routes/sessions.js
import { Router } from 'express';
import { body } from 'express-validator';
import {
  createSession,
  getSessionsByCourse,
} from '../controllers/sessionsController.js';
import { ensureRole } from '../middlewares/authGuard.js';

const router = Router();

const sessionValidators = [
  body('courseId').trim().notEmpty().withMessage('Course ID is required.').escape(),
  body('startDateTime').notEmpty().withMessage('Start date/time is required.')
    .isISO8601().withMessage('Start date/time must be valid ISO 8601.'),
  body('endDateTime').notEmpty().withMessage('End date/time is required.')
    .isISO8601().withMessage('End date/time must be valid ISO 8601.'),
  body('capacity').isInt({ min: 1 }).withMessage('Capacity must be a positive integer.'),
];

router.post('/', ensureRole('organiser'), sessionValidators, createSession);
router.get('/by-course/:courseId', getSessionsByCourse);

export default router;
