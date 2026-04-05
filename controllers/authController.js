// controllers/authController.js
import passport from 'passport';
import { validationResult } from 'express-validator';
import { UserModel } from '../models/userModel.js';

const mapFieldErrors = (errors) =>
  errors.reduce((accumulator, error) => {
    if (!accumulator[error.path]) {
      accumulator[error.path] = error.msg;
    }
    return accumulator;
  }, {});

export const getLogin = (req, res) => {
  res.render('login', {
    title: 'Log In',
    values: { email: '' },
    fieldErrors: {},
  });
};

export const postLogin = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorList = errors.array();
    return res.render('login', {
      title: 'Log In',
      error: errorList[0].msg,
      values: { email: req.body.email },
      fieldErrors: mapFieldErrors(errorList),
    });
  }

  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.render('login', {
        title: 'Log In',
        error: info?.message || 'Invalid email or password.',
        values: { email: req.body.email },
        fieldErrors: {},
      });
    }
    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.redirect('/');
    });
  })(req, res, next);
};

export const getRegister = (req, res) => {
  res.render('register', {
    title: 'Create Account',
    values: { name: '', email: '' },
    fieldErrors: {},
  });
};

export const postRegister = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorList = errors.array();
    return res.render('register', {
      title: 'Create Account',
      errors: { list: errorList.map((error) => error.msg) },
      values: { name: req.body.name, email: req.body.email },
      fieldErrors: mapFieldErrors(errorList),
    });
  }

  try {
    const existing = await UserModel.findByEmail(req.body.email);
    if (existing) {
      return res.render('register', {
        title: 'Create Account',
        errors: { list: ['An account with that email already exists.'] },
        values: { name: req.body.name, email: req.body.email },
        fieldErrors: { email: 'An account with that email already exists.' },
      });
    }

    const user = await UserModel.create({
      name: req.body.name.trim(),
      email: req.body.email.trim().toLowerCase(),
      password: req.body.password,
      role: 'student',
    });

    req.login(user, (err) => {
      if (err) return next(err);
      res.redirect('/');
    });
  } catch (err) {
    next(err);
  }
};

export const logout = (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/auth/login');
  });
};
