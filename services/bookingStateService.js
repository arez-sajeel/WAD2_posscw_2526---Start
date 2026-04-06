import { BookingModel } from "../models/bookingModel.js";

const ACTIVE_BOOKING_STATUSES = new Set(["CONFIRMED", "WAITLISTED"]);

const getBookingPriority = (booking) => {
  let priority = 0;

  if (booking?.type === "COURSE") {
    priority += 10;
  }

  if (booking?.status === "CONFIRMED") {
    priority += 5;
  }

  return priority;
};

const preferBooking = (currentBooking, nextBooking) => {
  if (!currentBooking) {
    return nextBooking;
  }

  return getBookingPriority(nextBooking) > getBookingPriority(currentBooking)
    ? nextBooking
    : currentBooking;
};

export const isActiveBookingStatus = (status) => ACTIVE_BOOKING_STATUSES.has(status);

export const isActiveBooking = (booking) => isActiveBookingStatus(booking?.status);

export const listActiveBookingsForUser = async (userId) => {
  if (!userId) {
    return [];
  }

  const bookings = await BookingModel.listByUser(userId);
  return bookings.filter((booking) => isActiveBooking(booking));
};

export const createUserBookingIndex = (bookings) => {
  const courseBookingsByCourseId = new Map();
  const firstSessionBookingsByCourseId = new Map();
  const sessionBookingCountsByCourseId = new Map();
  const sessionBookingsBySessionId = new Map();

  for (const booking of bookings) {
    if (!isActiveBooking(booking)) {
      continue;
    }

    if (booking.type === "COURSE" && booking.courseId) {
      const currentCourseBooking = courseBookingsByCourseId.get(booking.courseId);
      courseBookingsByCourseId.set(
        booking.courseId,
        preferBooking(currentCourseBooking, booking)
      );
    }

    if (booking.type === "SESSION" && booking.courseId) {
      const currentCount = sessionBookingCountsByCourseId.get(booking.courseId) ?? 0;
      sessionBookingCountsByCourseId.set(booking.courseId, currentCount + 1);

      const currentFirstSessionBooking = firstSessionBookingsByCourseId.get(booking.courseId);
      firstSessionBookingsByCourseId.set(
        booking.courseId,
        preferBooking(currentFirstSessionBooking, booking)
      );
    }

    for (const sessionId of booking.sessionIds ?? []) {
      const currentSessionBooking = sessionBookingsBySessionId.get(sessionId);
      sessionBookingsBySessionId.set(
        sessionId,
        preferBooking(currentSessionBooking, booking)
      );
    }
  }

  return {
    courseBookingsByCourseId,
    firstSessionBookingsByCourseId,
    sessionBookingCountsByCourseId,
    sessionBookingsBySessionId,
  };
};

export const buildBookingStatusMeta = (
  status,
  { confirmed = "Booked", waitlisted = "Waitlisted", cancelled = "Cancelled" } = {}
) => {
  if (status === "WAITLISTED") {
    return {
      label: waitlisted,
      className: "booking-status booking-status--waitlisted",
    };
  }

  if (status === "CANCELLED") {
    return {
      label: cancelled,
      className: "booking-status booking-status--cancelled",
    };
  }

  return {
    label: confirmed,
    className: "booking-status booking-status--confirmed",
  };
};

export const buildCourseBookingSummary = (bookingIndex, courseId) => {
  if (!bookingIndex) {
    return null;
  }

  const courseBooking = bookingIndex.courseBookingsByCourseId.get(courseId);
  if (courseBooking) {
    const statusMeta = buildBookingStatusMeta(courseBooking.status, {
      confirmed: "Course booked",
      waitlisted: "Course waitlisted",
    });

    return {
      bookingId: courseBooking._id,
      manageHref: `/bookings/${courseBooking._id}`,
      status: courseBooking.status,
      statusLabel: statusMeta.label,
      statusClass: statusMeta.className,
      message:
        courseBooking.status === "WAITLISTED"
          ? "You already have a waitlisted booking for this course."
          : "You already have an active booking for this course.",
      canCancel: true,
      isCourseBooking: true,
    };
  }

  const sessionBookingCount = bookingIndex.sessionBookingCountsByCourseId.get(courseId) ?? 0;
  if (sessionBookingCount === 0) {
    return null;
  }

  const representativeBooking = bookingIndex.firstSessionBookingsByCourseId.get(courseId);
  const statusMeta = buildBookingStatusMeta(representativeBooking?.status, {
    confirmed:
      sessionBookingCount === 1
        ? "1 session booked"
        : `${sessionBookingCount} sessions booked`,
    waitlisted:
      sessionBookingCount === 1
        ? "1 session waitlisted"
        : `${sessionBookingCount} sessions waitlisted`,
  });

  return {
    bookingId: sessionBookingCount === 1 ? representativeBooking?._id ?? "" : "",
    manageHref:
      sessionBookingCount === 1 && representativeBooking?._id
        ? `/bookings/${representativeBooking._id}`
        : `/courses/${courseId}`,
    status: representativeBooking?.status ?? "CONFIRMED",
    statusLabel: statusMeta.label,
    statusClass: statusMeta.className,
    message:
      sessionBookingCount === 1
        ? "You already have a session booking on this course."
        : `You already have ${sessionBookingCount} active session bookings on this course.`,
    canCancel: sessionBookingCount === 1,
    isCourseBooking: false,
    sessionBookingCount,
  };
};

export const buildSessionBookingSummary = (bookingIndex, courseId, sessionId) => {
  if (!bookingIndex) {
    return null;
  }

  const courseBooking = bookingIndex.courseBookingsByCourseId.get(courseId);
  if (courseBooking) {
    const statusMeta = buildBookingStatusMeta(courseBooking.status, {
      confirmed: "Included via course",
      waitlisted: "Course waitlist",
    });

    return {
      bookingId: courseBooking._id,
      manageHref: `/bookings/${courseBooking._id}`,
      status: courseBooking.status,
      statusLabel: statusMeta.label,
      statusClass: statusMeta.className,
      message:
        courseBooking.status === "WAITLISTED"
          ? "This session is covered by your waitlisted course booking."
          : "This session is already included in your course booking.",
      canCancel: true,
      isCourseBooking: true,
    };
  }

  const sessionBooking = bookingIndex.sessionBookingsBySessionId.get(sessionId);
  if (!sessionBooking) {
    return null;
  }

  const statusMeta = buildBookingStatusMeta(sessionBooking.status, {
    confirmed: "Booked",
    waitlisted: "Waitlisted",
  });

  return {
    bookingId: sessionBooking._id,
    manageHref: `/bookings/${sessionBooking._id}`,
    status: sessionBooking.status,
    statusLabel: statusMeta.label,
    statusClass: statusMeta.className,
    message:
      sessionBooking.status === "WAITLISTED"
        ? "You are already on the waitlist for this session."
        : "You already have a booking for this session.",
    canCancel: true,
    isCourseBooking: false,
  };
};