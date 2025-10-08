const mongoose = require("mongoose");
const { isLowercase } = require("validator");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim:true,
      lowercase:true
    },
    description: {
      type: String,
      required: false,
      trim:true
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted:{
      type:Boolean,
      default:false
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    offer: {
      type: Number,
      default: null,
      min:0,
      max:100
    }
  },
  {
    timestamps: true,
  }
);

const Category = mongoose.model("Category", categorySchema);

module.exports = Category;
