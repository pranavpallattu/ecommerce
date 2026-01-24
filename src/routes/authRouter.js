const express = require("express");

const authRouter = express.Router();

const passport = require("passport");

const authController = require("../controllers/authController");
const { userAuthMiddleware } = require("../middlewares/authMiddleware");

authRouter.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

authRouter.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  authController.googleVerifyCallback
);

authRouter.get("/auth/me", userAuthMiddleware, authController.getMe);

authRouter.post("/auth/requestotp", authController.requestAuthOtp);
authRouter.post("/auth/verifyotp", authController.verifyAuthOtp);
// authRouter.post("/auth/login/requestotp",authController.requestLoginOtp)
// authRouter.post("/auth/login/verifyotp",authController.verifyLoginOtp)

authRouter.post("/logout", authController.logoutController);

module.exports = authRouter;
