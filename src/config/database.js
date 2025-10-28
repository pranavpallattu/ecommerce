const mongoose = require("mongoose");

const connectDB = async () => {
  await mongoose.connect(
    "mongodb+srv://pranavps:pranav%402004@cluster0.jgq01ru.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=ecommerce"
  );
};

module.exports = connectDB;
