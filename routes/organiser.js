// routes/organiser.js
// Every route in this file is locked behind ensureRole('organiser').
// Any authenticated non-organiser receives a 403; any unauthenticated
// visitor is redirected to /auth/login.
import { Router } from 'express';
import { ensureRole } from '../middlewares/authGuard.js';
import {
  getDashboard,
  getNewCourseForm,
  postCreateCourse,
  getEditCourseForm,
  postUpdateCourse,
  postDeleteCourse,
  courseFormValidators,
  getCourseSessions,
  getNewSessionForm,
  postCreateSession,
  getEditSessionForm,
  postUpdateSession,
  postDeleteSession,
  sessionFormValidators,
  getUsersList,
  postPromoteUser,
  postDemoteUser,
  postDeleteUser,
  getSessionParticipants,
} from '../controllers/organiserController.js';

const router = Router();

// Apply guard to every route in this router
router.use(ensureRole('organiser'));

router.get('/', getDashboard);

router.get('/courses/new', getNewCourseForm);
router.post('/courses', courseFormValidators, postCreateCourse);

router.get('/courses/:id/edit', getEditCourseForm);
router.post('/courses/:id/edit', courseFormValidators, postUpdateCourse);

router.post('/courses/:id/delete', postDeleteCourse);

// Session management
router.get('/courses/:id/sessions', getCourseSessions);
router.get('/courses/:id/sessions/new', getNewSessionForm);
router.post('/courses/:id/sessions', sessionFormValidators, postCreateSession);
router.get('/sessions/:id/edit', getEditSessionForm);
router.post('/sessions/:id/edit', sessionFormValidators, postUpdateSession);
router.post('/sessions/:id/delete', postDeleteSession);

// Session participants (class list)
router.get('/sessions/:id/participants', getSessionParticipants);

// User management
router.get('/users', getUsersList);
router.post('/users/:id/promote', postPromoteUser);
router.post('/users/:id/demote', postDemoteUser);
router.post('/users/:id/delete', postDeleteUser);

export default router;
