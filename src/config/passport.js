const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema"); // your user model
const jwt=require("jsonwebtoken")

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID, // from Google Cloud Console
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:7777/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user exists
        let user = await User.findOne({ googleId: profile.id });
        console.log(profile);
        
        // console.log(user);

        if (!user) {
          // Create new user
          user = new User({
            googleId: profile.id,
            emailId: profile.emails[0].value,
            name: profile.displayName,
          });
          await user.save();
        }


        return done(null,user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);
