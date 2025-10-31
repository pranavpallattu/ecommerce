const { default: mongoose } = require("mongoose");
const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const Wallet = require("../../models/walletSchema");
const Product = require("../../models/productSchema");
const Coupon = require("../../models/couponSchema");

// At the top of your controller
const allowedItemStatuses = [
  "Pending",
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
  "Returned",
  "ReturnPending",
  "PartiallyReturned",
  "PartiallyCancelled",
  "ReturnRejected",
];

const CANCELLABLE_STATUSES = ["Pending", "Processing"];

exports.placeOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { paymentMethod, address, couponId, couponCode } = req.body;
    const user = req.user;

    // validate payment method
    if (!["cod", "wallet"].includes(paymentMethod)) {
      await session.abortTransaction();
      throw new Error("Invalid payment method");
    }

    if (!address?.addressId || !address?.snapshot) {
      await session.abortTransaction();
      throw new Error("Address is required");
    }

    // validate cart
    const cart = await Cart.findOne({ userId: user._id }).session(session);
    if (!cart || cart.items.length === 0) {
      await session.abortTransaction();

      throw new Error("Cart is empty");
    }

    const subTotal = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const discount = 0;
    const grandTotal = subTotal - discount;

    let walletUsed = 0;

    if (paymentMethod === "wallet") {
      const wallet = await Wallet.findOne({ userId: user._id }).session(
        session
      );
      if (!wallet || wallet.balance < grandTotal) {
        await session.abortTransaction();

        throw new Error("Insufficient wallet balance");
      }

      wallet.balance -= grandTotal;
      walletUsed = grandTotal;
      wallet.transactionHistory.push({
        type: "debit",
        amount: grandTotal,
        description: "Order payment",
      });
      await wallet.save({ session });
    }

    // stock deduction
    for (const item of cart.items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product || product.quantity < item.quantity) {
        await session.abortTransaction();

        throw new Error(`Low stock: ${item.productName}`);
      }

      product.quantity -= item.quantity;
      await product.save({ session });
    }

    const order = new Order({
      userId: user._id,
      items: cart.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity,
        itemStatus: paymentMethod === "cod" ? "Pending" : "Processing",
        paymentStatus: paymentMethod === "cod" ? "Pending" : "Paid",
      })),
      address: {
        addressId: address.addressId,
        snapshot: address.snapshot,
      },
      couponId: couponId || null,
      couponCode: couponCode || null,
      subTotal,
      discount,
      grandTotal,
      walletAmountUsed: walletUsed,
      paymentMethod,
      paymentStatus: paymentMethod === "cod" ? "Pending" : "Paid",
      orderStatus: paymentMethod === "cod" ? "Pending" : "Processing",
    });

    await order.save({ session });
    await Cart.deleteOne({ userId: user._id }).session(session);

    await session.commitTransaction();

    return res.json({
      success: true,
      message: "Order placed",
      orderId: order._id,
    });
  } catch (error) {
    await session.abortTransaction();

    return res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

exports.getUserOrders = async (req, res) => {
  try {
    const user = req.user;
    const orders = await Order.find({ userId: user._id })
      .populate("items.productId")
      .sort({ createdAt: -1 })
      .lean();

    if (orders.length === 0) {
      return res
        .status(200)
        .json({ success: true, message: "No orders found", data: [] });
    }
    return res.status(200).json({
      success: true,
      message: "Orders retrieved successfully",
      data: orders,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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

    const order = await Order.findOne({ _id: orderId, userId: user._id })
      .populate("items.productId")
      .lean();

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

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

    // Check if order-level cancellation is allowed
    if (!CANCELLABLE_STATUSES.includes(order.orderStatus)) {
      const statusMsg = {
        Shipped: "Order already shipped. Contact support.",
        Delivered: "Order already delivered.",
        Cancelled: "Order already cancelled.",
        Returned: "Order already returned.",
        ReturnPending: "Return in progress.",
        ReturnRejected: "Return rejected.",
      };

      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message:
          statusMsg[order.orderStatus] ||
          `Cannot cancel order in ${order.orderStatus} status`,
      });
    }

    if (order.orderStatus === "Cancelled") {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Order already cancelled" });
    }

    // update order

    order.orderStatus = "Cancelled";
    order.cancelledAt = new Date();
    order.cancelledReason = reason || "User requested cancellation";

    // Restore stock

    for (const item of order.items) {
      const product = await Product.findById(item.productId).session(session);
      if (product) {
        product.quantity += item.quantity;
        await product.save({ session });
      }
    }

    // maxrefundable amount for safety to prevent double refund money
    const totalProcessed = order.refunds
      .filter((r) => r.status === "Processed")
      .reduce((sum, r) => sum + r.amount, 0);

    const maxRefundable = order.grandTotal - totalProcessed;

    let refundAmount = 0;
    let refundRecord = null;

    // Handle wallet refund (immediate)
    if (order.paymentMethod === "wallet" && order.walletAmountUsed > 0) {
      refundAmount = Math.min(maxRefundable, order.walletAmountUsed);

      let wallet = await Wallet.findOne({ userId: user._id }).session(session);
      if (!wallet) {
        wallet = new Wallet({
          userId: user._id,
          balance: 0,
          transactionHistory: [],
        });
      }
      wallet.balance += refundAmount;
      wallet.transactionHistory.push({
        type: "credit",
        amount: refundAmount,
        description: `Refund for cancelled order #${order._id}`,
      });

      await wallet.save({ session });

      // Add refund record

      refundRecord = {
        refundId: `wallet_refund_${Date.now()}_${order._id}_${Math.random()
          .toString(36)
          .substring(2, 7)}`,
        amount: refundAmount,
        itemIds: order.items.map((i) => i._id),
        status: "Processed",
      };
    }

    // handle razorpay refund  to wallet

    if (order.paymentMethod === "razorpay" && order.grandTotal > 0) {
      refundAmount = Math.min(maxRefundable, order.grandTotal);

      let wallet = await Wallet.findOne({ userId: user._id }).session(session);
      if (!wallet) {
        wallet = new Wallet({
          userId: user._id,
          balance: 0,
          transactionHistory: [],
        });
      }
      wallet.balance += refundAmount;
      wallet.transactionHistory.push({
        type: "credit",
        amount: refundAmount,
        description: `Refund for cancelled order #${order._id}`,
      });

      await wallet.save({ session });

      // refund record
      refundRecord = {
        refundId: `razorpay_wallet_refund_${Date.now()}_${
          order._id
        }_${Math.random().toString(36).substring(2, 7)}`,
        amount: refundAmount,
        itemIds: order.items.map((i) => i._id),
        status: "Processed",
      };
    }

    const totalPaid =
      order.paymentMethod === "cod" ? 0 : order.grandTotal + totalProcessed;
    const totalRefunded = totalProcessed + (refundRecord?.amount || 0);

    if (totalPaid > 0 && totalRefunded >= totalPaid) {
      order.paymentStatus = "Refunded";
    } else if (totalRefunded > 0) {
      order.paymentStatus = "PartiallyRefunded";
    } else if (order.paymentMethod === "cod") {
      order.paymentStatus = "N/A";
    }
    // update refund record

    if (refundRecord) {
      // avoid duplicate push if refundId already exists
      const exists = order.refunds.some(
        (r) => r.refundId === refundRecord.refundId
      );
      if (!exists) order.refunds.push(refundRecord);
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
        refundAmount: refundAmount > 0 ? Number(refundAmount.toFixed(2)) : null,
        refundedTo: refundAmount > 0 ? "wallet" : null,
        refundId: refundRecord?.refundId || null,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("orderCancel error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel order",
    });
  } finally {
    session.endSession();
  }
};

exports.cancelSingleItem = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { orderId } = req.params;
    const { itemId, reason } = req.body;
    const user = req.user;

    // validate id
    if (
      !mongoose.Types.ObjectId.isValid(orderId) ||
      !mongoose.Types.ObjectId.isValid(itemId)
    ) {
      await session.abortTransaction();

      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    //find order

    const order = await Order.findOne({
      _id: orderId,
      userId: user._id,
    }).session(session);
    if (!order) {
      await session.abortTransaction();

      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Check if order-level cancellation is allowed
    if (!CANCELLABLE_STATUSES.includes(order.orderStatus)) {
      const statusMsg = {
        Shipped: "Order already shipped. Contact support.",
        Delivered: "Order already delivered.",
        Cancelled: "Order already cancelled.",
        Returned: "Order already returned.",
        ReturnPending: "Return in progress.",
        ReturnRejected: "Return rejected.",
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
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });
    }

    if (!CANCELLABLE_STATUSES.includes(item.itemStatus)) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Item cannot be cancelled" });
    }

    // update item
    item.itemStatus = "Cancelled";
    item.cancellationReason = reason || "User requested cancellation";

    // Restore stock
    const product = await Product.findById(item.productId).session(session);
    if (product) {
      product.quantity += item.quantity;
      await product.save({ session });
    }

    // save order -trigger pre-save method - recalculation
    const originalSubTotal = order.subTotal;
    await order.save({ session });

    // === 7. PRORATE DISCOUNT ===
    const itemRatio = item.subtotal / originalSubTotal;
    const proratedDiscount = itemRatio * order.discount;
    const baseRefund = Math.max(0, item.subtotal - proratedDiscount);

    // === CAP REFUND ===
    const totalProcessed = order.refunds
      .filter((refundRecord) => refundRecord.status === "Processed")
      .reduce((sum, refundRecord) => sum + refundRecord.amount, 0);

    const maxRefundable = order.grandTotal - totalProcessed;

    const refundAmount = Math.min(baseRefund, maxRefundable);

    let refundRecord = null;

    // Handle wallet refund (immediate)
    if (order.paymentMethod === "wallet" && order.walletAmountUsed > 0) {
      const walletProrated =
        (item.subtotal / originalSubTotal) * order.walletAmountUsed;
      const walletRefund = Math.min(
        walletProrated,
        order.walletAmountUsed - totalProcessed
      );

      await Wallet.findOneAndUpdate(
        { userId: user._id },
        {
          $inc: { balance: walletRefund },
          $push: {
            transactionHistory: {
              type: "credit",
              amount: walletRefund,
              description: `Refund for cancelled item #${item._id}`,
            },
          },
        },
        { upsert: true, new: true, session }
      );

      // Add refund record

      refundRecord = {
        refundId: `wallet_refund_${Date.now()}_${item._id}_${Math.random()
          .toString(36)
          .substring(2, 7)}`,
        amount: walletRefund,
        itemIds: [item._id],
        reason: reason || "User cancellation",
        status: "Processed",
      };
    }

    // handle razorpay refund  to wallet

    if (order.paymentMethod === "razorpay" && order.razorpayPaymentId) {
      await Wallet.findOneAndUpdate(
        { userId: user._id },
        {
          $inc: { balance: refundAmount },
          $push: {
            transactionHistory: {
              type: "credit",
              amount: refundAmount,
              description: `Refund for cancelled item #${item._id}`,
            },
          },
        },
        { upsert: true, new: true, session }
      );

      // Add refund record

      refundRecord = {
        refundId: `razorpay_wallet_refund_${Date.now()}_${
          item._id
        }_${Math.random().toString(36).substring(2, 7)}`,
        amount: refundAmount,
        itemIds: [item._id],
        reason: reason || "Instant wallet credit",
        status: "Processed",
      };
    }

    //If remaining items no longer meet coupon threshold, remove coupon
    if (order.couponId) {
      const coupon = await Coupon.findById(order.couponId).session(session);
      if (coupon && order.subTotal < coupon.minPurchase) {
        order.couponId = null;
        order.couponCode = null;
        order.discount = 0;
      }
    }

    const cancelledCount = order.items.filter(
      (item) => item.itemStatus === "Cancelled"
    ).length;
    const totalCount = order.items.length;

    if (cancelledCount === totalCount) {
      order.orderStatus = "Cancelled";
    } else if (cancelledCount > 0) {
      order.orderStatus = "PartiallyCancelled";
    }

    // update payment status
    const totalPaid = order.paymentMethod === "cod" ? 0 : order.grandTotal;
    const totalRefunded = totalProcessed + (refundRecord?.amount || 0);

    if (totalPaid > 0) {
      if (totalRefunded >= totalPaid) {
        order.paymentStatus = "Refunded";
      } else if (totalRefunded > 0 && totalRefunded < totalPaid) {
        order.paymentStatus = "PartiallyRefunded";
      }
    }

    if (order.paymentMethod === "cod") {
      order.paymentStatus = "N/A";
    }

    if (refundRecord) {
      // avoid duplicate push if refundId already exists
      const exists = order.refunds.some(
        (r) => r.refundId === refundRecord.refundId
      );
      if (!exists) order.refunds.push(refundRecord);
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
        cancelledItem: {
          productId: item.productId,
          name: item.productName,
          image: item.productImage,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.subtotal,
        },
        refundAmount: refundRecord
          ? Number(refundRecord.amount.toFixed(2))
          : null,
        refundedTo: refundRecord ? "wallet" : null,
        refundId: refundRecord?.refundId || null,
        orderStatus: order.orderStatus,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("cancelSingleItem error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel order",
    });
  } finally {
    await session.endSession();
  }
};

exports.orderReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const user = req.user;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    if (!reason || reason.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Return reason cannot be empty" });
    }

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

    if (order.orderStatus !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered orders can be returned",
      });
    }

    if (["Returned", "ReturnPending"].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: "Order already returned or return is pending",
      });
    }

    order.orderStatus = "ReturnPending";
    order.returnedReason = reason;

    await order.save();

    return res.status(201).json({
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
