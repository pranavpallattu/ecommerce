const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  emailId: {
    type: String,
    required: true,
  },
  otp: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default:Date.now,
    expires: 300,
  },
});

const Otp= mongoose.model("Otp",otpSchema)
module.exports=Otp