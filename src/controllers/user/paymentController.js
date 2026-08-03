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
const { roundMoney } = require("../../utils/currency");

exports.createOrder = async (req, res) => {
  try {
    const { _id, name, emailId } = req.user;
    const cart = await Cart.findOne({ userId: _id });
    const amount = cart?.finalTotal;
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      });
    }

    const order = await razorpayInstance.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `receipt_${_id}`,
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
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Invalid signature, payment failed",
      });
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
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Cart is empty or not found",
      });
    }

    // validate sub total

    const calculatedSubTotal = roundMoney(
      cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    );
    let expectedDiscount = 0;

    if (orderDetails?.couponId) {
      if (!mongoose.Types.ObjectId.isValid(orderDetails.couponId)) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "Invalid coupon id format",
        });
      }

      const coupon = await Coupon.findById(orderDetails?.couponId).session(
        session,
      );

      if (!coupon || !coupon.isActive) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "Invalid or inactive coupon",
        });
      }

      if (coupon.expiryDate < new Date()) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "Coupon has expired",
        });
      }

      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        await session.abortTransaction();

        return res.status(409).json({
          success: false,
          message: "Coupon usage limit exceeded",
        });
      }

      if (calculatedSubTotal < coupon.minPurchase) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "Minimum purchase requirement not met",
        });
      }

      if (coupon.discountType === "percentage") {
        expectedDiscount = roundMoney(
          (calculatedSubTotal * coupon.discount) / 100,
        );
      } else if (coupon.discountType === "flat") {
        expectedDiscount = roundMoney(coupon.discount);
      }

      expectedDiscount = Math.min(expectedDiscount, calculatedSubTotal);
    }

    const expectedGrandTotal = roundMoney(
      calculatedSubTotal - expectedDiscount,
    );
    // Validate amounts
    if (
      calculatedSubTotal !== orderDetails?.subTotal ||
      expectedDiscount !== orderDetails?.discount ||
      expectedGrandTotal !== orderDetails?.grandTotal
    ) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Payment amount tampering detected",
      });
    }

    //  VALIDATE & DEDUCT STOCK
    const orderItems = [];

    for (const item of cart.items) {
      const product = await Product.findById(item.product).session(session);

      if (!product) {
        await session.abortTransaction();

        return res.status(404).json({
          success: false,
          message: "Product no longer exists",
        });
      }

      // Product availability check
      if (!product.isActive || product.deletedAt) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "Product is no longer available",
        });
      }

      if (!product || product.quantity < item.quantity) {
        await session.abortTransaction();

        return res.status(409).json({
          success: false,
          message: `Insufficient stock for ${product?.productName || "product"}`,
        });
      }

      // deduct stock
      product.quantity -= item.quantity;
      await product.save({ session });

      // build order item snapshot
      orderItems.push({
        productId: product._id,
        productName: product.productName, //
        productImage: product.productImage[0]?.imageUrl || null,
        quantity: item.quantity,
        price: item.price,
        subtotal: roundMoney(item.price * item.quantity),
        itemStatus: "Confirmed",
      });
    }

    // save order
    const order = new Order({
      userId: user._id,
      items: orderItems,
      address: {
        addressId: orderDetails.address.addressId,
        snapshot: orderDetails.address.snapshot,
      },
      checkoutType: "cart",
      couponId: orderDetails?.couponId,
      couponCode: orderDetails?.couponCode || null,
      subTotal: calculatedSubTotal,
      discount: expectedDiscount || 0,
      grandTotal: expectedGrandTotal,
      paymentMethod: "razorpay",
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      paymentStatus: "Paid",
      orderStatus: "Confirmed",
    });

    await order.save({ session });

    // increment coupon usage after successful order creation
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
    try {
      await createInvoiceIfNeeded(order._id);
    } catch (err) {
      console.error("Invoice generation failed:", err.message);
    }
    return res.status(200).json({
      success: true,
      message: "Payment verified & order saved",
      orderId: order._id,
    });
  } catch (error) {
    await session.abortTransaction();

    console.error("verifyPayment error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
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

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      });
    }

    const order = await razorpayInstance.orders.create({
      amount: Math.round(amount * 100),
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
  await session.startTransaction();

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      buyNowId,
      address,
    } = req.body;

    const user = req.user;
    const userId = user._id;

    // Verify Razorpay signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Invalid signature, payment failed",
      });
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

    //  Fetch BuyNow
    const buyNow = await BuyNow.findOne({
      _id: buyNowId,
      userId,
      status: "ACTIVE",
    })
      .populate("product.productId")
      .populate("appliedCoupon")
      .session(session);

    if (!buyNow) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Buy Now session expired",
      });
    }
    const product = buyNow.product.productId;
    const quantity = buyNow.quantity;

    if (buyNow.appliedCoupon) {
      const coupon = buyNow.appliedCoupon;

      if (!coupon.isActive) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "Coupon is inactive",
        });
      }

      if (coupon.expiryDate < new Date()) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "Coupon has expired",
        });
      }

      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        await session.abortTransaction();

        return res.status(409).json({
          success: false,
          message: "Coupon usage limit exceeded",
        });
      }

      if (buyNow.subTotal < coupon.minPurchase) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: `Minimum purchase of ₹${coupon.minPurchase} required`,
        });
      }
    }

    //     console.log({
    //   productPrice: product.price,
    //   buyNowProductPrice: buyNow.product.price,
    //   quantity,
    //   couponDiscount: buyNow.appliedCoupon?.discount,
    //   discountType: buyNow.appliedCoupon?.discountType,
    // });

    let expectedDiscount = 0;

    if (buyNow.appliedCoupon) {
      if (buyNow.appliedCoupon.discountType === "percentage") {
        expectedDiscount = roundMoney(
          (buyNow.product.price * quantity * buyNow.appliedCoupon.discount) /
            100,
        );
      } else {
        expectedDiscount = roundMoney(buyNow.appliedCoupon.discount);
      }

      expectedDiscount = Math.min(
        expectedDiscount,
        buyNow.product.price * quantity,
      );
    }

    const expectedSubTotal = roundMoney(buyNow.product.price * quantity);
    const expectedGrandTotal = roundMoney(expectedSubTotal - expectedDiscount);

    //     console.log({
    //   expectedSubTotal,
    //   buyNowSubTotal: buyNow.subTotal,

    //   expectedDiscount,
    //   buyNowDiscount: buyNow.discount,

    //   expectedGrandTotal,
    //   buyNowGrandTotal: buyNow.finalTotal,
    // });
    if (
      expectedSubTotal !== roundMoney(buyNow.subTotal) ||
      expectedDiscount !== roundMoney(buyNow.discount) ||
      expectedGrandTotal !== roundMoney(buyNow.finalTotal)
    ) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Payment amount tampering detected",
      });
    }

    //  Stock check
    if (product.quantity < quantity) {
      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message: "Insufficient stock",
      });
    }

    //  Deduct stock
    product.quantity -= quantity;
    await product.save({ session });

    //  Create Order
    const order = new Order({
      userId,
      items: [
        {
          productId: product._id,
          productName: product.productName,
          productImage: product.productImage?.[0]?.imageUrl || null,
          quantity,
          price: buyNow.product.price,
          subtotal: roundMoney(buyNow.product.price * quantity),
          itemStatus: "Confirmed",
        },
      ],
      address,
      checkoutType: "buyNow",
      couponId: buyNow.appliedCoupon?._id || null,
      couponCode: buyNow.appliedCoupon?.code || null,
      subTotal: expectedSubTotal,
      discount: expectedDiscount,
      grandTotal: expectedGrandTotal,
      paymentMethod: "razorpay",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      paymentStatus: "Paid",
      orderStatus: "Confirmed",
    });

    await order.save({ session });

    if (buyNow.appliedCoupon) {
      await Coupon.findByIdAndUpdate(
        buyNow.appliedCoupon._id,
        { $inc: { usedCount: 1 } },
        { session },
      );

      if (!user.usedCoupons) {
        user.usedCoupons = [];
      }

      user.usedCoupons.push(buyNow.appliedCoupon._id);

      await user.save({ session });
    }

    //  Mark BuyNow completed
    buyNow.status = "COMPLETED";
    await buyNow.save({ session });

    await session.commitTransaction();

    try {
      await createInvoiceIfNeeded(order._id);
    } catch (err) {
      console.error("Invoice generation failed:", err.message);
    }
    res.status(200).json({
      success: true,
      message: "Buy Now order placed successfully",
      orderId: order._id,
    });
  } catch (error) {
    await session.abortTransaction();

    console.error("verifyBuyNowPayment error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    await session.endSession();
  }
};

exports.razorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    //  Convert buffer to string
    const bodyString = req.body.toString();

    //  Create expected signature
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(bodyString)
      .digest("hex");

    //  Signature mismatch
    if (expectedSignature !== signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    // Parse JSON safely
    const body = JSON.parse(bodyString);

    console.log("Event:", body.event);

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
