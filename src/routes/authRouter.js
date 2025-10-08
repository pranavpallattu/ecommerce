const express=require("express")

const authRouter=express.Router()

const passport=require("passport")

const otpController=require("../controllers/otpController")

const authController=require("../controllers/authController")






authRouter.get("/google",passport.authenticate("google", { scope: ["profile", "email"] }))

authRouter.get("/google/callback", passport.authenticate("google", { session: false }),authController.googleVerifyCallback)

authRouter.post("/auth/send-otp", otpController.sendOtp);

authRouter.post("/auth/signup",authController.signUpController)

authRouter.post("/auth/login",authController.loginController)

module.exports=authRouter