const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const parseDateValue = (value) => {
  if (!value) {
    return null;
  }

  if (DATE_ONLY_RE.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isCurrentOrUpcomingCourse = (course, referenceDate = new Date()) => {
  const comparisonDate = parseDateValue(course.endDate || course.startDate);
  if (!comparisonDate) {
    return true;
  }

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  comparisonDate.setHours(0, 0, 0, 0);

  return comparisonDate >= today;
};

export const compareCoursesByStartDate = (a, b) => {
  const ad = parseDateValue(a.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bd = parseDateValue(b.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (ad !== bd) {
    return ad - bd;
  }

  return (a.title || "").localeCompare(b.title || "");
};

export const buildCourseLevelLabel = (level) => {
  if (!level) {
    return "";
  }

  return `${level.charAt(0).toUpperCase()}${level.slice(1)}`;
};

export const buildCourseTypeLabel = (type) => {
  if (type === "WEEKLY_BLOCK") {
    return "Weekly block";
  }

  if (type === "WEEKEND_WORKSHOP") {
    return "Weekend workshop";
  }

  return type || "";
};

export const buildCourseDurationLabel = (course, sessions = []) => {
  if (course.type === "WEEKLY_BLOCK" && sessions.length > 0) {
    return sessions.length === 1 ? "1 week" : `${sessions.length} weeks`;
  }

  const startDate = parseDateValue(course.startDate);
  const endDate = parseDateValue(course.endDate);
  if (startDate && endDate && endDate >= startDate) {
    const dayCount = Math.round((endDate - startDate) / ONE_DAY_MS) + 1;
    return dayCount === 1 ? "1 day" : `${dayCount} days`;
  }

  if (sessions.length > 0) {
    return sessions.length === 1 ? "1 session" : `${sessions.length} sessions`;
  }

  return "To be confirmed";
};

export const buildCourseTimeLabel = (session) => {
  if (!session?.startDateTime || !session?.endDateTime) {
    return "TBA";
  }

  const timeOptions = {
    hour: "2-digit",
    minute: "2-digit",
  };

  const startTime = new Date(session.startDateTime).toLocaleTimeString(
    "en-GB",
    timeOptions
  );
  const endTime = new Date(session.endDateTime).toLocaleTimeString(
    "en-GB",
    timeOptions
  );

  return `${startTime} - ${endTime}`;
};