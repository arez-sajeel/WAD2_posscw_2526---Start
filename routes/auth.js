// routes/auth.js
import { Router } from 'express';
import { body } from 'express-validator';
import {
  getLogin,
  postLogin,
  getRegister,
  postRegister,
  logout,
} from '../controllers/authController.js';

const router = Router();

const loginValidators = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail().escape(),
  body('password').notEmpty().withMessage('Password is required.'),
];

const registerValidators = [
  body('name')
    .trim()
    .notEmpty().withMessage('Full name is required.')
    .isLength({ max: 100 }).withMessage('Name must be under 100 characters.')
    .escape(),
  body('email')
    .trim()
    .isEmail().withMessage('A valid email address is required.')
    .normalizeEmail()
    .escape(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .isLength({ max: 128 }).withMessage('Password must be under 128 characters.'),
];

router.get('/login', getLogin);
router.post('/login', loginValidators, postLogin);

router.get('/register', getRegister);
router.post('/register', registerValidators, postRegister);

router.get('/logout', logout);

export default router;
