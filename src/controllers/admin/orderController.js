const { default: mongoose } = require("mongoose");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema");
const crypto = require("crypto");
const sendSMS = require("../../config/twiliosms");

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
          "_id",
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
        .populate("items.productId", "productName productImage price")
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
        .json({ success: false, message: "Invalid orderId" });
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
    Confirmed: ["Processing", "Cancelled"],

    Processing: ["Shipped", "Cancelled"],

    Shipped: ["Delivered"],

    Delivered: [],

    PartiallyCancelled: ["Processing", "Cancelled"],

    ReturnPending: [],
    PartiallyReturnPending: [],

    Returned: [],
    PartiallyReturned: [],

    ReturnRejected: [],
    PartiallyReturnRejected: [],

    Cancelled: [],
  };

  const CANCELLABLE_ITEM_STATUSES = [
    "Pending",
    "Confirmed",
    "Processing",
    "Cancelled",
  ];
  const session = await mongoose.startSession();
  await session.startTransaction();
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    let refundAmount = 0;
    let refundRecord = null;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid order ID. Please provide a valid order identifier.",
      });
    }

    const validStatuses = Object.keys(STATUS_TRANSITIONS);
    if (!status || !validStatuses.includes(status)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid status value. Allowed statuses: ${validStatuses.join(", ")}.`,
      });
    }

    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // prevent same status
    if (order.orderStatus === status) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `The order is already marked as '${status}'. No update required.`,
      });
    }

    const statusAllowedNext = STATUS_TRANSITIONS[order.orderStatus] || [];
    if (!statusAllowedNext.includes(status)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid status transition: cannot move order from '${order.orderStatus}' to '${status}'.`,
      });
    }

    if (status === "Processing") {
      if (
        order.orderStatus !== "Confirmed" &&
        order.orderStatus !== "PartiallyCancelled"
      ) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message:
            "Order must be in the 'Confirmed' state before moving to 'Processing'.",
        });
      }
      order.items.forEach((item) => {
        if (item.itemStatus === "Cancelled") return;

        if (item.itemStatus !== "Confirmed") {
          const err = new Error(
            "All active items must be confirmed before moving the order to processing.",
          );
          err.statusCode = 400;
          throw err;
        }

        item.itemStatus = "Processing";
      });
      order.orderStatus = status;
    }

    if (status === "Shipped") {
      if (order.orderStatus !== "Processing") {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message:
            "Order must be in the 'Processing' state before marking it as 'Shipped'.",
        });
      }
      order.items.forEach((item) => {
        if (item.itemStatus === "Cancelled") return;

        if (item.itemStatus !== "Processing") {
          const err = new Error(
            "All active items must be processing before marking the order as shipped.",
          );
          err.statusCode = 400;
          throw err;
        }

        item.itemStatus = "Shipped";
      });
      order.orderStatus = status;
    }

    if (status === "Delivered") {
      if (order.orderStatus !== "Shipped") {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message:
            "Order must be in the 'Shipped' state before marking it as 'Delivered'.",
        });
      }

      order.items.forEach((item) => {
        if (item.itemStatus === "Cancelled") return;

        if (item.itemStatus !== "Shipped") {
          const err = new Error(
            "All active items must be shipped before marking the order as delivered.",
          );
          err.statusCode = 400;
          throw err;
        }

        item.itemStatus = "Delivered";
        item.deliveredAt = new Date();
      });

      order.orderStatus = "Delivered";
      order.paymentStatus = "Paid";
      order.deliveredAt = new Date();
    }

    if (status === "Cancelled") {
      for (const item of order.items) {
        if (!CANCELLABLE_ITEM_STATUSES.includes(item.itemStatus)) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Item ${item.productId} cannot be cancelled (current status: ${item.itemStatus}).`,
          });
        }
      }

      for (const item of order.items) {
        if (item.itemStatus === "Cancelled") continue;

        const product = await Product.findById(item.productId).session(session);

        if (!product) {
          await session.abortTransaction();
          return res.status(404).json({
            success: false,
            message: `Product ${item.productId} not found`,
          });
        }

        product.quantity += item.quantity;
        await product.save({ session });

        item.itemStatus = "Cancelled";
        item.cancelledAt = new Date();
      }

      if (order.paymentMethod === "cod") {
        order.paymentStatus = "N/A";
        refundAmount = 0;
      } else {
        const totalPreviousRefunds = order.refunds
          .filter((r) => r.status === "Processed")
          .reduce((sum, r) => sum + r.amount, 0);

        const maxRefundable = order.grandTotal - totalPreviousRefunds;
        refundAmount = Math.min(order.grandTotal, maxRefundable);

        if (refundAmount <= 0) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: "No refundable amount remaining",
          });
        }
        if (refundAmount > 0) {
          const walletUpdate = await Wallet.findOneAndUpdate(
            { userId: order.userId },
            {
              $inc: { balance: refundAmount },
              $push: {
                transactionHistory: {
                  type: "credit",
                  amount: refundAmount,
                  description: `Refund for cancelled order #${order._id}`,
                },
              },
            },
            { upsert: true, new: true, session },
          );

          if (!walletUpdate) {
            await session.abortTransaction();
            return res.status(500).json({
              success: false,
              message:
                "Failed to update wallet balance. Refund could not be processed.",
            });
          }

          refundRecord = {
            refundId: `refund_${crypto.randomUUID()}`,
            amount: refundAmount,
            itemIds: order.items.map((i) => i._id),
            status: "Processed",
          };

          order.refunds.push(refundRecord);

          order.paymentStatus = "Refunded";
        }
      }

      order.orderStatus = "Cancelled";
      order.cancelledAt = new Date();
    }

    // save
    await order.save({ session });
    await session.commitTransaction();

    // After commitTransaction()
    try {
      const phone = order.address?.snapshot?.phone;
      if (phone) {
        const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;

        let message = `Your order #${order._id} status updated to ${status}.`;

        if (status === "Shipped") {
          message = `🚚 Your order #${order._id} has been shipped.`;
        }
        if (status === "Delivered") {
          message = `✅ Your order #${order._id} has been delivered. Enjoy your purchase!`;
        }
        if (status === "Cancelled") {
          message = `❌ Your order #${order._id} has been cancelled. Refund will be processed if applicable.`;
        }

        await sendSMS(formattedPhone, message);
      }
    } catch (smsError) {
      console.error("SMS failed:", smsError.message);
      // DO NOT rollback order status because SMS failed
    }

    // 10. Success
    return res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: {
        orderId: order._id,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        deliveredAt: order.deliveredAt || null,
        refundAmount: refundAmount > 0 ? Number(refundAmount.toFixed(2)) : null,
        refundedTo: refundAmount > 0 ? "wallet" : null,
        refundId: refundRecord?.refundId || null,
      },
    });

    // wallet Refund
  } catch (error) {
    await session.abortTransaction();

    console.error("Error updating order status:", error);

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    await session.endSession();
  }
};

exports.orderReturnApprove = async (req, res) => {
  const session = await mongoose.startSession();
  await session.startTransaction();

  try {
    const { orderId } = req.params;

    // validate orderId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Order is not  valid",
      });
    }

    // find order
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // check is order already returned
    if (order.orderStatus == "Returned") {
      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message: "Order already returned",
      });
    }

    // check if order is in return pending state
    if (order.orderStatus !== "ReturnPending") {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Order not in return pending state",
      });
    }

    // Pre-check all items BEFORE restore
    // Validate all items are in ReturnPending status
    for (const item of order.items) {
      if (item.itemStatus !== "ReturnPending") {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: `Item ${item.productId} is not in ReturnPending status (current: ${item.itemStatus})`,
        });
      }
    }

    // Then restore items
    for (const item of order.items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) {
        await session.abortTransaction();

        return res.status(404).json({
          success: false,
          message: `Product not found for item ${item.productId}`,
        });
      }
      product.quantity += item.quantity;
      await product.save({ session });
    }

    // order status
    order.orderStatus = "Returned";
    order.returnedAt = new Date();

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

    refundAmount = Math.min(maxRefundableAmount, order.grandTotal);

    if (refundAmount <= 0) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "No refundable amount available",
      });
    }

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
      itemIds: order.items.map((i) => i._id),
      reason: order.returnReason,
      status: "Processed",
    };
    order.refunds.push(refundRecord);

    // update payment status after refund
    const totalPaid = order.grandTotal;
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

    try {
      const phone = order.address?.snapshot?.phone;
      if (phone) {
        const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;

        await sendSMS(
          formattedPhone,
          `🔁 Your return request for order #${order._id} has been approved. Refund processed.`,
        );
      }
    } catch (err) {
      console.error("SMS failed:", err.message);
    }

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

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
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

    const invalidItem = order.items.find(
      (item) => item.itemStatus !== "ReturnPending",
    );

    if (invalidItem) {
      return res.status(400).json({
        success: false,
        message: `Item ${invalidItem._id} is not in ReturnPending state.`,
      });
    }
    for (const item of order.items) {
      item.itemStatus = "ReturnRejected";
    }

    await order.save();

    try {
      const phone = order.address?.snapshot?.phone;
      if (phone) {
        const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;

        await sendSMS(
          formattedPhone,
          `❌ Your return request for order #${order._id} has been rejected.`,
        );
      }
    } catch (err) {
      console.error("SMS failed:", err.message);
    }

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

    // find the specific order
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

    const pendingCount = order.items.filter(
      (i) => i.itemStatus === "ReturnPending",
    ).length;

    const rejectedCount = order.items.filter(
      (i) => i.itemStatus === "ReturnRejected",
    ).length;

    const returnedCount = order.items.filter(
      (i) => i.itemStatus === "Returned",
    ).length;

    if (pendingCount > 0) {
      order.orderStatus =
        pendingCount === order.items.length
          ? "ReturnPending"
          : "PartiallyReturnPending";
    } else if (returnedCount > 0) {
      order.orderStatus =
        returnedCount === order.items.length ? "Returned" : "PartiallyReturned";
    } else if (rejectedCount > 0) {
      order.orderStatus =
        rejectedCount === order.items.length
          ? "ReturnRejected"
          : "PartiallyReturnRejected";
    }

    await order.save({ session });
    await session.commitTransaction();

    try {
      const phone = order.address?.snapshot?.phone;
      if (phone) {
        const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;

        await sendSMS(
          formattedPhone,
          `❌ Return request rejected for item in order #${order._id}.`,
        );
      }
    } catch (err) {
      console.error("SMS failed:", err.message);
    }

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

      return res.status(400).json({
        success: false,
        message: "Invalid orderId or itemId",
      });
    }

    //find order
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // find the specific item
    const item = order.items.id(itemId);
    if (!item) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    // validation

    if (item.itemStatus === "Returned") {
      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message: "Item already returned",
      });
    }

    if (item.itemStatus !== "ReturnPending") {
      await session.abortTransaction();

      return res.status(409).json({
        success: false,
        message: "Only items in ReturnPending state can be returned",
      });
    }

    //CAPTURE ORIGINAL VALUES (BEFORE ANY CHANGES)
    // - After you save the order, pre-save hook recalculates totals
    // - You need original values to calculate correct refund amount
    // - Without this, refund calculations would be wrong
    const originalSubTotal = Number(order.subTotal);
    const originalGrandTotal = Number(order.grandTotal);
    const originalDiscount = Number(order.discount);

    item.itemStatus = "Returned";
    item.returnApprovedAt = new Date();

    const product = await Product.findById(item.productId).session(session);
    if (!product) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: `Product not found`,
      });
    }
    product.quantity += item.quantity;
    await product.save({ session });

    let actualRefundAmount = 0;
    let refundRecord = null;

    const totalCount = order.items.length;

    const pendingCount = order.items.filter(
      (i) => i.itemStatus === "ReturnPending",
    ).length;

    const returnedCount = order.items.filter(
      (i) => i.itemStatus === "Returned",
    ).length;

    const rejectedCount = order.items.filter(
      (i) => i.itemStatus === "ReturnRejected",
    ).length;

    if (pendingCount > 0) {
      order.orderStatus =
        pendingCount === totalCount
          ? "ReturnPending"
          : "PartiallyReturnPending";
    } else if (returnedCount === totalCount) {
      order.orderStatus = "Returned";
      order.returnedAt = new Date();

      if (!order.returnReason) {
        order.returnReason = "All items returned and approved";
      }
    } else if (rejectedCount === totalCount) {
      order.orderStatus = "ReturnRejected";
    } else if (returnedCount > 0 && rejectedCount > 0) {
      order.orderStatus = "PartiallyReturnRejected";
    } else if (returnedCount > 0) {
      order.orderStatus = "PartiallyReturned";
    } else if (rejectedCount > 0) {
      order.orderStatus = "PartiallyReturnRejected";
    } else {
      order.orderStatus = "Delivered";
    }

    // Calculate max refundable
    // PRORATE DISCOUNT
    const itemRatio = item.subtotal / originalSubTotal;
    const proratedDiscount = itemRatio * originalDiscount;
    const itemRefundAmount = Math.max(0, item.subtotal - proratedDiscount);

    // CAP REFUND
    const totalProcessed = order.refunds
      .filter((refundRecord) => refundRecord.status === "Processed")
      .reduce((sum, refundRecord) => sum + refundRecord.amount, 0);

    const maxRefundable = originalGrandTotal - totalProcessed;

    actualRefundAmount = Math.min(itemRefundAmount, maxRefundable);

    // ONLINE / WALLET PAYMENT
    if (actualRefundAmount > 0) {
      const walletUpdate = await Wallet.findOneAndUpdate(
        { userId: order.userId },
        {
          $inc: { balance: actualRefundAmount },
          $push: {
            transactionHistory: {
              type: "credit",
              amount: actualRefundAmount,
              description: `Refund for returned item #${item._id}`,
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
        amount: actualRefundAmount,
        itemIds: [itemId],
        reason: item.returnReason,
        status: "Processed",
      };
    }

    // push refundRecord

    if (refundRecord) {
      order.refunds.push(refundRecord);
    }
    const totalRefunded = order.refunds
      .filter((r) => r.status === "Processed")
      .reduce((sum, r) => sum + r.amount, 0);

    if (totalRefunded >= originalGrandTotal) {
      order.paymentStatus = "Refunded";
    } else if (totalRefunded > 0) {
      order.paymentStatus = "PartiallyRefunded";
    }

    await order.save({ session });
    await session.commitTransaction();

    try {
      const phone = order.address?.snapshot?.phone;
      if (phone) {
        const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;

        await sendSMS(
          formattedPhone,
          `🔁 Return approved for item in order #${order._id}. Refund processed.`,
        );
      }
    } catch (err) {
      console.error("SMS failed:", err.message);
    }

    return res.status(200).json({
      success: true,
      message: `item returned successfully`,
      data: {
        orderId: order._id,
        itemId,
        itemStatus: item.itemStatus,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        deliveredAt: order.deliveredAt || null,
        refundAmount:
          actualRefundAmount > 0 ? Number(actualRefundAmount.toFixed(2)) : null,
        refundedTo: actualRefundAmount > 0 ? "wallet" : null,
      },
    });
  } catch (error) {
    await session.abortTransaction();

    console.error("Error approving item return:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    await session.endSession();
  }
};

exports.getReturnPendingRequests = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [
        { orderStatus: "ReturnPending" },
        { "items.itemStatus": "ReturnPending" },
      ],
    })
      .populate("userId", "name emailId")
      .populate("items.productId", "productName price")
      .sort({ createdAt: -1 });

    const orderReturns = [];
    const itemReturns = [];

    for (const order of orders) {
      //  CASE 1: FULL ORDER RETURN
      if (order.orderStatus === "ReturnPending") {
        orderReturns.push(order);
        continue; //  Skip item-level returns for this order
      }

      //  CASE 2: ITEM-LEVEL RETURNS ONLY
      order.items.forEach((item) => {
        if (item.itemStatus === "ReturnPending") {
          itemReturns.push({
            orderId: order._id,
            user: order.userId,
            orderStatus: order.orderStatus,
            paymentMethod: order.paymentMethod,
            item,
            returnReason: item.returnReason,
            createdAt: order.createdAt,
          });
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: "Return pending requests fetched successfully",
      data: {
        orderReturns,
        itemReturns,
      },
    });
  } catch (error) {
    console.error("Error fetching return pending requests", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
