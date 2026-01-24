const mongoose = require("mongoose");

const buyNowSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    product: {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      name: String,
      image: String,
      price: Number,
    },

    quantity: {
      type: Number,
      default: 1, // Buy Now = always 1
    },

    appliedCoupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },

    discount: {
      type: Number,
      default: 0,
    },

    subTotal: {
      type: Number,
      required: true,
    },

    finalTotal: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "EXPIRED"],
      default: "ACTIVE",
    },

    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000), // 30 min
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BuyNow", buyNowSchema);
