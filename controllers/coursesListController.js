// controllers/coursesListController.js
import { CourseModel } from "../models/courseModel.js";
import { SessionModel } from "../models/sessionModel.js";
import { LocationModel } from "../models/locationModel.js";
import {
  buildCourseBookingSummary,
  createUserBookingIndex,
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

const fmtDateOnly = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "TBA";

export const coursesListPage = async (req, res, next) => {
  try {
    const activeBookings = await listActiveBookingsForUser(req.user?._id);
    const bookingIndex = createUserBookingIndex(activeBookings);

    // Query params for filters/pagination
    const {
      level, // beginner | intermediate | advanced
      type, // WEEKLY_BLOCK | WEEKEND_WORKSHOP
      dropin, // yes | no
      q, // text search in title/description (basic contains)
      page = "1", // 1-based
      pageSize = "6", // default page size
    } = req.query;

    // Base filter for DB lookup
    const filter = {};
    if (level) filter.level = level;
    if (type) filter.type = type;
    if (dropin === "yes") filter.allowDropIn = true;
    if (dropin === "no") filter.allowDropIn = false;

    // Fetch all courses matching basic filters
    let courses = await CourseModel.list(filter);

    // Only list courses that are currently running or still upcoming.
    courses = courses.filter((course) => isCurrentOrUpcomingCourse(course));

    // Client-side search (NeDB has basic querying; for simplicity, do it here)
    const needle = (q || "").trim().toLowerCase();
    if (needle) {
      courses = courses.filter(
        (c) =>
          c.title?.toLowerCase().includes(needle) ||
          c.description?.toLowerCase().includes(needle)
      );
    }

    // Sort by startDate ascending (fallback to title)
    courses.sort(compareCoursesByStartDate);

    // Pagination
    const requestedPage = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.max(1, parseInt(pageSize, 10) || 6);
    const total = courses.length;
    const totalPages = Math.max(1, Math.ceil(total / ps));
    const p = Math.min(requestedPage, totalPages);
    const start = (p - 1) * ps;
    const pageItems = courses.slice(start, start + ps);

    // Enrich with first session date, session count
    const allLocations = await LocationModel.list();
    const locMap = Object.fromEntries(allLocations.map(l => [l._id, l.name]));
    const buildCourseCard = async (course) => {
      const sessions = await SessionModel.listByCourse(course._id);
      const first = sessions[0];
      return {
        id: course._id,
        title: course.title,
        level: buildCourseLevelLabel(course.level),
        type: buildCourseTypeLabel(course.type),
        allowDropIn: course.allowDropIn,
        duration: buildCourseDurationLabel(course, sessions),
        startDate: fmtDateOnly(course.startDate),
        endDate: fmtDateOnly(course.endDate),
        time: buildCourseTimeLabel(first),
        nextSession: first ? fmtDateTime(first.startDateTime) : "TBA",
        sessionsCount: sessions.length,
        description: course.description,
        locationName: course.locationId ? locMap[course.locationId] || '' : '',
        price: course.price != null ? course.price : null,
        hasPrice: course.price != null,
        booking: buildCourseBookingSummary(bookingIndex, course._id),
      };
    };

    const cards = await Promise.all(
      pageItems.map((course) => buildCourseCard(course))
    );

    const bookedSourceCourses = courses.filter(
      (course) => buildCourseBookingSummary(bookingIndex, course._id)
    );
    const bookedCourses = await Promise.all(
      bookedSourceCourses.map((course) => buildCourseCard(course))
    );

    // Build pagination view model
    const pagination = {
      page: p,
      pageSize: ps,
      total,
      totalPages,
      show: totalPages > 1,
      hasPrev: p > 1,
      hasNext: p < totalPages,
      prevLink: p > 1 ? buildLink(req, p - 1, ps) : null,
      nextLink: p < totalPages ? buildLink(req, p + 1, ps) : null,
    };

    res.render("courses", {
      title: "Courses",
      filters: {
        level,
        levelBeginner: level === "beginner",
        levelIntermediate: level === "intermediate",
        levelAdvanced: level === "advanced",
        type,
        dropin,
        q,
      },
      courses: cards,
      bookedCourses,
      hasBookedCourses: bookedCourses.length > 0,
      pagination,
    });
  } catch (err) {
    next(err);
  }
};

// Helper to preserve current query params while changing page
function buildLink(req, page, pageSize) {
  const url = new URL(
    `${req.protocol}://${req.get("host")}${req.originalUrl.split("?")[0]}`
  );
  const params = new URLSearchParams(req.query);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return `${url.pathname}?${params.toString()}`;
}
