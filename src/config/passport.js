const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema"); // your user model
const jwt = require("jsonwebtoken");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID, // from Google Cloud Console
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`,
    },
    // passport verify callback
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;

        console.log("Google email:", email);

        let user = await User.findOne({ emailId: email });

        if (!user) {
          user = new User({
            googleId: profile.id,
            emailId: email,
            name: profile.displayName,
            isAdmin: false,
          });
          await user.save();
        } else {
          //  NEVER override admin accidentally
          if (!user.googleId) {
            user.googleId = profile.id;
          }

          await user.save();
        }

        return done(null, user);
      } catch (err) {
        console.error(err);
        return done(err, null);
      }
    },
  ),
);
