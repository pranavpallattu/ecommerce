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
    Pending: ["Confirmed", "Cancelled"],
    Confirmed: ["Processing", "Cancelled"],
    Processing: ["Shipped", "Cancelled"],
    Shipped: ["Delivered"],
    Delivered: [],
    Cancelled: [],
    Returned: [],
  };

  const CANCELLABLE_ITEM_STATUSES = ["Pending", "Processing", "Confirmed"];

  const session = await mongoose.startSession();
  session.startTransaction();
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
      const err = new Error(
        `Invalid status value. Allowed statuses: ${validStatuses.join(", ")}.`
      );
      err.statusCode = 400;
      throw err;
    }

    const order = await Order.findById(orderId).session(session);
    if (!order) {
      const err = new Error("Order not found");
      err.statusCode = 404;
      throw err;
    }

    // prevent same status
    if (order.orderStatus === status) {
      const err = new Error(
        `The order is already marked as '${status}'. No update required.`
      );
      err.statusCode = 400;
      throw err;
    }

    const statusAllowedNext = STATUS_TRANSITIONS[order.orderStatus] || [];
    if (!statusAllowedNext.includes(status)) {
      const err = new Error(
        `Invalid status transition: cannot move order from '${order.orderStatus}' to '${status}'.`
      );
      err.statusCode = 400;
      throw err;
    }

    if (status === "Confirmed") {
      if (order.orderStatus === "Pending") {
        order.items.forEach((item) => {
          if (item.itemStatus !== "Pending") {
            const err = new Error("Only pending orders can be confirmed.");
            err.statusCode = 400;
            throw err;
          }
          item.itemStatus = status;
        });
        order.orderStatus = status;
      }
    }

    if (status === "Processing") {
      if (order.orderStatus !== "Confirmed") {
        const err = new Error(
          "Order must be in the 'Confirmed' state before moving to 'Processing'."
        );
        err.statusCode = 400;
        throw err;
      }
      order.items.forEach((item) => {
        if (item.itemStatus !== "Confirmed") {
          const err = new Error(
            "All items must be confirmed before moving the order to processing."
          );
          err.statusCode = 400;
          throw err;
        }
        item.itemStatus = status;
      });
      order.orderStatus = status;
    }

    if (status === "Shipped") {
      if (order.orderStatus !== "Processing") {
        const err = new Error(
          "Order must be in the 'Processing' state before marking it as 'Shipped'."
        );
        err.statusCode = 400;
        throw err;
      }
      order.items.forEach((item) => {
        if (item.itemStatus !== "Processing") {
          const err = new Error(
            "All items must be processing before marking the order as shipped."
          );
          err.statusCode = 400;
          throw err;
        }
        item.itemStatus = status;
      });
      order.orderStatus = status;
    }

    if (status === "Delivered") {
      if (order.orderStatus !== "Shipped") {
        const err = new Error(
          "Order must be in the 'Shipped' state before marking it as 'Delivered'."
        );
        err.statusCode = 400;
        throw err;
      }
      order.items.forEach((item) => {
        if (item.itemStatus !== "Shipped") {
          const err = new Error(
            "All items must be shipped before marking the order as delivered."
          );
          err.statusCode = 400;
          throw err;
        }
        item.itemStatus = status;
        item.deliveredAt = new Date();
      });
      order.orderStatus = status;
      order.paymentStatus = "Paid";
      order.deliveredAt = new Date();
    }

    if (status === "Cancelled") {
      for (const item of order.items) {
        if (!CANCELLABLE_ITEM_STATUSES.includes(item.itemStatus)) {
          const err = new Error(
            `Item ${item.productId} cannot be cancelled (current status: ${item.itemStatus}).`
          );
          err.statusCode = 400;
          throw err;
        }
      }

      for (const item of order.items) {
        const product = await Product.findById(item.productId).session(session);
        if (!product) {
          const err = new Error(
            `Product not found for item ${item.productId}. Cannot cancel.`
          );
          err.statusCode = 400;
          throw err;
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
          const err = new Error("No refundable amount remaining");
          err.statusCode = 400;
          throw err;
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
            { upsert: true, new: true, session }
          );

          if (!walletUpdate) {
            const err = new Error(
              "Failed to update wallet balance. Refund could not be processed."
            );
            err.statusCode = 400;
            throw err;
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
    const status = error.statusCode || 500;
    console.error("Error updating order status", error);
    return res.status(status).json({ success: false, message: error.message });
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
      const err = new Error("Invalid orderId or itemId");
      err.statusCode = 400;
      throw err;
    }

    //find order
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      const err = new Error("Order not found");
      err.statusCode = 404;
      throw err;
    }

    // find the specific item
    const item = order.items.id(itemId);
    if (!item) {
      const err = new Error("item not found");
      err.statusCode = 404;
      throw err;
    }

    // validation

    if (item.itemStatus === "Returned") {
      const err = new Error("item already in Returned state");
      err.statusCode = 409;
      throw err;
    }

    if (item.itemStatus !== "ReturnPending") {
      const err = new Error(
        "Only items in Return Pending state can be returned"
      );
      err.statusCode = 409;
      throw err;
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
      const err = new Error(`Product not found: ${item.productId}`);
      err.statusCode = 404;
      throw err;
    }
    product.quantity += item.quantity;
    await product.save({ session });

    let actualRefundAmount = 0;
    let refundRecord = null;

    const returnedCount = order.items.filter(
      (item) => item.itemStatus === "Returned"
    ).length;
    const totalCount = order.items.length;

    if (returnedCount === totalCount) {
      order.orderStatus = "Returned";
    } else {
      order.orderStatus = "PartiallyReturned";
    }

    await order.save({ session });

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

    if (actualRefundAmount > 0) {
      const walletUpdate = await Wallet.findOneAndUpdate(
        {
          userId: order.userId,
        },
        {
          $inc: { balance: actualRefundAmount },
          $push: {
            transactionHistory: {
              type: "credit",
              amount: actualRefundAmount,
              description: `Refund for Returned item #${item._id}`,
            },
          },
        },
        { upsert: true, new: true, session }
      );

      if (!walletUpdate) {
        const err = new Error("Failed to update wallet balance");
        err.statusCode = 404;
        throw err;
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

    // update payment status
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

    // 10. Success
    return res.status(200).json({
      success: true,
      message: `item Return approved successfully`,
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
    const status = error.statusCode || 500;
    console.error("Error updating item return approve", error);
    return res.status(status).json({ success: false, message: error.message });
  } finally {
    await session.endSession();
  }
};
