const razorpayInstance = require("../../config/razorpay");
const crypto = require("crypto");
const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const { default: mongoose } = require("mongoose");
const Product = require("../../models/productSchema");
const Wallet = require("../../models/walletSchema");
const Coupon = require("../../models/couponSchema");

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
  await session.startTransaction();
  let order;
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
      const err = new Error("Invalid signature, payment failed");
      err.statusCode = 400;
      throw err;
    }

    // prevent duplicate order
    const existingOrder = await Order.findOne({
      razorpayOrderId: razorpay_order_id,
    });
    if (existingOrder) {
      await session.commitTransaction();
      return res.status(200).json({
        success: true,
        message: "Order already processed",
        data: { orderId: existingOrder._id },
      });
    }

    // validate cart
    const cart = await Cart.findOne({ userId: user._id }).session(session);

    if (!cart || cart.items.length === 0) {
      const err = new Error("Cart is empty or not found");
      err.statusCode = 400;
      throw err;
    }

    // validate sub total

    const calculatedSubTotal = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    let expectedDiscount = 0;

    if (orderDetails.couponId) {
      const coupon = await Coupon.findById(orderDetails.couponId).session(
        session
      );

      if (!coupon || !coupon.isActive) {
        const err = new Error("Invalid or inactive coupon");
        err.statusCode = 400;
        throw err;
      }

      if (calculatedSubTotal < coupon.minPurchase) {
        const err = new Error("Minimum purchase requirement not met");
        err.statusCode = 400;
        throw err;
      }

      if (coupon.discountType == "percentage") {
        expectedDiscount = (calculatedSubTotal * coupon.discount) / 100;
      } else if (coupon.discountType == "flat") {
        expectedDiscount = coupon.discount;
      }

      expectedDiscount = Math.min(expectedDiscount, calculatedSubTotal);
    }

    const expectedGrandTotal = calculatedSubTotal - expectedDiscount;

    // Validate amounts
    if (
      calculatedSubTotal !== orderDetails.subTotal ||
      expectedDiscount !== orderDetails.discount ||
      expectedGrandTotal !== orderDetails.grandTotal
    ) {
      const err = new Error("Payment amount tampering detected");
      err.statusCode = 400;
      throw err;
    }

    // === VALIDATE & DEDUCT STOCK ===
    for (const item of cart.items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product || product.quantity < item.quantity) {
        const err = new Error(`Insufficient stock for ${item.productName}`);
        err.statusCode = 400;
        throw err;
      }
      product.quantity -= item.quantity;
      await product.save({ session });
    }

    // save order
    order = new Order({
      userId: user._id,
      items: cart.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity,
        itemStatus: "Confirmed",
      })),
      address: {
        addressId: orderDetails.address.addressId,
        snapshot: orderDetails.address.snapshot,
      },
      couponId: orderDetails.couponId,
      couponCode: orderDetails.couponCode || null,
      subTotal: calculatedSubTotal, // Align with schema
      discount: expectedDiscount || 0,
      grandTotal: expectedGrandTotal, // Align with schema
      paymentMethod: "razorpay",
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      paymentStatus: "Paid",
      orderStatus: "Confirmed",
    });

    await order.save({ session });
    await Cart.deleteOne({ userId: user._id }).session(session);

    await session.commitTransaction();
    return res
      .status(200)
      .json({ success: true, message: "Payment verified & order saved" });
  } catch (error) {
    await session.abortTransaction();
    console.error("verifyPayment error:", error);
    const statusCode = error.statusCode || 500;
    return res
      .status(statusCode)
      .json({ success: false, message: error.message, data: order || null });
  } finally {
    await session.endSession();
  }
};

// exports.verifyPayment = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const {
//       razorpay_order_id,
//       razorpay_payment_id,
//       razorpay_signature,
//       orderDetails,
//     } = req.body;

//     const user = req.user;

//     // === VALIDATE SIGNATURE ===
//     const generatedSignature = crypto
//       .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//       .update(`${razorpay_order_id}|${razorpay_payment_id}`)
//       .digest("hex");

//     if (generatedSignature !== razorpay_signature) {
//       throw new Error("Invalid signature - payment verification failed");
//     }

//     // === PREVENT DUPLICATE ORDERS ===
//     const existingOrder = await Order.findOne({
//       razorpayOrderId: razorpay_order_id,
//     }).session(session);

//     if (existingOrder) {
//       await session.commitTransaction();
//       return res.status(200).json({
//         success: true,
//         message: "Order already processed",
//         data: { orderId: existingOrder._id },
//       });
//     }

//     // === VALIDATE CART ===
//     const cart = await Cart.findOne({ userId: user._id }).session(session);
//     if (!cart || cart.items.length === 0) {
//       throw new Error("Cart is empty or not found");
//     }

//     // === CALCULATE & VALIDATE AMOUNTS ===
//     const calculatedSubTotal = cart.items.reduce(
//       (sum, item) => sum + item.price * item.quantity,
//       0
//     );

//     // Validate coupon and calculate discount
//     let expectedDiscount = 0;
//     if (orderDetails.couponId) {
//       const coupon = await Coupon.findById(orderDetails.couponId).session(session);

//       if (!coupon || !coupon.isActive) {
//         throw new Error("Invalid or inactive coupon");
//       }

//       if (calculatedSubTotal < coupon.minPurchase) {
//         throw new Error("Minimum purchase requirement not met");
//       }

//       if (coupon.discountType === "percentage") {
//         expectedDiscount = (calculatedSubTotal * coupon.discountValue) / 100;
//         if (coupon.maxDiscount) {
//           expectedDiscount = Math.min(expectedDiscount, coupon.maxDiscount);
//         }
//       } else if (coupon.discountType === "flat") {
//         expectedDiscount = coupon.discountValue;
//       }

//       expectedDiscount = Math.min(expectedDiscount, calculatedSubTotal);

//       // Increment usage count
//       coupon.usedCount = (coupon.usedCount || 0) + 1;
//       await coupon.save({ session });
//     }

//     const expectedGrandTotal = calculatedSubTotal - expectedDiscount;

// // Validate amounts
// if (
//   calculatedSubTotal !== orderDetails.subTotal ||
//   expectedDiscount !== orderDetails.discount ||
//   expectedGrandTotal !== orderDetails.grandTotal
// ) {
//   throw new Error("Payment amount tampering detected");
// }

// // === VALIDATE & DEDUCT STOCK ===
// for (const item of cart.items) {
//   const product = await Product.findById(item.productId).session(session);
//   if (!product || product.quantity < item.quantity) {
//     throw new Error(`Insufficient stock for ${item.productName}`);
//   }
//   product.quantity -= item.quantity;
//   await product.save({ session });
// }

// === CREATE ORDER ===
//     const order = new Order({
//       userId: user._id,
//       items: cart.items.map((item) => ({
//         productId: item.productId,
//         productName: item.productName,
//         productImage: item.productImage,
//         quantity: item.quantity,
//         price: item.price,
//         subtotal: item.price * item.quantity,
//         itemStatus: "Confirmed", // Payment confirmed
//       })),
//       address: {
//         addressId: orderDetails.address.addressId,
//         snapshot: orderDetails.address.snapshot,
//       },
//       couponId: orderDetails.couponId || null,
//       couponCode: orderDetails.couponCode || null,
//       subTotal: calculatedSubTotal,
//       discount: expectedDiscount,
//       grandTotal: expectedGrandTotal,
//       paymentMethod: "razorpay",
//       razorpayPaymentId: razorpay_payment_id,
//       razorpayOrderId: razorpay_order_id,
//       paymentStatus: "Paid",
//       orderStatus: "Confirmed", // Payment confirmed
//     });

//     await order.save({ session });
//     await Cart.deleteOne({ userId: user._id }).session(session);

//     await session.commitTransaction();

//     return res.status(200).json({
//       success: true,
//       message: "Payment verified & order created",
//       data: {
//         orderId: order._id,
//         grandTotal: order.grandTotal,
//       },
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     console.error("verifyPayment error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   } finally {
//     session.endSession();
//   }
// };
