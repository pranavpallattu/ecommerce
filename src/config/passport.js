const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema"); // your user model
const jwt = require("jsonwebtoken");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID, // from Google Cloud Console
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
callbackURL: "https://ecommerceui-one.vercel.app/api/auth/google/callback",    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({
          $or: [{ googleId: profile.id }, { emailId: profile.emails[0].value }],
        });

        if (!user) {
          user = new User({
            googleId: profile.id,
            emailId: profile.emails[0].value,
            name: profile.displayName,
            isAdmin: false,
          });
          await user.save();
        } else {
          // attach googleId if missing
          if (!user.googleId) {
            user.googleId = profile.id;
            await user.save();
          }
        }

        return done(null, user);
      } catch (err) {
        console.error(err);
        return done(err, null);
      }
    },
  ),
);
