const express = require("express");
const connectDB = require("./config/database");
require("dotenv").config();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const passport = require("passport");

const authRouter = require("./routes/authRouter");
const adminRouter = require("./routes/adminRouter");
const userRouter = require("./routes/userRouter");
const paymentController = require("../src/controllers/user/paymentController");

require("./config/passport");

const app = express();

app.use(
  cors({
    origin: "https://ecommerceui-one.vercel.app",
    // origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.post(
  "/api/user/payment/webhook",
  express.raw({ type: "application/json" }),
  paymentController.razorpayWebhook,
);

app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/admin", adminRouter);

connectDB()
  .then(() => {
    console.log("MongoDB connected successfully");
    app.listen(7777, () => {
      console.log("Server running on http://localhost:7777");
    });
  })
  .catch((err) => {
    console.log("MongoDB connection failed: " + err);
  });

app.get("/", (req, res) => {
  res.send("Server is running");
});
