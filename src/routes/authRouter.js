const express = require("express");

const authRouter = express.Router();

const passport = require("passport");

const authController = require("../controllers/auth/authController");
const { authMiddleware } = require("../middlewares/authMiddleware");

authRouter.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

authRouter.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  authController.googleVerifyCallback
);


authRouter.post("/requestotp", authController.requestAuthOtp);
authRouter.post("/verifyotp", authController.verifyAuthOtp);

authRouter.get("/me", authMiddleware, authController.getMe);
authRouter.post("/logout", authController.logout);



module.exports = authRouter;
