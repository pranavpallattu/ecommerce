const mongoose = require("mongoose");
const transactionStatuses = [
  "Pending", // ✅ ADD BACK - Order placed, awaiting payment/confirmation
  "Confirmed",
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
  "PartiallyCancelled",
  "Returned",
  "PartiallyReturned",
  "ReturnPending",
  "ReturnRejected",
];
const paymentStatuses = [
  "Pending",
  "Paid",
  "Failed",
  "Refunded",
  "PartiallyRefunded",
  "N/A",
];

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
        productName: { type: String, required: true },
        productImage: { type: String, default: null },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
        subtotal: { type: Number, required: true, min: 0 },
        itemStatus: {
          type: String,
          enum: transactionStatuses,
          default: "Pending",
        },
        deliveredAt: { type: Date, default: null },
        cancelledAt: { type: Date, default: null },
        cancellationReason: { type: String, default: null },
        returnReason: { type: String, default: null },
        returnRequestedAt: { type: Date, default: null },
        returnApprovedAt: { type: Date, default: null },
        returnRejectedAt: { type: Date, default: null },
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
        streetAddress: { type: String, required: true },
        name: { type: String, required: true },
        city: { type: String, required: true },
        landmark: { type: String, required: true },
        state: { type: String, required: true },
        country: { type: String, required: true },
        pincode: { type: Number, required: true },
        phone: { type: String, required: true },
      },
    },
    checkoutType: {
      type: String,
      enum: ["cart", "buyNow"],
      required: true,
    },
    subTotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
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
    paymentStatus: {
      type: String,
      enum: paymentStatuses,
      default: "Pending",
    },
    walletAmountUsed: { type: Number, default: 0, min: 0 },
    orderStatus: {
      type: String,
      enum: transactionStatuses,
      default: "Pending",
    },

    refunds: [
      {
        refundId: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        itemIds: [{ type: mongoose.Schema.Types.ObjectId }], // References items._id
        reason: { type: String, default: null },
        date: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: ["Initiated", "Processed", "Failed"],
          default: "Initiated",
        },
      },
    ],
invoice: {
  number: {
    type: String,
    unique: true,
    sparse: true, // allows null for unpaid orders
  },
  url: {
    type: String, // PDF URL (S3 / Cloudinary / local)
  },
  generatedAt: {
    type: Date,
  },
},
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    returnedAt : { type: Date, default: null },
    cancelledReason: { type: String, default: null },
    returnReason: { type: String, default: null },
  },
  { timestamps: true },
);

// Auto-calculate subtotal and grand total, validate refunds
orderSchema.pre("save", function (next) {
  this.items.forEach((item) => {
    if (!item.subtotal) {
      item.subtotal = item.price * item.quantity;
    }
  });
  this.subTotal = this.items.reduce((sum, i) => sum + i.subtotal, 0);

  this.grandTotal = Math.max(0, this.subTotal - this.discount);
  next();
});

// Indexes for performance
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ "refunds.refundId": 1 });

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
