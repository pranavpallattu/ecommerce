const mongoose = require("mongoose");

const cartItemSchema = mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be atleast 1"],
    default: 1,
  },
  price: {
    type: Number,
    min: 0,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
});

const cartSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [cartItemSchema],
    totalItems: {
      type: Number,
      min: 0,
      default: 0,
    },
    subTotal: {
      type: Number,
      default: 0,
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
    finalTotal: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

cartSchema.pre("save", function (next) {
  this.totalItems = this.items.length;
  this.subTotal = this.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  this.finalTotal = this.subTotal - this.discount;
  next();
});

const Cart = mongoose.model("Cart", cartSchema);
module.exports = Cart;
