const razorpayInstance = require("../../config/razorpay");
const crypto = require("crypto");
const Order = require("../../models/orderSchema");
const { disconnect } = require("process");
const Cart = require("../../models/cartSchema");

exports.createOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    const { name, emailId } = req.user;
    if (!amount) {
      return res
        .status(400)
        .json({ success: false, message: "Amount is required" });
    }

    const order = await razorpayInstance.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        name,
        emailId,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Razorpay order created successfully",
      order,
      key: process.env.RAZORPAY_KEY_ID, // send key to frontend for Razorpay popup
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderDetails,
    } = req.body;

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature payment failed" });
    }

    //  signature verified

    const order = new Order({
      userId: orderDetails.userId,
      items: orderDetails.cartItems,
      address: {
        addressId: orderDetails.address.addressId,
        snapshot: orderDetails.address.snapshot,
      },
      couponCode: orderDetails.couponCode || null,
      totalAmount: orderDetails.totalAmount,
      discount: orderDetails.discount || 0,
      grandTotalAmount: orderDetails.amount,
      paymentMethod: "razorpay",
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      paymentStatus: "Paid",
      razorpaySignature: razorpay_signature,
      orderStatus: "Processing",
    });

    await order.save();
    await Cart.deleteMany({userId:orderDetails.userId})
    return res
      .status(200)
      .json({ success: true, message: "Payment verified & order saved" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
