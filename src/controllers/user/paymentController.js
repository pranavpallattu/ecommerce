const razorpayInstance = require("../../config/razorpay");
const crypto = require("crypto");
const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const { default: mongoose } = require("mongoose");
const Product = require("../../models/productSchema");
const Wallet = require("../../models/walletSchema");
const Coupon = require("../../models/couponSchema");
const BuyNow = require("../../models/buynowSchema");
const { createInvoiceIfNeeded } = require("./invoiceController");

exports.createOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    // console.log(req.body);

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
      receipt: `receipt_${_id}}`,
      notes: {
        name,
        emailId,
        userId: _id,
      },
    });

    // console.log(order);

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

    console.log(orderDetails);

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
    }).session(session);
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
      0,
    );
    let expectedDiscount = 0;

    if (orderDetails?.couponId) {
      if (!mongoose.Types.ObjectId.isValid(orderDetails.couponId)) {
        const err = new Error("Invalid coupon id format");
        err.statusCode = 400;
        throw err;
      }

      const coupon = await Coupon.findById(orderDetails?.couponId).session(
        session,
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
      calculatedSubTotal !== orderDetails?.subTotal ||
      expectedDiscount !== orderDetails?.discount ||
      expectedGrandTotal !== orderDetails?.grandTotal
    ) {
      console.log(calculatedSubTotal, expectedDiscount, expectedGrandTotal);
      // console.log(
      //   orderDetails?.subTotal,
      //   orderDetails?.discount,
      //   orderDetails?.grandTotal,
      // );

      const err = new Error("Payment amount tampering detected");
      err.statusCode = 400;
      throw err;
    }

    // === VALIDATE & DEDUCT STOCK ===
    const orderItems = [];

    for (const item of cart.items) {
      const product = await Product.findById(item.product).session(session);

      if (!product || product.quantity < item.quantity) {
        const err = new Error(`Insufficient stock for ${product?.productName}`);
        err.statusCode = 400;
        throw err;
      }

      // deduct stock
      product.quantity -= item.quantity;
      await product.save({ session });

      // build order item snapshot ✅
      orderItems.push({
        productId: product._id,
        productName: product.productName, // ✅ FIXED
        productImage: product.productImage[0] || null,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity,
        itemStatus: "Confirmed",
      });
    }

    // save order
    order = new Order({
      userId: user._id,
      items: orderItems,
      address: {
        addressId: orderDetails.address.addressId,
        snapshot: orderDetails.address.snapshot,
      },
      checkoutType: "cart",
      couponId: orderDetails?.couponId,
      couponCode: orderDetails?.couponCode || null,
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

    // increment coupon usage AFTER successful order creation
    if (orderDetails?.couponId) {
      await Coupon.findByIdAndUpdate(
        orderDetails.couponId,
        { $inc: { usedCount: 1 } },
        { session },
      );

      if (!user.usedCoupons) {
        user.usedCoupons = [];
      }

      user.usedCoupons.push(orderDetails.couponId);

      await user.save({ session });
    }

    await Cart.deleteOne({ userId: user._id }).session(session);
    await session.commitTransaction();
    await createInvoiceIfNeeded(order._id);

    return res.status(200).json({
      success: true,
      message: "Payment verified & order saved",
      orderId: order._id,
    });
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

exports.createBuyNowOrder = async (req, res) => {
  try {
    const { buyNowId } = req.body;

    const userId = req.user._id;

    const buyNow = await BuyNow.findOne({
      _id: buyNowId,
      userId,
      status: "ACTIVE",
    });

    if (!buyNow) {
      return res.status(404).json({
        success: false,
        message: "Buy Now session expired",
      });
    }

    const amount = buyNow.finalTotal;

    const order = await razorpayInstance.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: `buynow_${buyNowId}`,
      notes: {
        buyNowId,
        userId,
      },
    });

    res.status(200).json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.verifyBuyNowPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("verify buy now called");

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      buyNowId,
      address,
    } = req.body;

    const userId = req.user._id;

    // 🔐 Verify Razorpay signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      const err = new Error("Invalid signature, payment failed");
      err.statusCode = 400;
      throw err;
    }

    const existingOrder = await Order.findOne({
      razorpayOrderId: razorpay_order_id,
    }).session(session);

    if (existingOrder) {
      await session.commitTransaction();
      return res.status(200).json({
        success: true,
        message: "Order already processed",
        orderId: existingOrder._id,
      });
    }

    // 🔍 Fetch BuyNow
    const buyNow = await BuyNow.findOne({
      _id: buyNowId,
      userId,
      status: "ACTIVE",
    })
      .populate("product.productId")
      .session(session);

    if (!buyNow) {
      throw new Error("Buy Now session expired");
    }

    const product = buyNow.product.productId;
    const quantity = buyNow.quantity; // usually 1
    const subTotal = buyNow.subTotal;
    const grandTotal = buyNow.finalTotal;

    // 📦 Stock check
    if (product.quantity < quantity) {
      throw new Error("Insufficient stock");
    }

    // 🔻 Deduct stock
    product.quantity -= quantity;
    await product.save({ session });

    // 🧾 Create Order
    const order = new Order({
      userId,
      items: [
        {
          productId: product._id,
          productName: product.productName,
          productImage: product.images?.[0],
          quantity,
          price: product.salePrice,
          subtotal: subTotal,
          itemStatus: "Confirmed",
        },
      ],
      address,
      checkoutType: "buyNow",
      subTotal,
      discount: buyNow.discount || 0,
      grandTotal,
      paymentMethod: "razorpay",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      paymentStatus: "Paid",
      orderStatus: "Confirmed",
    });

    await order.save({ session });

    // ✅ Mark BuyNow completed
    buyNow.status = "COMPLETED";
    await buyNow.save({ session });

    await session.commitTransaction();

    await createInvoiceIfNeeded(order._id);

    res.status(200).json({
      success: true,
      message: "Buy Now order placed successfully",
      orderId: order._id,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

exports.razorpayWebhook = async (req, res) => {
  try {
    console.log("🔥 Webhook called");

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    // ✅ Convert buffer to string
    const bodyString = req.body.toString();

    // ✅ Create expected signature
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(bodyString)
      .digest("hex");

    // ❌ Signature mismatch (Postman will fail here — that’s OK)
    if (expectedSignature !== signature) {
      console.log("❌ Invalid signature");
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    // ✅ Parse JSON safely
    const body = JSON.parse(bodyString);

    console.log("📦 Event:", body.event);

    const event = body.event;
    const payment = body.payload.payment.entity;

    const razorpayOrderId = payment.order_id;

    const order = await Order.findOne({ razorpayOrderId });

    if (!order) {
      return res.status(200).json({
        success: true,
        message: "Order not found",
      });
    }

    if (event === "payment.captured") {
      try {
        const phone = order.address?.snapshot?.phone;

        if (phone) {
          const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;

          await sendSMS(
            formattedPhone,
            `✅ Your order #${order._id} has been confirmed successfully.`,
          );
        }
      } catch (err) {
        console.error("SMS failed:", err.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Webhook processed",
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};

// exports.razorpayWebhook = async (req, res) => {
//   try {
//     console.log("🔥 Webhook called");

//     const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
//     const signature = req.headers["x-razorpay-signature"];

//     // ✅ Convert buffer to string
//     const bodyString = req.body.toString();

//     // ✅ Create expected signature
//     const expectedSignature = crypto
//       .createHmac("sha256", webhookSecret)
//       .update(bodyString)
//       .digest("hex");

//     // ❌ Signature mismatch (Postman will fail here — that’s OK)
//     if (expectedSignature !== signature) {
//       console.log("❌ Invalid signature");
//       return res.status(400).json({
//         success: false,
//         message: "Invalid webhook signature",
//       });
//     }

//     // ✅ Parse JSON safely
//     const body = JSON.parse(bodyString);

//     console.log("📦 Event:", body.event);

//     const event = body.event;
//     const payment = body.payload.payment.entity;

//     const razorpayOrderId = payment.order_id;
//     const razorpayPaymentId = payment.id;

//     const order = await Order.findOne({ razorpayOrderId });

//     if (!order) {
//       return res.status(200).json({
//         success: true,
//         message: "Order not found",
//       });
//     }

//     if (event === "payment.captured") {
//       if (order.paymentStatus === "Paid") {
//         return res.status(200).json({
//           success: true,
//           message: "Already processed",
//         });
//       }

//       // order.paymentStatus = "Paid";
//       // order.orderStatus = "Confirmed";
//       order.razorpayPaymentId = razorpayPaymentId;

//       // order.items.forEach((item) => {
//       //   if (item.itemStatus === "Pending") {
//       //     item.itemStatus = "Confirmed";
//       //   }
//       // });

//       // await order.save();
//       await createInvoiceIfNeeded(order._id);

//       try {
//         const phone = order.address?.snapshot?.phone;
//         if (phone) {
//           const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;

//           await sendSMS(
//             formattedPhone,
//             `✅ Your order #${order._id} has been confirmed successfully.`,
//           );
//         }
//       } catch (err) {
//         console.error("SMS failed:", err.message);
//       }
//     }

//     // if (event === "payment.failed") {
//     //   if (order.paymentStatus === "Paid") {
//     //     return res.status(200).json({
//     //       success: true,
//     //       message: "Order already paid, ignoring failed event",
//     //     });
//     //   }

//     //   // order.paymentStatus = "Failed";
//     //   // order.orderStatus = "Cancelled";

//     //   // order.items.forEach((item) => {
//     //   //   if (item.itemStatus === "Pending") {
//     //   //     item.itemStatus = "Cancelled";
//     //   //   }
//     //   // });

//     //   // await order.save();

//     //   const phone = order.address?.snapshot?.phone;
//     //   if (phone) {
//     //     const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;

//     //     await sendSMS(
//     //       formattedPhone,
//     //       ` Payment failed for order #${order._id}. Please try again.`,
//     //     );
//     //   }
//     // }

//     return res.status(200).json({
//       success: true,
//       message: "Webhook processed",
//     });
//   } catch (error) {
//     console.error("Webhook error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Webhook processing failed",
//     });
//   }
// };
