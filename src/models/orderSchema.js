const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        productName: {
          type: String,
          required: true,
        },
        ProductImage: { type: String, default: null },
        quantity: {
          type: Number,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        itemDiscount: {
          type: Number,
          default: 0,
        },
        itemStatus: {
          type: String,
          enum: [
            "Pending",
            "Delivered",
            "Shipped",
            "Cancelled",
            "Returned",
            "Processing",
            "Return Pending",
            "Return Rejected",
          ],
          default: "Pending",
        },
        paymentStatus: {
          type: String,
          enum: ["Pending", "Paid", "Failed", "Refunded", "N/A"],
          default: "Pending",
        },
        returnReason: {
          type: String,
          default: null,
        },
      },
    ],
    address: {
      addressId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Address",
        required: true,
      },
      snapshot: {
        addressType: { type: String, required: true },
        name: { type: String, required: true },
        city: { type: String, required: true },
        landMark: { type: String, required: true },
        state: { type: String, required: true },
        pincode: { type: Number, required: true },
        phone: { type: String, required: true },
      },
    },

    //   before discount
    totalAmount: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    grandTotalAmount: { type: Number, required: true },

    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    couponCode: { type: String, default: null },
    paymentMethod: {
      type: String,
      enum: ["cod", "razorpay", "wallet"],
      required: true,
    },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded", "N/A"],
      default: "Pending",
    },

    orderStatus: {
      type: String,
      enum: [
        "Pending",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
        "Returned",
        "Return Pending",
        "Return Rejected",
      ],
      default: "Pending",
    },

    orderDate: { type: Date, default: Date.now },
    returnReason: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
