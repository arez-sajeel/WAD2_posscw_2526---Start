// routes/bookings.js
import { Router } from 'express';
import { body } from 'express-validator';
import { bookCourse, bookSession, cancelBooking } from '../controllers/bookingController.js';
import { ensureAuthenticated } from '../middlewares/authGuard.js';

const router = Router();

router.post('/course', ensureAuthenticated, [
  body('courseId').trim().notEmpty().withMessage('Course ID is required.').escape(),
], bookCourse);
router.post('/session', ensureAuthenticated, [
  body('sessionId').trim().notEmpty().withMessage('Session ID is required.').escape(),
], bookSession);
router.delete('/:bookingId', ensureAuthenticated, cancelBooking);

export default router;
