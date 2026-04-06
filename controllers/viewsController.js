// controllers/viewsController.js
import { CourseModel } from "../models/courseModel.js";
import { SessionModel } from "../models/sessionModel.js";
import { LocationModel } from "../models/locationModel.js";
import {
  bookCourseForUser,
  bookSessionForUser,
  cancelBookingForUser,
} from "../services/bookingService.js";
import { BookingModel } from "../models/bookingModel.js";
import { validationResult } from "express-validator";
import {
  buildBookingStatusMeta,
  buildCourseBookingSummary,
  buildSessionBookingSummary,
  createUserBookingIndex,
  isActiveBooking,
  listActiveBookingsForUser,
} from "../services/bookingStateService.js";
import {
  buildCourseLevelLabel,
  buildCourseDurationLabel,
  buildCourseTimeLabel,
  buildCourseTypeLabel,
  compareCoursesByStartDate,
  isCurrentOrUpcomingCourse,
} from "../services/coursePresentationService.js";

const mapFieldErrors = (errors) =>
  errors.reduce((accumulator, error) => {
    if (!accumulator[error.path]) {
      accumulator[error.path] = error.msg;
    }
    return accumulator;
  }, {});

const fmtDate = (iso) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const fmtDateOnly = (iso) =>
  new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const buildCourseBookingValues = (req, fallbackUser = {}) => ({
  name: req.body?.name ?? fallbackUser.name ?? "",
  email: req.body?.email ?? fallbackUser.email ?? "",
  notes: req.body?.notes ?? "",
  consent: req.body?.consent === "on",
});

const buildCourseBookingViewModel = async (req, courseId, overrides = {}) => {
  const course = await CourseModel.findById(courseId);
  if (!course) {
    return null;
  }

  const sessions = await SessionModel.listByCourse(courseId);
  const sessionRows = sessions.map((session) => ({
    start: fmtDate(session.startDateTime),
    remaining: Math.max(0, (session.capacity ?? 0) - (session.bookedCount ?? 0)),
  }));

  return {
    title: `Book: ${course.title}`,
    course: {
      id: course._id,
      title: course.title,
      level: buildCourseLevelLabel(course.level),
      type: buildCourseTypeLabel(course.type),
      allowDropIn: course.allowDropIn,
      startDate: course.startDate ? fmtDateOnly(course.startDate) : "",
      endDate: course.endDate ? fmtDateOnly(course.endDate) : "",
      description: course.description,
    },
    sessions: sessionRows,
    sessionsCount: sessionRows.length,
    values: buildCourseBookingValues(req, req.user || {}),
    fieldErrors: {},
    ...overrides,
  };
};

const buildBookingConfirmationViewModel = (booking, course = null) => {
  const status = booking.status ?? "";
  const type = booking.type ?? "";
  const statusMeta = buildBookingStatusMeta(status, {
    confirmed: "Confirmed",
    waitlisted: "Waitlisted",
    cancelled: "Cancelled",
  });

  const typeLabel = type === "SESSION" ? "Single session" : "Full course";

  const eyebrow =
    status === "CONFIRMED"
      ? "Booking confirmed"
      : status === "WAITLISTED"
      ? "Waitlist update"
      : "Booking update";

  const message =
    status === "CONFIRMED"
      ? type === "SESSION"
        ? "Your session place is secured and ready for you."
        : "Your place on this course has been reserved across the scheduled sessions."
      : status === "WAITLISTED"
      ? type === "SESSION"
        ? "You have been added to the waitlist for this session."
        : "You have been added to the waitlist for this course."
      : "This booking is no longer active.";

  const nextStep =
    status === "CONFIRMED"
      ? "Keep this reference handy if you need to contact the studio about your booking."
      : status === "WAITLISTED"
      ? "Keep this reference in case the studio confirms a place for you."
      : "If you still want to attend, return to the courses page to make another booking.";

  return {
    id: booking._id,
    courseId: booking.courseId ?? "",
    courseTitle: course?.title ?? "",
    hasCourse: !!course,
    courseHref: course ? `/courses/${course._id}` : "/courses",
    type,
    typeLabel,
    status,
    statusLabel: statusMeta.label,
    statusClass: statusMeta.className,
    eyebrow,
    message,
    nextStep,
    canCancel: isActiveBooking(booking),
    createdAt: booking.createdAt ? fmtDate(booking.createdAt) : "Unavailable",
  };
};

export const homePage = async (req, res, next) => {
  try {
    const activeBookings = await listActiveBookingsForUser(req.user?._id);
    const bookingIndex = createUserBookingIndex(activeBookings);
    const courses = (await CourseModel.list())
      .filter((course) => isCurrentOrUpcomingCourse(course))
      .sort(compareCoursesByStartDate)
      .slice(0, 4);
    const allLocations = await LocationModel.list();
    const locMap = Object.fromEntries(allLocations.map(l => [l._id, l.name]));
    const cards = await Promise.all(
      courses.map(async (c) => {
        const sessions = await SessionModel.listByCourse(c._id);
        const nextSession = sessions[0];
        return {
          id: c._id,
          title: c.title,
          level: buildCourseLevelLabel(c.level),
          type: buildCourseTypeLabel(c.type),
          allowDropIn: c.allowDropIn,
          duration: buildCourseDurationLabel(c, sessions),
          startDate: c.startDate ? fmtDateOnly(c.startDate) : "",
          endDate: c.endDate ? fmtDateOnly(c.endDate) : "",
          time: buildCourseTimeLabel(nextSession),
          nextSession: nextSession ? fmtDate(nextSession.startDateTime) : "TBA",
          sessionsCount: sessions.length,
          description: c.description,
          locationName: c.locationId ? locMap[c.locationId] || '' : '',
          price: c.price != null ? c.price : null,
          hasPrice: c.price != null,
          booking: buildCourseBookingSummary(bookingIndex, c._id),
        };
      })
    );

    const bookedCourses = cards.filter((card) => card.booking);
    const featuredCourses =
      bookedCourses.length > 0
        ? cards.filter((card) => !card.booking)
        : cards;

    res.render("home", {
      title: "Yoga Courses",
      bookedCourses,
      hasBookedCourses: bookedCourses.length > 0,
      featuredCourses,
      hasFeaturedCourses: featuredCourses.length > 0,
    });
  } catch (err) {
    next(err);
  }
};

export const courseDetailPage = async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const course = await CourseModel.findById(courseId);
    if (!course)
      return res
        .status(404)
        .render("error", { title: "Not found", message: "Course not found" });

    const location = course.locationId ? await LocationModel.findById(course.locationId) : null;
    const sessions = await SessionModel.listByCourse(courseId);
    const activeBookings = await listActiveBookingsForUser(req.user?._id);
    const bookingIndex = createUserBookingIndex(activeBookings);
    const courseBooking = buildCourseBookingSummary(bookingIndex, courseId);
    const rows = sessions.map((s) => {
      const remaining = Math.max(0, (s.capacity ?? 0) - (s.bookedCount ?? 0));
      const booking = buildSessionBookingSummary(bookingIndex, courseId, s._id);
      return {
        id: s._id,
        start: fmtDate(s.startDateTime),
        end: fmtDate(s.endDateTime),
        capacity: s.capacity,
        booked: s.bookedCount ?? 0,
        remaining,
        canBook: course.allowDropIn && remaining > 0 && !booking,
        booking,
      };
    });

    res.render("course", {
      title: course.title,
      course: {
        id: course._id,
        title: course.title,
        level: buildCourseLevelLabel(course.level),
        type: buildCourseTypeLabel(course.type),
        allowDropIn: course.allowDropIn,
        startDate: course.startDate ? fmtDateOnly(course.startDate) : "",
        endDate: course.endDate ? fmtDateOnly(course.endDate) : "",
        description: course.description,
        locationName: location ? location.name : '',
        hasLocation: !!location,
        price: course.price != null ? course.price : null,
        hasPrice: course.price != null,
        booking: courseBooking,
      },
      sessions: rows,
    });
  } catch (err) {
    next(err);
  }
};

export const courseBookingPage = async (req, res, next) => {
  try {
    const activeBookings = await listActiveBookingsForUser(req.user?._id);
    const bookingIndex = createUserBookingIndex(activeBookings);
    const existingBooking = buildCourseBookingSummary(bookingIndex, req.params.id);

    if (existingBooking?.bookingId) {
      return res.redirect(existingBooking.manageHref);
    }

    if (existingBooking) {
      return res.redirect(`/courses/${req.params.id}`);
    }

    const viewModel = await buildCourseBookingViewModel(req, req.params.id);
    if (!viewModel) {
      return res
        .status(404)
        .render("error", { title: "Not found", message: "Course not found" });
    }

    res.render("course_book", viewModel);
  } catch (err) {
    next(err);
  }
};

export const sessionBookingPage = async (req, res, next) => {
  try {
    const session = await SessionModel.findById(req.params.id);
    if (!session) {
      return res
        .status(404)
        .render("error", { title: "Not found", message: "Session not found" });
    }

    const course = await CourseModel.findById(session.courseId);
    if (!course) {
      return res
        .status(404)
        .render("error", { title: "Not found", message: "Course not found" });
    }

    const activeBookings = await listActiveBookingsForUser(req.user?._id);
    const bookingIndex = createUserBookingIndex(activeBookings);
    const existingBooking = buildSessionBookingSummary(
      bookingIndex,
      course._id,
      session._id
    );

    if (existingBooking?.bookingId) {
      return res.redirect(existingBooking.manageHref);
    }

    res.render("session_book", {
      title: "Book Session",
      course: {
        id: course._id,
        title: course.title,
      },
      session: {
        id: session._id,
        start: fmtDate(session.startDateTime),
        end: fmtDate(session.endDateTime),
        capacity: session.capacity,
        remaining: Math.max(0, (session.capacity ?? 0) - (session.bookedCount ?? 0)),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const postBookCourse = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorList = errors.array();
      const viewModel = await buildCourseBookingViewModel(req, req.params.id, {
        errors: { list: errorList.map((error) => error.msg) },
        fieldErrors: mapFieldErrors(errorList),
      });

      if (!viewModel) {
        return res
          .status(404)
          .render("error", { title: "Not found", message: "Course not found" });
      }

      return res.status(422).render("course_book", viewModel);
    }

    const courseId = req.params.id;
    const booking = await bookCourseForUser(req.user._id, courseId);
    res.redirect(`/bookings/${booking._id}?status=${booking.status}`);
  } catch (err) {
    try {
      const viewModel = await buildCourseBookingViewModel(req, req.params.id, {
        errors: { list: [err.message] },
        fieldErrors: {},
      });

      if (viewModel) {
        return res.status(400).render("course_book", viewModel);
      }
    } catch (viewError) {
      return next(viewError);
    }

    res.status(400).render("error", { title: "Booking failed", message: err.message });
  }
};

export const postBookSession = async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const booking = await bookSessionForUser(req.user._id, sessionId);
    res.redirect(`/bookings/${booking._id}?status=${booking.status}`);
  } catch (err) {
    const message =
      err.code === "DROPIN_NOT_ALLOWED"
        ? "Drop-ins are not allowed for this course."
        : err.code === "DUPLICATE_BOOKING"
        ? "You already have an active booking for this session."
        : err.message;
    res.status(400).render("error", { title: "Booking failed", message });
  }
};

export const postCancelBookingPage = async (req, res, next) => {
  try {
    const booking = await cancelBookingForUser(req.params.bookingId, req.user._id);
    res.redirect(`/bookings/${booking._id}`);
  } catch (err) {
    if (err.code === "NOT_FOUND") {
      return res
        .status(404)
        .render("error", { title: "Not found", message: err.message });
    }

    if (err.code === "FORBIDDEN") {
      return res
        .status(403)
        .render("error", { title: "Forbidden", message: err.message });
    }

    next(err);
  }
};

export const bookingConfirmationPage = async (req, res, next) => {
  try {
    const bookingId = req.params.bookingId;
    const booking = await BookingModel.findById(bookingId);
    if (!booking)
      return res
        .status(404)
        .render("error", { title: "Not found", message: "Booking not found" });

    const isBookingOwner = booking.userId === req.user._id;
    const canViewBooking = isBookingOwner || req.user.role === "organiser";
    if (!canViewBooking) {
      return res.status(403).render("error", {
        title: "Forbidden",
        message: "You do not have permission to view this booking.",
      });
    }

    const course = booking.courseId ? await CourseModel.findById(booking.courseId) : null;

    res.render("booking_confirmation", {
      title: "Booking confirmation",
      booking: buildBookingConfirmationViewModel(booking, course),
    });
  } catch (err) {
    next(err);
  }
};

export const organisationPage = (req, res) => {
  res.render("organisation", { title: "Our Organisation" });
};

export const locationsPage = async (req, res, next) => {
  try {
    const locations = await LocationModel.list();
    res.render("locations", { title: "Our Locations", locations });
  } catch (err) {
    next(err);
  }
};
