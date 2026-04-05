// routes/views.js
import { Router } from "express";
import {
  homePage,
  courseDetailPage,
  courseBookingPage,
  sessionBookingPage,
  postBookCourse,
  postBookSession,
  bookingConfirmationPage,
  organisationPage,
  locationsPage,
} from "../controllers/viewsController.js";
import { coursesListPage } from "../controllers/coursesListController.js";
import { ensureAuthenticated } from "../middlewares/authGuard.js";
import { body } from "express-validator";

const router = Router();

router.get("/", homePage);
router.get("/organisation", organisationPage);
router.get("/locations", locationsPage);
router.get("/courses", coursesListPage);
router.get("/courses/:id", courseDetailPage);
router.get("/courses/:id/book", courseBookingPage);
router.post(
  "/courses/:id/book",
  ensureAuthenticated,
  [
    body("name").trim().notEmpty().withMessage("Full name is required.").escape(),
    body("email")
      .trim()
      .isEmail()
      .withMessage("Enter a valid email address.")
      .normalizeEmail()
      .escape(),
    body("notes")
      .optional({ values: "falsy" })
      .trim()
      .isLength({ max: 500 })
      .withMessage("Notes must be 500 characters or fewer.")
      .escape(),
    body("consent")
      .equals("on")
      .withMessage("You must agree to the booking terms before submitting."),
  ],
  postBookCourse
);
router.get("/sessions/:id/book", sessionBookingPage);
router.post("/sessions/:id/book", ensureAuthenticated, postBookSession);
router.get("/bookings/:bookingId", ensureAuthenticated, bookingConfirmationPage);


export default router;
