// config/passport.js
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { UserModel } from '../models/userModel.js';

passport.use(
  new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
      try {
        const user = await UserModel.findByEmail(email);
        if (!user) {
          return done(null, false, { message: 'Invalid email or password.' });
        }
        const match = await UserModel.verifyPassword(password, user.password);
        if (!match) {
          return done(null, false, { message: 'Invalid email or password.' });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await UserModel.findById(id);
    done(null, user || false);
  } catch (err) {
    done(err);
  }
});

export default passport;
