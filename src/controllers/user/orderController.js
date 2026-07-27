const { default: mongoose } = require("mongoose");
const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const Wallet = require("../../models/walletSchema");
const Product = require("../../models/productSchema");
const Coupon = require("../../models/couponSchema");
const crypto = require("crypto");
const BuyNow = require("../../models/buynowSchema");
const { createInvoiceIfNeeded } = require("./invoiceController");
const getOrderDateRange = require("../../utils/getOrderDateRange");
const { roundMoney } = require("../../utils/currency");
const refreshCheckoutCoupon = require("../../utils/refreshCheckoutCoupon");

const ORDER_CANCELLABLE_STATUSES = ["Pending", "Confirmed", "Processing"];

const ITEM_CANCELLABLE_STATUSES = [
  "Pending",
  "Confirmed",
  "Processing",
  "PartiallyCancelled",
];

const ORDER_STATUS_GROUPS = {
  "On the way": ["Confirmed", "Processing", "Shipped"],
  Delivered: ["Delivered"],
  Cancelled: ["Cancelled", "PartiallyCancelled"],
  Returned: [
    "Returned",
    "PartiallyReturned",
    "ReturnPending",
    "PartiallyReturnPending",
    "ReturnRejected",
    "PartiallyReturnRejected",
  ],
};

exports.placeOrder = async (req, res) => {
  const session = await mongoose.startSession();
  await session.startTransaction();
  try {
    const { paymentMethod, address, couponId, couponCode } = req.body;

    const user = req.user;

    // validate payment method
    if (!["cod", "wallet"].includes(paymentMethod)) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    // validate address
    if (!address?.addressId || !address?.snapshot) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Address is required",
      });
    }

    // validate cart
    const cart = await Cart.findOne({ userId: user._id }).session(session);
    if (!cart || cart.items.length === 0) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    const subTotal = roundMoney(
      cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    );
    let discount = 0;
    let validCouponId = null;
    let validCouponCode = null;

    if (couponId) {
      const coupon = await Coupon.findById(couponId).session(session);

      if (!coupon) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "Invalid coupon",
        });
      }

      // Check if coupon is active
      if (!coupon.isActive) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "Coupon is not active",
        });
      }

      // Check expiry
      if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "Coupon has expired ",
        });
      }

      // Check minimum purchase
      if (subTotal < coupon.minPurchase) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: `Minimum purchase of ₹${coupon.minPurchase} required to use this coupon`,
        });
      }

      // Check usage limit (if applicable)
      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: " Coupon usage limit exceeded",
        });
      }

      // Calculate discount
      if (coupon.discountType === "percentage") {
        discount = roundMoney((subTotal * coupon.discount) / 100);
      } else if (coupon.discountType === "flat") {
        discount = roundMoney(coupon.discount);
      }

      // Ensure discount doesn't exceed subtotal
      discount = Math.min(discount, subTotal);

      validCouponId = coupon._id;
      validCouponCode = coupon.code;
    }

    const grandTotal = roundMoney(subTotal - discount);

    let walletUsed = 0;

    if (paymentMethod === "wallet") {
      const wallet = await Wallet.findOne({ userId: user._id }).session(
        session,
      );
      if (!wallet || wallet.balance < grandTotal) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "Insufficient wallet balance",
        });
      }
      wallet.balance = roundMoney(wallet.balance - grandTotal);
      walletUsed = grandTotal;
      wallet.transactionHistory.push({
        type: "debit",
        amount: grandTotal,
        description: "Order payment",
      });
      await wallet.save({ session });
    }

    // Step 1: Validate ALL products first
    for (const item of cart.items) {
      const product = await Product.findById(item.product).session(session);
      if (!product) {
        await session.abortTransaction();

        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productName}`,
        });
      }
      if (product.quantity < item.quantity) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${item.productName}. Only ${product.quantity} available.`,
        });
      }
    }

    // Step 2: Deduct stock for ALL products (after validation)
    for (const item of cart.items) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { quantity: -item.quantity } },
        { session },
      );
    }

    await cart.populate("items.product");

    const order = new Order({
      userId: user._id,
      items: cart.items.map((item) => ({
        productId: item.product,
        productName: item.product.productName,
        productImage: item.productImage,
        quantity: item.quantity,
        price: item.price,
        subtotal: roundMoney(item.price * item.quantity),
        itemStatus: "Confirmed",
      })),
      address: {
        addressId: address.addressId,
        snapshot: address.snapshot,
      },
      checkoutType: "cart",
      couponId: couponId || null,
      couponCode: couponCode || null,
      subTotal,
      discount,
      grandTotal,
      walletAmountUsed: walletUsed,
      paymentMethod,
      paymentStatus: paymentMethod === "cod" ? "Pending" : "Paid",
      orderStatus: "Confirmed",
    });

    await order.save({ session });

    //  increment usedcount of coupon

    if (validCouponId) {
      await Coupon.findByIdAndUpdate(
        validCouponId,
        { $inc: { usedCount: 1 } },
        { session },
      );

      //  add coupon in users usedcoupons array
      if (!user.usedCoupons) {
        user.usedCoupons = [];
      }

      user.usedCoupons.push(validCouponId);

      await user.save({ session });
    }
    await Cart.deleteOne({ userId: user._id }).session(session);

    await session.commitTransaction();

    try {
      await createInvoiceIfNeeded(order._id);
    } catch (err) {
      console.error("Invoice generation failed:", err.message);
    }

    return res.json({
      success: true,
      message: "Order placed",
      orderId: order._id,
    });
  } catch (error) {
    await session.abortTransaction();

    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    session.endSession();
  }
};

exports.placeBuyNowOrder = async (req, res) => {
  const session = await mongoose.startSession();
  await session.startTransaction();

  try {
    const { buyNowId, paymentMethod, address } = req.body;
    const user = req.user;
    const userId = user._id;

    // Validate payment
    if (!["cod", "wallet"].includes(paymentMethod)) {
      await session.abortTransaction();

      return res
        .status(400)
        .json({ success: false, message: "Invalid payment method" });
    }

    // Validate address
    if (!address?.addressId || !address?.snapshot) {
      await session.abortTransaction();

      return res
        .status(422)
        .json({ success: false, message: "Address required" });
    }

    // Get BuyNow data
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

    await refreshCheckoutCoupon(buyNow);

    await buyNow.save({
      session,
    });

    const subTotal = buyNow.subTotal;

    const discount = buyNow.discount;

    const grandTotal = buyNow.finalTotal;

    const quantity = buyNow.quantity;

    // Wallet payment
    let walletUsed = 0;
    if (paymentMethod === "wallet") {
      const wallet = await Wallet.findOne({ userId }).session(session);

      if (!wallet || wallet.balance < grandTotal) {
        await session.abortTransaction();

        return res.status(402).json({
          success: false,
          message: "Insufficient wallet balance",
        });
      }

      wallet.balance = roundMoney(wallet.balance - grandTotal);
      walletUsed = grandTotal;

      wallet.transactionHistory.push({
        type: "debit",
        amount: grandTotal,
        description: "Buy Now Order Payment",
      });

      await wallet.save({ session });
    }

    const product = buyNow.product.productId;

    // Product existence check
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

    // Stock check
    if (product.quantity < quantity) {
      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message: "Insufficient stock",
      });
    }

    // Deduct stock
    await Product.findByIdAndUpdate(
      product._id,
      { $inc: { quantity: -quantity } },
      { session },
    );

    // Create order
    const order = new Order({
      userId,
      items: [
        {
          productId: product._id,
          productName: buyNow.product.name,
          productImage: buyNow.product.image,
          quantity,
          price: buyNow.product.price,
          subtotal: subTotal,
          itemStatus: "Confirmed",
        },
      ],
      address,
      checkoutType: "buyNow",
      subTotal,
      couponId: buyNow.appliedCoupon?._id || null,
      couponCode: buyNow.appliedCoupon?.code || null,
      discount,
      grandTotal,
      walletAmountUsed: walletUsed,
      paymentMethod,
      paymentStatus: paymentMethod === "cod" ? "Pending" : "Paid",
      orderStatus: "Confirmed",
    });

    await order.save({ session });
    if (buyNow.appliedCoupon) {
      user.usedCoupons.push(buyNow.appliedCoupon._id);
      await user.save({ session });
    }
    if (buyNow.appliedCoupon) {
      const updatedCoupon = await Coupon.findOneAndUpdate(
        {
          _id: buyNow.appliedCoupon._id,
          usedCount: { $lt: buyNow.appliedCoupon.usageLimit },
        },
        {
          $inc: { usedCount: 1 },
        },
        {
          new: true,
          session,
        },
      );

      if (!updatedCoupon) {
        await session.abortTransaction();

        return res.status(409).json({
          success: false,
          message: "Coupon has reached its usage limit",
        });
      }
    }
    //  BuyNow session completed
    await BuyNow.findByIdAndUpdate(
      buyNowId,
      { status: "COMPLETED" },
      { session },
    );
    await session.commitTransaction();

    try {
      await createInvoiceIfNeeded(order._id);
    } catch (err) {
      console.error("Invoice generation failed:", err.message);
    }

    return res.status(200).json({
      success: true,
      message: "Buy Now order placed",
      orderId: order._id,
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

exports.getUserOrders = async (req, res) => {
  try {
    const user = req.user;
    const { search = "", status = "", time = "" } = req.query;

    const query = { userId: user._id };

    // flatmap - split() splits the string and create an array. flatmap maps through the array and flats it(no nested arrays)
    if (status) {
      const mappedStatuses = status
        .split(",")
        .flatMap((s) => ORDER_STATUS_GROUPS[s] || []);
      if (mappedStatuses.length) {
        // $in - eturn all orders where orderStatus is any one of these values.
        query.orderStatus = { $in: mappedStatuses };
      }
    }

    //  map(functionName)
    // map() loops through every element of an array, calls the function for each element, and returns a NEW array containing the function's return values.

    // Syntax

    // array.map(function)

    // is equivalent to

    // array.map((element) => function(element))
    if (time) {
      // dateConditions array with functions date query return values
      // filter(Boolean) → Removes all falsy values (null, undefined, false, 0, "", NaN) and keeps only truthy values. remove any null values returned by getOrderDateRange().
      const dateConditions = time
        .split(",")
        .map(getOrderDateRange)
        .filter(Boolean);
      if (dateConditions.length) {
        // $or Return documents that satisfy any one of these conditions.
        query.$or = dateConditions;
      }
    }

    let orders = await Order.find(query)
      .populate("items.productId")
      .sort({ createdAt: -1 })
      .lean();

    if (search.trim()) {
      const keyword = search.trim().toLowerCase();

      orders = orders.filter((order) =>
        order.items.some((item) => {
          const name =
            item.productName ||
            item.productId?.productName ||
            item.productId?.name ||
            "";

          return name.toLowerCase().includes(keyword);
        }),
      );
    }

    return res.status(200).json({
      success: true,
      message: orders.length
        ? "Orders retrieved successfully"
        : "No orders found",
      data: orders,
    });
  } catch (error) {
    console.error("Error fetching user orders:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.getSingleOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const user = req.user;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }
    const order = await Order.findOne({
      _id: orderId,
      userId: user._id,
    })
      .populate("items.productId")
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Add product details for each refund
    order.refunds = order.refunds.map((refund) => ({
      ...refund,
      products: refund.itemIds
        .map((itemId) => {
          const item = order.items.find(
            (i) => i._id.toString() === itemId.toString(),
          );

          return item
            ? {
                itemId: item._id,
                productId: item.productId._id,
                productName: item.productName,
                quantity: item.quantity,
                subtotal: item.subtotal,
              }
            : null;
        })
        .filter(Boolean),
    }));

    return res.status(200).json({
      success: true,
      message: `Order details of ${order._id}`,
      data: order,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.orderCancel = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const user = req.user;

    // validate Id
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    // Add validation early
    if (reason && reason.length > 500) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Cancellation reason too long (max 500 characters)",
      });
    }

    //  find order
    const order = await Order.findOne({
      _id: orderId,
      userId: user._id,
    }).session(session);

    if (!order) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // After finding order
    if (!order.items || order.items.length === 0) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Order has no items to cancel",
      });
    }

    // Check if order-level cancellation is allowed
    if (!ORDER_CANCELLABLE_STATUSES.includes(order.orderStatus)) {
      const statusMsg = {
        Shipped: "Order already shipped. Contact support.",
        Delivered: "Order already delivered.",
        Cancelled: "Order already cancelled.",
        Returned: "Order already returned.",
        ReturnPending: "Return in progress.",
        ReturnRejected: "Return rejected.",
        PartiallyCancelled: "Order already in partially cancelled state",
        PartiallyReturnPending: "Some items have return requests in progress.",
      };

      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message:
          statusMsg[order.orderStatus] ||
          `Cannot cancel order in ${order.orderStatus} status`,
      });
    }

    const invalidItem = order.items.find(
      (item) =>
        item.itemStatus !== "Cancelled" &&
        !ORDER_CANCELLABLE_STATUSES.includes(item.itemStatus),
    );

    if (invalidItem) {
      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message: `Cannot cancel order because item "${invalidItem.productName}" is ${invalidItem.itemStatus}`,
      });
    }

    const itemsToCancel = order.items.filter((item) =>
      ORDER_CANCELLABLE_STATUSES.includes(item.itemStatus),
    );

    if (itemsToCancel.length === 0) {
      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message: "No cancellable items found in this order.",
      });
    }

    // update order

    order.orderStatus = "Cancelled";
    order.cancelledAt = new Date();
    order.cancellationReason = reason?.trim() || "User requested cancellation";

    // status change only in non cancelled items
    itemsToCancel.forEach((item) => {
      item.itemStatus = "Cancelled";
      item.cancelledAt = new Date();
    });

    // Restore stock

    // only restore product that were not cancelled
    await Promise.all(
      itemsToCancel.map(async (item) => {
        const product = await Product.findById(item.productId).session(session);
        if (!product) {
          const err = new Error(`Product not found: ${item.productId}`);
          err.statusCode = 404;
          throw err;
        }
        product.quantity += item.quantity;
        await product.save({ session });
      }),
    );

    // maxrefundable amount for safety to prevent double refund money
    const totalProcessed = roundMoney(
      order.refunds
        .filter((r) => r.status === "Processed")
        .reduce((sum, r) => sum + r.amount, 0),
    );

    const maxRefundable = roundMoney(order.grandTotal - totalProcessed);
    let refundAmount = 0;
    let refundRecord = null;

    if (order.paymentMethod === "cod") {
      refundAmount = 0;
      order.paymentStatus = "N/A";
    } else {
      refundAmount = roundMoney(Math.min(maxRefundable, order.grandTotal));

      if (refundAmount <= 0) {
        await session.abortTransaction();

        return res.status(409).json({
          success: false,
          message: "No refundable amount available",
        });
      }

      const walletUpdate = await Wallet.findOneAndUpdate(
        { userId: user._id },
        {
          $inc: { balance: refundAmount },
          $push: {
            transactionHistory: {
              type: "credit",
              amount: refundAmount,
              description: `Refund for Cancelled order #${order._id}`,
            },
          },
        },
        { upsert: true, new: true, session },
      );

      if (!walletUpdate) {
        await session.abortTransaction();

        return res.status(500).json({
          success: false,
          message: "Failed to update wallet balance",
        });
      }

      refundRecord = {
        refundId: `refund_${crypto.randomUUID()}`,
        amount: refundAmount,
        reason: order.cancellationReason,
        itemIds: order.items.map((i) => i._id),
        status: "Processed",
      };

      order.refunds.push(refundRecord);
    }

    const totalPaid = order.grandTotal;
    const totalRefunded = roundMoney(
      order.refunds
        .filter((r) => r.status === "Processed")
        .reduce((sum, r) => sum + r.amount, 0),
    );

    if (totalRefunded >= totalPaid) {
      order.paymentStatus = "Refunded";
    } else if (totalRefunded > 0) {
      order.paymentStatus = "PartiallyRefunded";
    }

    // save order
    await order.save({ session });

    // commit transaction

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      data: {
        orderId: order._id,
        refundAmount: refundAmount,
        refundedTo: refundAmount > 0 ? "wallet" : null,
        refundId: refundRecord?.refundId || null,
        paymentStatus: order.paymentStatus,
        totalRefunded: totalRefunded,
      },
    });
  } catch (error) {
    await session.abortTransaction();

    console.error("orderCancel error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    await session.endSession();
  }
};

exports.cancelSingleItem = async (req, res) => {
  const session = await mongoose.startSession();
  await session.startTransaction();
  try {
    const { orderId, itemId } = req.params;
    const { cancellationReason } = req.body;

    const user = req.user;

    // validate orderid and itemid
    if (
      !mongoose.Types.ObjectId.isValid(orderId) ||
      !mongoose.Types.ObjectId.isValid(itemId)
    ) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Invalid orderId or itemId",
      });
    }

    // validate reason
    if (cancellationReason && cancellationReason.length > 500) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Cancellation reason too long (max 500 characters)",
      });
    }

    //find order
    const order = await Order.findOne({
      _id: orderId,
      userId: user._id,
    }).session(session);
    if (!order) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order-level cancellation is allowed
    if (!ITEM_CANCELLABLE_STATUSES.includes(order.orderStatus)) {
      const statusMsg = {
        Shipped: "Order already shipped. Contact support.",
        Delivered: "Order already delivered.",
        Cancelled: "Order already cancelled.",
        Returned: "Order already returned.",
        ReturnPending: "Return in progress.",
        ReturnRejected: "Return rejected.",
        PartiallyReturnPending: "Some items have return requests in progress.",
      };

      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: statusMsg[order.orderStatus] || "Cannot cancel item",
      });
    }

    // find item
    const item = order.items.id(itemId);
    if (!item) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    // check if item level cancellation is allowed
    if (!ITEM_CANCELLABLE_STATUSES.includes(item.itemStatus)) {
      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message: "Item cannot be cancelled",
      });
    }

    //CAPTURE ORIGINAL VALUES (BEFORE ANY CHANGES)
    // - After you save the order, pre-save hook recalculates totals
    // - You need original values to calculate correct refund amount
    // - Without this, refund calculations would be wrong
    const originalSubTotal = Number(order.subTotal);
    const originalGrandTotal = Number(order.grandTotal);
    const originalDiscount = Number(order.discount);

    // update item
    item.itemStatus = "Cancelled";
    item.cancellationReason =
      cancellationReason?.trim() || "User requested cancellation";
    item.cancelledAt = new Date();

    // Restore stock
    const product = await Product.findById(item.productId).session(session);
    if (!product) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    product.quantity += item.quantity;
    await product.save({ session });

    //Check Coupon Validity (Before Save)
    const newSubTotal = roundMoney(originalSubTotal - item.subtotal);
    //If remaining items no longer meet coupon minimum purchase amount, remove coupon
    if (order.couponId) {
      const coupon = await Coupon.findById(order.couponId).session(session);
      if (coupon && newSubTotal < coupon.minPurchase) {
        order.couponId = null;
        order.couponCode = null;
        order.discount = 0;
      }
    }

    //count total items cancelled & total items
    const cancelledCount = order.items.filter(
      (item) => item.itemStatus === "Cancelled",
    ).length;
    const totalCount = order.items.length;

    // update order status and save order
    if (cancelledCount === totalCount) {
      order.orderStatus = "Cancelled";

      //  Set order-level cancellation reason safely
      order.cancellationReason = "Order cancelled due to item cancellations";
      order.cancelledAt = new Date();
    } else if (cancelledCount > 0) {
      order.orderStatus = "PartiallyCancelled";
    }

    // PRORATE DISCOUNT
    const itemRatio = item.subtotal / originalSubTotal;
    const proratedDiscount = roundMoney(itemRatio * originalDiscount);
    const itemRefundAmount = roundMoney(item.subtotal - proratedDiscount);
    // CAP REFUND
    const totalProcessed = roundMoney(
      order.refunds
        .filter((r) => r.status === "Processed")
        .reduce((sum, r) => sum + r.amount, 0),
    );

    const maxRefundable = roundMoney(originalGrandTotal - totalProcessed);

    const actualRefundAmount = roundMoney(
      Math.min(itemRefundAmount, maxRefundable),
    );
    let refundRecord = null;

    // Refund cod
    if (order.paymentMethod === "cod") {
      if (order.orderStatus === "Cancelled") {
        order.paymentStatus = "N/A";
      } else {
        order.paymentStatus = "Pending";
      }
      // COD: No refund needed
      refundRecord = null;
    }
    // Add refund amount to wallet for both wallet and razorpay payment
    else {
      if (actualRefundAmount > 0) {
        const walletUpdate = await Wallet.findOneAndUpdate(
          { userId: user._id },
          {
            $inc: { balance: actualRefundAmount },
            $push: {
              transactionHistory: {
                type: "credit",
                amount: actualRefundAmount,
                description: `Refund for cancelled item #${item._id}`,
              },
            },
          },
          { upsert: true, new: true, session },
        );

        if (!walletUpdate) {
          await session.abortTransaction();

          return res.status(500).json({
            success: false,
            message: "Failed to update wallet balance",
          });
        }

        // Add refund record
        refundRecord = {
          refundId: `refund_${crypto.randomUUID()}`,
          amount: actualRefundAmount,
          itemIds: [item._id],
          reason: cancellationReason || "User cancellation",
          status: "Processed",
        };
      }
    }

    if (refundRecord) {
      order.refunds.push(refundRecord);
    }

    // update payment status
    if (order.paymentMethod !== "cod") {
      const totalRefunded = roundMoney(
        order.refunds
          .filter((r) => r.status === "Processed")
          .reduce((sum, r) => sum + r.amount, 0),
      );

      if (totalRefunded >= originalGrandTotal) {
        order.paymentStatus = "Refunded";
      } else if (totalRefunded > 0) {
        order.paymentStatus = "PartiallyRefunded";
      }
    }

    // 14. Save order
    await order.save({ session });

    // 15. Commit transaction
    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Item cancelled successfully",
      data: {
        orderId: order._id,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,

        cancelledItem: {
          productId: item.productId,
          name: item.productName,
          image: item.productImage,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.subtotal,
        },
        refundAmount: refundRecord?.amount ?? null,
        refundedTo: refundRecord ? "wallet" : null,
        refundId: refundRecord?.refundId || null,
      },
    });
  } catch (error) {
    await session.abortTransaction();

    console.error("cancelSingleItem error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    await session.endSession();
  }
};

exports.orderReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { returnReason } = req.body;
    const user = req.user;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    // validate reason
    if (!returnReason || returnReason.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Return reason cannot be empty" });
    }

    // find order
    const order = await Order.findOne({
      _id: orderId,
      userId: user._id,
    }).populate("items.productId");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const returnStates = [
      "Returned",
      "PartiallyReturned",
      "ReturnPending",
      "PartiallyReturnPending",
      "ReturnRejected",
      "PartiallyReturnRejected",
    ];

    if (returnStates.includes(order.orderStatus)) {
      return res.status(409).json({
        success: false,
        message: `Order is already in ${order.orderStatus} state`,
      });
    }

    // check if order status is not delivered
    if (order.orderStatus !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered orders can be returned",
      });
    }

    const invalidItem = order.items.find(
      (item) => item.itemStatus !== "Delivered",
    );

    if (invalidItem) {
      return res.status(409).json({
        success: false,
        message:
          "All items must be delivered before requesting an order return",
      });
    }

    // update item and order status
    for (const item of order.items) {
      item.itemStatus = "ReturnPending";
      item.returnRequestedAt = new Date();
    }
    order.orderStatus = "ReturnPending";
    order.returnReason = returnReason;

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Return request submitted successfully",
      data: {
        orderId: order._id,
        orderStatus: order.orderStatus,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to return order",
    });
  }
};

exports.itemReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { returnReason } = req.body;
    const user = req.user;

    // validate orderId and itemId
    if (
      !mongoose.Types.ObjectId.isValid(orderId) ||
      !mongoose.Types.ObjectId.isValid(itemId)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order or item id" });
    }

    // validate reason
    if (!returnReason || returnReason.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Return reason cannot be empty" });
    }

    // find order
    const order = await Order.findOne({
      _id: orderId,
      userId: user._id,
    }).populate("items.productId");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // find item
    const item = order.items.id(itemId);
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found in order" });
    }

    // check is itemstatus is already returned or in return pending state
    // partiallyreturnpending not included so user can retry return of the same item
    if (["Returned", "ReturnPending"].includes(item.itemStatus)) {
      return res.status(400).json({
        success: false,
        message: "Item already returned or return is pending",
      });
    }

    // check is item status not delivered
    if (item.itemStatus !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered items can be returned",
      });
    }

    // update item status
    item.itemStatus = "ReturnPending";
    item.returnReason = returnReason;
    item.returnRequestedAt = new Date();

    const pendingCount = order.items.filter(
      (item) => item.itemStatus === "ReturnPending",
    ).length;

    if (pendingCount === order.items.length) {
      order.orderStatus = "ReturnPending";
      order.returnReason ??= "All items requested for return";
    } else if (pendingCount > 0) {
      order.orderStatus = "PartiallyReturnPending";
    }
    // Save order
    await order.save();

    return res.status(200).json({
      success: true,
      message: "Return request submitted successfully",
      data: {
        orderId: order._id,
        itemId: item._id,
        itemStatus: item.itemStatus,
      },
    });
  } catch (error) {
    console.error("Return item error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process item return",
    });
  }
};
