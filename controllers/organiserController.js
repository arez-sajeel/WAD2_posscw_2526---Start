// controllers/organiserController.js
//
// SSR controller for organiser-only course management.
// All routes are protected by ensureRole('organiser') at the router level —
// no auth checks are duplicated here.

import { CourseModel } from '../models/courseModel.js';
import { SessionModel } from '../models/sessionModel.js';
import { LocationModel } from '../models/locationModel.js';
import { UserModel } from '../models/userModel.js';
import { BookingModel } from '../models/bookingModel.js';
import { deleteCourseCascade, deleteSessionCascade } from '../services/courseService.js';
import { cancelBookingForUser } from '../services/bookingService.js';
import {
  buildCourseLevelLabel,
  buildCourseTypeLabel,
  compareCoursesByStartDate,
  isCurrentOrUpcomingCourse,
} from '../services/coursePresentationService.js';
import { body, validationResult } from 'express-validator';

const mapFieldErrors = (errors) =>
  errors.reduce((accumulator, error) => {
    if (!accumulator[error.path]) {
      accumulator[error.path] = error.msg;
    }
    return accumulator;
  }, {});

/**
 * Normalises a raw request body (or a course document from the DB) into a
 * view-model safe for passing to course_form.mustache.  Pre-computes boolean
 * flags for every <select> option so Mustache can mark the correct one as
 * `selected` without needing lambdas or nested-object tricks.
 */
function buildFormValues(data) {
  const level = data.level || '';
  const type  = data.type  || '';
  return {
    title:       data.title       || '',
    level,
    type,
    startDate:   data.startDate   || '',
    endDate:     data.endDate     || '',
    description: data.description || '',
    allowDropIn: data.allowDropIn === 'on' || data.allowDropIn === true,
    locationId:  data.locationId  || '',
    price:       data.price != null ? data.price : '',
    // Pre-computed select flags consumed by {{#levelBeginner}}selected{{/levelBeginner}}
    levelBeginner:        level === 'beginner',
    levelIntermediate:    level === 'intermediate',
    levelAdvanced:        level === 'advanced',
    typeWeekendWorkshop:  type  === 'WEEKEND_WORKSHOP',
    typeWeeklyBlock:      type  === 'WEEKLY_BLOCK',
  };
}

const fmtDateOnly = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

// GET /organiser
export const getDashboard = async (req, res, next) => {
  try {
    const courses = await CourseModel.list();
    courses.sort(compareCoursesByStartDate);
    const rows = await Promise.all(
      courses.map(async (c) => {
        const sessions = await SessionModel.listByCourse(c._id);
        const isPubliclyListed = isCurrentOrUpcomingCourse(c);
        return {
          id: c._id,
          title: c.title,
          level: buildCourseLevelLabel(c.level),
          type: buildCourseTypeLabel(c.type),
          startDate: fmtDateOnly(c.startDate),
          endDate: fmtDateOnly(c.endDate),
          sessionsCount: sessions.length,
          listingStatus: isPubliclyListed ? 'Live on courses page' : 'Past course',
          listingStatusClass: isPubliclyListed ? 'status-live' : 'status-archived',
        };
      })
    );
    res.render('organiser_dashboard', { title: 'Organiser Dashboard', courses: rows });
  } catch (err) {
    next(err);
  }
};

// GET /organiser/courses/new
export const getNewCourseForm = async (req, res, next) => {
  try {
    const locations = await LocationModel.list();
    res.render('course_form', {
      title: 'Create New Course',
      isNew: true,
      values: buildFormValues({}),
      fieldErrors: {},
      locations: locations.map(l => ({ id: l._id, name: l.name })),
    });
  } catch (err) {
    next(err);
  }
};

// POST /organiser/courses
export const postCreateCourse = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorList = errors.array();
    const locations = await LocationModel.list();
    return res.status(422).render('course_form', {
      title: 'Create New Course',
      isNew: true,
      errors: { list: errorList.map((error) => error.msg) },
      values: buildFormValues(req.body),
      fieldErrors: mapFieldErrors(errorList),
      locations: locations.map(l => ({ id: l._id, name: l.name, selected: l._id === req.body.locationId })),
    });
  }
  try {
    await CourseModel.create({
      title: req.body.title.trim(),
      level: req.body.level,
      type: req.body.type,
      allowDropIn: req.body.allowDropIn === 'on',
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      description: req.body.description?.trim() || '',
      instructorId: null,
      sessionIds: [],
      locationId: req.body.locationId || null,
      price: req.body.price ? parseFloat(req.body.price) : null,
    });
    res.redirect('/organiser');
  } catch (err) {
    next(err);
  }
};

// GET /organiser/courses/:id/edit
export const getEditCourseForm = async (req, res, next) => {
  try {
    const course = await CourseModel.findById(req.params.id);
    if (!course)
      return res.status(404).render('error', { title: 'Not found', message: 'Course not found.' });
    const locations = await LocationModel.list();
    res.render('course_form', {
      title: `Edit: ${course.title}`,
      isNew: false,
      courseId: course._id,
      values: buildFormValues({ ...course, allowDropIn: course.allowDropIn ? 'on' : '' }),
      fieldErrors: {},
      locations: locations.map(l => ({ id: l._id, name: l.name, selected: l._id === course.locationId })),
    });
  } catch (err) {
    next(err);
  }
};

// POST /organiser/courses/:id/edit
export const postUpdateCourse = async (req, res, next) => {
  // also re-render with locations on validation failure
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorList = errors.array();
    const locations = await LocationModel.list();
    return res.status(422).render('course_form', {
      title: 'Edit Course',
      isNew: false,
      courseId: req.params.id,
      errors: { list: errorList.map((error) => error.msg) },
      values: buildFormValues(req.body),
      fieldErrors: mapFieldErrors(errorList),
      locations: locations.map(l => ({ id: l._id, name: l.name, selected: l._id === req.body.locationId })),
    });
  }
  try {
    const course = await CourseModel.findById(req.params.id);
    if (!course)
      return res.status(404).render('error', { title: 'Not found', message: 'Course not found.' });

    await CourseModel.update(req.params.id, {
      title: req.body.title.trim(),
      level: req.body.level,
      type: req.body.type,
      allowDropIn: req.body.allowDropIn === 'on',
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      description: req.body.description?.trim() || '',
      locationId: req.body.locationId || null,
      price: req.body.price ? parseFloat(req.body.price) : null,
    });
    res.redirect('/organiser');
  } catch (err) {
    next(err);
  }
};

// POST /organiser/courses/:id/delete
export const postDeleteCourse = async (req, res, next) => {
  try {
    await deleteCourseCascade(req.params.id);
    res.redirect('/organiser');
  } catch (err) {
    if (err.code === 'NOT_FOUND')
      return res.status(404).render('error', { title: 'Not found', message: err.message });
    next(err);
  }
};

// Shared validators for create & edit forms
export const courseFormValidators = [
  body('title')
    .trim()
    .notEmpty().withMessage('Course title is required.')
    .isLength({ max: 200 }).withMessage('Title must be under 200 characters.')
    .escape(),
  body('level')
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Level must be beginner, intermediate, or advanced.'),
  body('type')
    .isIn(['WEEKEND_WORKSHOP', 'WEEKLY_BLOCK'])
    .withMessage('Type must be WEEKEND_WORKSHOP or WEEKLY_BLOCK.'),
  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('Description must be under 1000 characters.')
    .escape(),
  body('startDate')
    .notEmpty().withMessage('A valid start date is required.')
    .isISO8601().withMessage('Start date must be a valid date.'),
  body('endDate')
    .notEmpty().withMessage('A valid end date is required.')
    .isISO8601().withMessage('End date must be a valid date.')
    .custom((endDate, { req }) => {
      if (req.body.startDate && new Date(endDate) < new Date(req.body.startDate)) {
        throw new Error('End date must be on or after the start date.');
      }
      return true;
    }),
  body('price')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Price must be a non-negative number.'),
];

// ── Session management ─────────────────────────────────────────────────────

const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

// Convert ISO string to datetime-local input value (YYYY-MM-DDTHH:MM)
const toDatetimeLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function buildSessionFormValues(data) {
  return {
    startDateTime: data.startDateTime ? toDatetimeLocal(data.startDateTime) : (data.startDateTime || ''),
    endDateTime:   data.endDateTime   ? toDatetimeLocal(data.endDateTime)   : (data.endDateTime || ''),
    capacity:      data.capacity != null ? data.capacity : '',
  };
}

// GET /organiser/courses/:id/sessions
export const getCourseSessions = async (req, res, next) => {
  try {
    const course = await CourseModel.findById(req.params.id);
    if (!course)
      return res.status(404).render('error', { title: 'Not found', message: 'Course not found.' });
    const sessions = await SessionModel.listByCourse(course._id);
    const rows = sessions.map((s) => ({
      id: s._id,
      start: fmtDateTime(s.startDateTime),
      end: fmtDateTime(s.endDateTime),
      capacity: s.capacity,
      booked: s.bookedCount ?? 0,
      remaining: Math.max(0, (s.capacity ?? 0) - (s.bookedCount ?? 0)),
    }));
    res.render('organiser_sessions', {
      title: `Sessions: ${course.title}`,
      courseName: course.title,
      courseId: course._id,
      sessions: rows,
    });
  } catch (err) {
    next(err);
  }
};

// GET /organiser/courses/:id/sessions/new
export const getNewSessionForm = async (req, res, next) => {
  try {
    const course = await CourseModel.findById(req.params.id);
    if (!course)
      return res.status(404).render('error', { title: 'Not found', message: 'Course not found.' });
    res.render('session_form', {
      title: 'Add Session',
      isNew: true,
      courseId: course._id,
      courseName: course.title,
      values: buildSessionFormValues({}),
      fieldErrors: {},
    });
  } catch (err) {
    next(err);
  }
};

// POST /organiser/courses/:id/sessions
export const postCreateSession = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorList = errors.array();
    const course = await CourseModel.findById(req.params.id);
    return res.status(422).render('session_form', {
      title: 'Add Session',
      isNew: true,
      courseId: req.params.id,
      courseName: course ? course.title : '',
      errors: { list: errorList.map((e) => e.msg) },
      values: buildSessionFormValues(req.body),
      fieldErrors: mapFieldErrors(errorList),
    });
  }
  try {
    const course = await CourseModel.findById(req.params.id);
    if (!course)
      return res.status(404).render('error', { title: 'Not found', message: 'Course not found.' });

    const session = await SessionModel.create({
      courseId: course._id,
      startDateTime: new Date(req.body.startDateTime).toISOString(),
      endDateTime: new Date(req.body.endDateTime).toISOString(),
      capacity: parseInt(req.body.capacity, 10),
      bookedCount: 0,
    });

    // Add to parent course's sessionIds
    await CourseModel.update(course._id, {
      sessionIds: [...(course.sessionIds || []), session._id],
    });

    res.redirect(`/organiser/courses/${course._id}/sessions`);
  } catch (err) {
    next(err);
  }
};

// GET /organiser/sessions/:id/edit
export const getEditSessionForm = async (req, res, next) => {
  try {
    const session = await SessionModel.findById(req.params.id);
    if (!session)
      return res.status(404).render('error', { title: 'Not found', message: 'Session not found.' });
    const course = await CourseModel.findById(session.courseId);
    res.render('session_form', {
      title: 'Edit Session',
      isNew: false,
      sessionId: session._id,
      courseId: session.courseId,
      courseName: course ? course.title : '',
      values: buildSessionFormValues(session),
      fieldErrors: {},
    });
  } catch (err) {
    next(err);
  }
};

// POST /organiser/sessions/:id/edit
export const postUpdateSession = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorList = errors.array();
    const session = await SessionModel.findById(req.params.id);
    return res.status(422).render('session_form', {
      title: 'Edit Session',
      isNew: false,
      sessionId: req.params.id,
      courseId: session ? session.courseId : '',
      courseName: '',
      errors: { list: errorList.map((e) => e.msg) },
      values: buildSessionFormValues(req.body),
      fieldErrors: mapFieldErrors(errorList),
    });
  }
  try {
    const session = await SessionModel.findById(req.params.id);
    if (!session)
      return res.status(404).render('error', { title: 'Not found', message: 'Session not found.' });

    await SessionModel.update(req.params.id, {
      startDateTime: new Date(req.body.startDateTime).toISOString(),
      endDateTime: new Date(req.body.endDateTime).toISOString(),
      capacity: parseInt(req.body.capacity, 10),
    });

    res.redirect(`/organiser/courses/${session.courseId}/sessions`);
  } catch (err) {
    next(err);
  }
};

// POST /organiser/sessions/:id/delete
export const postDeleteSession = async (req, res, next) => {
  try {
    const session = await SessionModel.findById(req.params.id);
    const courseId = session ? session.courseId : null;
    await deleteSessionCascade(req.params.id);
    res.redirect(courseId ? `/organiser/courses/${courseId}/sessions` : '/organiser');
  } catch (err) {
    if (err.code === 'NOT_FOUND')
      return res.status(404).render('error', { title: 'Not found', message: err.message });
    next(err);
  }
};

export const sessionFormValidators = [
  body('startDateTime')
    .notEmpty().withMessage('Start date/time is required.')
    .isISO8601().withMessage('Start date/time must be a valid date.'),
  body('endDateTime')
    .notEmpty().withMessage('End date/time is required.')
    .isISO8601().withMessage('End date/time must be a valid date.')
    .custom((endDateTime, { req }) => {
      if (req.body.startDateTime && new Date(endDateTime) <= new Date(req.body.startDateTime)) {
        throw new Error('End date/time must be after the start date/time.');
      }
      return true;
    }),
  body('capacity')
    .isInt({ min: 1 }).withMessage('Capacity must be a positive integer.'),
];

// ── User / admin management ────────────────────────────────────────────────

// GET /organiser/users
export const getUsersList = async (req, res, next) => {
  try {
    const users = await UserModel.list();
    const rows = users.map((u) => ({
      id: u._id,
      name: u.name || u.email,
      email: u.email,
      role: u.role || 'student',
      canPromote: (u.role || 'student') !== 'organiser',
      canDemote:  (u.role || 'student') === 'organiser' && u._id !== req.user._id,
      canRemove:  u._id !== req.user._id,
    }));
    res.render('users_list', { title: 'Manage Users', users: rows });
  } catch (err) {
    next(err);
  }
};

// POST /organiser/users/:id/promote
export const postPromoteUser = async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user)
      return res.status(404).render('error', { title: 'Not found', message: 'User not found.' });
    await UserModel.update(req.params.id, { role: 'organiser' });
    res.redirect('/organiser/users');
  } catch (err) {
    next(err);
  }
};

// POST /organiser/users/:id/demote
export const postDemoteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id)
      return res.status(400).render('error', { title: 'Error', message: 'You cannot demote yourself.' });
    const user = await UserModel.findById(req.params.id);
    if (!user)
      return res.status(404).render('error', { title: 'Not found', message: 'User not found.' });
    await UserModel.update(req.params.id, { role: 'student' });
    res.redirect('/organiser/users');
  } catch (err) {
    next(err);
  }
};

// POST /organiser/users/:id/delete
export const postDeleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id)
      return res.status(400).render('error', { title: 'Error', message: 'You cannot remove yourself.' });
    const user = await UserModel.findById(req.params.id);
    if (!user)
      return res.status(404).render('error', { title: 'Not found', message: 'User not found.' });
    // Cancel active bookings for this user, restoring session capacity
    const bookings = await BookingModel.list({ userId: user._id, status: 'CONFIRMED' });
    for (const b of bookings) {
      await cancelBookingForUser(b._id, null);
    }
    await UserModel.removeById(user._id);
    res.redirect('/organiser/users');
  } catch (err) {
    next(err);
  }
};

// ── Session participants (class list) ──────────────────────────────────────

// GET /organiser/sessions/:id/participants
export const getSessionParticipants = async (req, res, next) => {
  try {
    const session = await SessionModel.findById(req.params.id);
    if (!session)
      return res.status(404).render('error', { title: 'Not found', message: 'Session not found.' });
    const course = await CourseModel.findById(session.courseId);
    const bookings = await BookingModel.list({ sessionIds: session._id, status: 'CONFIRMED' });
    const participants = await Promise.all(
      bookings.map(async (b, i) => {
        const user = await UserModel.findById(b.userId);
        return {
          index: i + 1,
          name: user ? (user.name || user.email) : 'Unknown',
          email: user ? user.email : '',
        };
      })
    );
    res.render('session_participants', {
      title: `Participants: ${course ? course.title : 'Session'}`,
      courseId: session.courseId,
      sessionStart: fmtDateTime(session.startDateTime),
      sessionEnd: fmtDateTime(session.endDateTime),
      capacity: session.capacity,
      booked: session.bookedCount ?? bookings.length,
      participants,
    });
  } catch (err) {
    next(err);
  }
};
