const { default: mongoose } = require("mongoose");
const Order = require("../models/orderSchema");
const Product = require("../models/productSchema");
const User = require("../models/userSchema");
const Wallet = require("../models/walletSchema");
const crypto = require("crypto");

exports.listOrders = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 5;
    limit = limit > 5 ? 5 : limit;
    const skip = (page - 1) * limit;

    let query = {};

    if (search.trim() !== "") {
      const regex = new RegExp(search, "i");

      // find users and products that matches the search
      const [userIds, productIds] = await Promise.all([
        User.find({ $or: [{ name: regex }, { emailId: regex }] }).distinct(
          "_id"
        ),
        Product.find({ productName: regex }).distinct("_id"),
      ]);

      // Build query for orders that belong to matching users or contain matching products

      query = {
        $or: [
          { userId: { $in: userIds } },
          { "items.productId": { $in: productIds } },
        ],
      };
    }

    const [orders, totalOrders] = await Promise.all([
      Order.find(query)
        .populate("userId", "name emailId")
        .populate("items.productId", "productName  price")
        .select("userId items grandTotal paymentMethod orderStatus createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),

      Order.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: orders,
      pagination: {
        totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
        currentPage: parseInt(page),
      },
    });
  } catch (error) {
    console.error("Error fetching orders", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.viewOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json({ success: fale, message: "Invalid orderId" });
    }

    const order = await Order.findById(orderId)
      .populate("userId", "name emailId")
      .populate("items.productId", "productName productImage price");
    if (!order) {
      return res
        .status(409)
        .json({ success: false, message: "Order not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      data: order,
    });
  } catch (error) {
    console.error("Error fetching order", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.orderStatus = async (req, res) => {
  const STATUS_TRANSITIONS = {
    Processing: ["Shipped", "Cancelled"],
    Shipped: ["Delivered", "Cancelled"],
    Delivered: ["Cancelled"],
    PartiallyCancelled: ["Shipped", "Cancelled"],
    Cancelled: [],
  };
  // const DEFAULT_STATUS = "Processing";

  const CANCELLABLE_ITEM_STATUSES = ["Processing", "Shipped"];

  const NON_CANCELLABLE_ITEM_STATUSES = [
    "Delivered",
    "Cancelled",
    "ReturnPending",
    "Returned",
    "ReturnRejected",
  ];

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Invalid orderId" });
    }

    const validStatuses = Object.keys(STATUS_TRANSITIONS);
    if (!status || !validStatuses.includes(status)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid status. Status must be one of ${validStatuses.join(
          ", "
        )} `,
      });
    }

    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // prevent same status
    if (order.orderStatus === status) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: `Order is already ${status}` });
    }

    const statusAllowedNext = STATUS_TRANSITIONS[order.orderStatus] || [];
    if (!statusAllowedNext.includes(status)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Cannot change from ${order.orderStatus} to ${status}`,
      });
    }

    if (status === "Delivered") {
      order.deliveredAt = new Date();
      order.paymentStatus = "Paid";
      for (const item of order.items) {
        if (item.itemStatus !== "Cancelled") {
          item.itemStatus = "Delivered";
          item.deliveredAt = new Date();
        }
      }
    }

    let refundAmount = 0;
    let refundRecord = null;

    // 7. === CANCELLATION: RESTORE STOCK + REFUND ===
    if (status === "Cancelled" && order.orderStatus !== "Cancelled") {
      // Calculate max refundable

      const totalProcessed = order.refunds
        .filter((refundRecord) => refundRecord.status === "Processed")
        .reduce((sum, refundRecord) => sum + refundRecord.amount, 0);

      const maxRefundableAmount = order.grandTotal - totalProcessed;

      // === RESTORE STOCK & UPDATE ITEMS ==

      for (const item of order.items) {
        if (NON_CANCELLABLE_ITEM_STATUSES.includes(item.itemStatus)) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Item ${item.productId} cannot be cancelled in its current status`,
          });
        }

        if (CANCELLABLE_ITEM_STATUSES.includes(item.itemStatus)) {
          const product = await Product.findById(item.productId).session(
            session
          );
          if (product) {
            product.quantity += item.quantity;
            await product.save({ session });
          }
          item.itemStatus = "Cancelled";
        }
      }

      // wallet refund
      if (order.paymentMethod === "wallet" && order.walletAmountUsed > 0) {
        const walletRefund = Math.min(
          maxRefundableAmount,
          order.walletAmountUsed
        );

        if (walletRefund > 0) {
          await Wallet.findOneAndUpdate(
            {
              userId: order.userId,
            },
            {
              $inc: { balance: walletRefund },
              $push: {
                transactionHistory: {
                  type: "credit",
                  amount: walletRefund,
                  description: `Refund for cancelled order #${order._id}`,
                },
              },
            },
            { upsert: true, new: true, session }
          );

          refundRecord = {
            refundId: `wallet_refund_${Date.now()}_${order._id}`,
            amount: walletRefund,
            itemIds: order.items.map((i) => i._id),
            status: "Processed",
          };
          refundAmount += walletRefund;
        }
      }

      // handle razorpay refund  to wallet

      if (order.paymentMethod === "razorpay" && order.grandTotal > 0) {
        let razorpayRefund = Math.min(maxRefundableAmount, order.grandTotal);

        if (razorpayRefund > 0) {
          await Wallet.findOneAndUpdate(
            { userId: order.userId },
            {
              $inc: { balance: razorpayRefund },
              $push: {
                transactionHistory: {
                  type: "credit",
                  amount: razorpayRefund,
                  description: `Refund for cancelled order #${order._id}`,
                },
              },
            },
            { upsert: true, new: true, session }
          );
        }
        refundRecord = {
          refundId: `razorpay_refund_${Date.now()}_${order._id}`,
          amount: razorpayRefund,
          itemIds: order.items.map((i) => i._id),
          status: "Processed",
        };
        refundAmount += razorpayRefund;
      }

      // push refundRecord

      if (refundRecord) {
        const exists = order.refunds.some(
          (r) => r.refundId === refundRecord.refundId
        );
        if (!exists) order.refunds.push(refundRecord);
      }
    }

    // update payment status
    const totalPaid = order.paymentMethod === "cod" ? 0 : order.grandTotal;
    const totalRefunded = refundRecord?.amount || 0;

    if (totalPaid > 0 && totalRefunded >= totalPaid) {
      order.paymentStatus = "Refunded";
    } else if (totalRefunded > 0) {
      order.paymentStatus = "PartiallyRefunded";
    }

    // update order status
    order.orderStatus = status;

    // save
    await order.save({ session });
    await session.commitTransaction();

    // 10. Success
    return res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: {
        orderId: order._id,
        orderStatus: order.orderStatus,
        deliveredAt: order.deliveredAt || null,
        refundAmount: refundAmount > 0 ? Number(refundAmount.toFixed(2)) : null,
        refundedTo: refundAmount > 0 ? "wallet" : null,
      },
    });

    // wallet Refund
  } catch (error) {
    await session.abortTransaction();
    console.error("Error updating order status", error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

exports.orderReturnApprove = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  // const NON_RETURNABLE_ITEM_STATUSES = [
  //   "Cancelled",
  //   "Returned",
  //   "ReturnRejected",
  // ];

  try {
    const { orderId } = req.params;

    // validate orderId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      const err = new Error("OrderId is not valid");
      err.statusCode = 400;
      throw err;
    }

    // find order
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      const err = new Error("Order not found");
      err.statusCode = 404;
      throw err;
    }

    // check is order already returned
    if (order.orderStatus == "Returned") {
      const err = new Error("Order already returned");
      err.statusCode = 409;
      throw err;
    }

    // check if order is in return pending state
    if (order.orderStatus !== "ReturnPending") {
      const err = new Error("Order not in return pending state");
      err.statusCode = 400;
      throw err;
    }

    // Pre-check all items BEFORE restore
    // Validate all items are in ReturnPending status
    for (const item of order.items) {
      if (item.itemStatus !== "ReturnPending") {
        const err = new Error(
          `Item ${item.productId} is not in ReturnPending status (current: ${item.itemStatus})`
        );
        err.statusCode = 400;
        throw err;
      }
    }

    // Then restore items
    for (const item of order.items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) {
        const err = new Error(`Product not found for item ${item.productId}`);
        err.statusCode = 404;
        throw err;
      }
      product.quantity += item.quantity;
      await product.save({ session });
    }

    // order status
    order.orderStatus = "Returned";

    // item status
    for (const item of order.items) {
      if (item.itemStatus === "ReturnPending") {
        item.itemStatus = "Returned";
        item.returnApprovedAt = new Date();
      }
    }

    // calculate totalRefunded before refund
    const totalProcessed = order.refunds
      .filter((refundRecord) => refundRecord.status === "Processed")
      .reduce((sum, refundRecord) => sum + refundRecord.amount, 0);

    // maximum refundable amount
    const maxRefundableAmount = order.grandTotal - totalProcessed;

    let refundAmount = 0;
    let refundRecord = null;

    // wallet refund
    if (order.paymentMethod === "cod") {
      refundAmount = 0;
    } else {
      refundAmount = Math.min(maxRefundableAmount, order.grandTotal);

      const walletUpdate = await Wallet.findOneAndUpdate(
        {
          userId: order.userId,
        },
        {
          $inc: { balance: refundAmount },
          $push: {
            transactionHistory: {
              type: "credit",
              amount: refundAmount,
              description: `Refund for Returned order #${order._id}`,
            },
          },
        },
        { upsert: true, new: true, session }
      );

      if (!walletUpdate) {
        throw new Error("Failed to update wallet balance");
      }

      refundRecord = {
        refundId: `refund_${crypto.randomUUID()}`,
        amount: refundAmount,
        itemIds: order.items.map((i) => i._id),
        reason: order.returnedReason,
        status: "Processed",
      };
      order.refunds.push(refundRecord);
    }

    // update payment status after refund
    const totalPaid = order.paymentMethod === "cod" ? 0 : order.grandTotal;
    const totalRefunded = order.refunds
      .filter((r) => r.status === "Processed")
      .reduce((sum, r) => sum + r.amount, 0);

    if (order.paymentMethod === "cod") {
      order.paymentStatus = "Refunded";
    } else if (totalPaid > 0 && totalRefunded >= totalPaid) {
      order.paymentStatus = "Refunded";
    } else if (totalRefunded > 0) {
      order.paymentStatus = "PartiallyRefunded";
    }

    // save
    await order.save({ session });
    await session.commitTransaction();

    // 10. Success
    return res.status(200).json({
      success: true,
      message: `Order Return approved successfully`,
      data: {
        orderId: order._id,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        deliveredAt: order.deliveredAt || null,
        refundAmount: refundAmount > 0 ? Number(refundAmount.toFixed(2)) : null,
        refundedTo: refundAmount > 0 ? "wallet" : null,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error updating order return approve", error);
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message });
  } finally {
    await session.endSession();
  }
};

exports.orderReturnReject = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json({ success: false, message: "OrderId is not valid" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.orderStatus === "ReturnRejected") {
      return res.status(409).json({
        success: false,
        message: "Order already in Return Rejected state ",
      });
    }

    if (order.orderStatus !== "ReturnPending") {
      return res.status(409).json({
        success: false,
        message: "Order in Return Pending state can only be rejected",
      });
    }

    order.orderStatus = "ReturnRejected";
    for (const item of order.items) {
      item.itemStatus = "ReturnRejected";
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Order return rejected successfully",
      data: { id: orderId, status: order.orderStatus },
    });
  } catch (error) {
    console.error("Error updating order return reject", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.itemReturnReject = async (req, res) => {
  const session = await mongoose.startSession();
  await session.startTransaction();

  try {
    const { orderId, itemId } = req.params;

    // validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(orderId) ||
      !mongoose.Types.ObjectId.isValid(itemId)
    ) {
      await session.abortTransaction();
      await session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid orderId or itemId" });
    }

    //find order
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // find the specific orer
    const item = order.items.id(itemId);
    if (!item) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    // validation

    if (item.itemStatus === "ReturnRejected") {
      await session.abortTransaction();
      await session.endSession();
      return res.status(409).json({
        success: false,
        message: "Item already in Return Rejected state",
      });
    }

    if (item.itemStatus !== "ReturnPending") {
      await session.abortTransaction();
      await session.endSession();
      return res.status(409).json({
        success: false,
        message: "Only items in Return Pending state can be rejected",
      });
    }

    // update item status

    item.itemStatus = "ReturnRejected";
    item.returnApprovedAt = new Date();

    await order.save({ session });
    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Item return rejected successfully",
      data: {
        orderId,
        itemId,
        itemStatus: item.itemStatus,
        orderStatus: order.orderStatus,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error updating order return reject", error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    await session.endSession();
  }
};

exports.itemReturnApprove = async (req, res) => {
  const session = await mongoose.startSession();
  await session.startTransaction();
  try {
    const { orderId, itemId } = req.params;

    // validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(orderId) ||
      !mongoose.Types.ObjectId.isValid(itemId)
    ) {
      await session.abortTransaction();
      await session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid orderId or itemId" });
    }

    //find order
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // find the specific orer
    const item = order.items.id(itemId);
    if (!item) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    // validation

    if (item.itemStatus === "Returned") {
      await session.abortTransaction();
      await session.endSession();
      return res.status(409).json({
        success: false,
        message: "Item already in Returned state",
      });
    }

    if (item.itemStatus !== "ReturnPending") {
      await session.abortTransaction();
      await session.endSession();
      return res.status(409).json({
        success: false,
        message: "Only items in Return Pending state can be rejected",
      });
    }

    item.itemStatus = "Returned";
    item.returnApprovedAt = new Date();

    for (const item of order.items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }
      product.quantity += item.quantity;
      await product.save({ session });
    }

    let refundAmount = 0;
    let refundRecord = null;

    // 7. === CANCELLATION: RESTORE STOCK + REFUND ===
    // Calculate max refundable

    const totalProcessed = order.refunds
      .filter((refundRecord) => refundRecord.status === "Processed")
      .reduce((sum, refundRecord) => sum + refundRecord.amount, 0);

    const maxRefundableAmount = order.grandTotal - totalProcessed;

    // wallet refund
    if (order.paymentMethod === "wallet" && order.walletAmountUsed > 0) {
      const walletRefund = Math.min(
        maxRefundableAmount,
        order.walletAmountUsed
      );

      if (walletRefund > 0) {
        await Wallet.findOneAndUpdate(
          {
            userId: order.userId,
          },
          {
            $inc: { balance: walletRefund },
            $push: {
              transactionHistory: {
                type: "credit",
                amount: walletRefund,
                description: `Refund for Returned item #${item._id}`,
              },
            },
          },
          { upsert: true, new: true, session }
        );

        refundRecord = {
          refundId: `wallet_refund_${Date.now()}_${item._id}`,
          amount: walletRefund,
          itemIds: [itemId],
          status: "Processed",
        };
        refundAmount += walletRefund;
      }
    }

    // handle razorpay refund  to wallet

    if (order.paymentMethod === "razorpay" && order.grandTotal > 0) {
      let razorpayRefund = Math.min(maxRefundableAmount, order.grandTotal);

      if (razorpayRefund > 0) {
        await Wallet.findOneAndUpdate(
          { userId: order.userId },
          {
            $inc: { balance: razorpayRefund },
            $push: {
              transactionHistory: {
                type: "credit",
                amount: razorpayRefund,
                description: `Refund for Returned item #${item._id}`,
              },
            },
          },
          { upsert: true, new: true, session }
        );
      }
      refundRecord = {
        refundId: `razorpay_refund_${Date.now()}_${item._id}`,
        amount: razorpayRefund,
        itemIds: [itemId],
        status: "Processed",
      };
      refundAmount += razorpayRefund;
    }

    // push refundRecord

    if (refundRecord) {
      const exists = order.refunds.some(
        (r) => r.refundId === refundRecord.refundId
      );
      if (!exists) order.refunds.push(refundRecord);
    }

    // update payment status
    const totalPaid = order.paymentMethod === "cod" ? 0 : order.grandTotal;
    const totalRefunded = refundRecord?.amount || 0;

    // save
    await order.save({ session });
    await session.commitTransaction();

    // 10. Success
    return res.status(200).json({
      success: true,
      message: `item Return approved successfully`,
      data: {
        orderId: order._id,
        itemId,
        itemStatus: item.itemStatus,
        orderStatus: order.orderStatus,
        deliveredAt: order.deliveredAt || null,
        refundAmount: refundAmount > 0 ? Number(refundAmount.toFixed(2)) : null,
        refundedTo: refundAmount > 0 ? "wallet" : null,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error updating item return approve", error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    await session.endSession();
  }
};

//     refundId: `razorpay_wallet_refund_${Date.now()}_${
//       order._id
//     }_${Math.random().toString(36).substring(2, 7)}`,
//
