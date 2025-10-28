const razorpayInstance = require("../../config/razorpay");
const crypto = require("crypto");
const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const { default: mongoose } = require("mongoose");
const Product = require("../../models/productSchema");

exports.createOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    const { _id, name, emailId } = req.user;
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      });
    }

    const order = await razorpayInstance.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `receipt_${_id}_${Date.now()}`,
      notes: {
        name,
        emailId,
        userId: _id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Razorpay order created successfully",
      order,
      key: process.env.RAZORPAY_KEY_ID, // send key to frontend for Razorpay popup
    });
  } catch (error) {
    console.error("Razorpay createOrder error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.verifyPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderDetails,
    } = req.body;

    const user = req.user;

    // validate signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      await session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature payment failed" });
    }

    // prevent duplicate order
    const existingOrder = await Order.findOne({
      razorpayOrderId: razorpay_order_id,
    });
    if (existingOrder) {
      await session.endSession();
      return res.status(200).json({
        success: true,
        message: "Order Already processed",
        data: { orderId: existingOrder._id },
      });
    }

    // validate cart

    const cart = await Cart.findOne({ userId: user._id}).session(session);

    if (!cart || cart.items.length === 0) {
      throw new Error("Cart is empty or not found");
    }

    // validate sub total

    const calculatedSubTotal = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    if (calculatedSubTotal !== orderDetails.subTotal) {
      throw new Error("Amount tampering detected");
    }

    //  signature verified
    // save order
    const order = new Order({
      userId: user._id,
      items: cart.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity,
        itemStatus: "Processing",
        paymentStatus: "Paid",
      })),
      address: {
        addressId: orderDetails.address.addressId,
        snapshot: orderDetails.address.snapshot,
      },
      couponId: orderDetails.couponId,
      couponCode: orderDetails.couponCode || null,
      subTotal: calculatedSubTotal, // Align with schema
      discount: orderDetails.discount || 0,
      grandTotal: orderDetails.grandTotal, // Align with schema
      paymentMethod: "razorpay",
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      paymentStatus: "Paid",
      orderStatus: "Processing",
    });

    // deduct stock

    for (const item of cart.items) {
      const product = await Product.findById(item.productId).session(
        session
      );
      if (!product || product.quantity < item.quantity) {
        throw new Error(`Insufficient stock for ${item.productName}`);
      }
      product.quantity -= item.quantity;
      await product.save({ session });
    }

    await order.save({ session });
    await Cart.deleteOne({ userId: user._id }).session(session);

    await session.commitTransaction();
    session.endSession();
    return res
      .status(200)
      .json({ success: true, message: "Payment verified & order saved" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("verifyPayment error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
