const { default: mongoose } = require("mongoose");
const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const Wallet = require("../../models/walletSchema");
const Product = require("../../models/productSchema");
const Coupon = require("../../models/couponSchema");
const crypto = require("crypto");
const BuyNow=require("../../models/buynowSchema");
const { createInvoiceIfNeeded } = require("./invoiceController");

const CANCELLABLE_STATUSES = ["Pending", "Confirmed", "Processing", "PartiallyCancelled"];

exports.placeOrder = async (req, res) => {
  const session = await mongoose.startSession();
  await session.startTransaction();
  try {
    const { paymentMethod, address, couponId, couponCode } = req.body;
    console.log(address);
    
    console.log(paymentMethod);
    const user = req.user;

    // validate payment method
    if (!["cod", "wallet"].includes(paymentMethod)) {
      const err = new Error("Invalid payment method");
      err.statusCode = 400;
      throw err;
    }

    // validate address
    if (!address?.addressId || !address?.snapshot) {
      const err = new Error("Address is required");
      err.statusCode = 422;
      throw err;
    }

    // validate cart
    const cart = await Cart.findOne({ userId: user._id }).session(session);
    if (!cart || cart.items.length === 0) {
      const err = new Error("Cart is empty");
      err.statusCode = 409;
      throw err;
    }

    const subTotal = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    let discount = 0;
    let validCouponId = null;
    let validCouponCode = null;

    if (couponId) {
      const coupon = await Coupon.findById(couponId).session(session);

      if (!coupon) {
        const err = new Error("Invalid coupon");
        err.statusCode = 400;
        throw err;
      }

      // Check if coupon is active
      if (!coupon.isActive) {
        const err = new Error("Coupon is not active");
        err.statusCode = 400;
        throw err;
      }

      // Check expiry
      if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
        const err = new Error("Coupon has expired");
        err.statusCode = 400;
        throw err;
      }

      // Check minimum purchase
      if (subTotal < coupon.minPurchase) {
        const err = new Error(
          `Minimum purchase of ₹${coupon.minPurchase} required to use this coupon`
        );
        err.statusCode = 400;
        throw err;
      }

      // Check usage limit (if applicable)
      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        const err = new Error("Coupon usage limit exceeded");
        err.statusCode = 400;
        throw err;
      }

      // Calculate discount
      if (coupon.discountType === "percentage") {
        discount = (subTotal * coupon.discount) / 100;
      } else if (coupon.discountType === "flat") {
        discount = coupon.discount;
      }

      // Ensure discount doesn't exceed subtotal
      discount = Math.min(discount, subTotal);

      validCouponId = coupon._id;
      validCouponCode = coupon.code;
    }

    const grandTotal = subTotal - discount;

    let walletUsed = 0;

    if (paymentMethod === "wallet") {
      const wallet = await Wallet.findOne({ userId: user._id }).session(
        session
      );
      if (!wallet || wallet.balance < grandTotal) {
        const err = new Error("Insufficient wallet balance");
        err.statusCode = 402;
        throw err;
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

    // Step 1: Validate ALL products first
    for (const item of cart.items) {
      const product = await Product.findById(item.product).session(session);
      if (!product) {
        const err = new Error(`Product not found: ${item.productName}`);
        err.statusCode = 404;
        throw err;
      }
      if (product.quantity < item.quantity) {
        const err = new Error(
          `Insufficient stock for ${item.productName}. Only ${product.quantity} available.`
        );
        err.statusCode = 409;
        throw err;
      }
    }

    // Step 2: Deduct stock for ALL products (after validation)
    for (const item of cart.items) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { quantity: -item.quantity } },
        { session }
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
        subtotal: item.price * item.quantity,
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
      paymentStatus: paymentMethod === "cod" ? "N/A" : "Paid",
      orderStatus: "Confirmed",
    });

    await order.save({ session });
    await Cart.deleteOne({ userId: user._id }).session(session);

    await session.commitTransaction();

        if (paymentMethod === "wallet") {
  try {
    await createInvoiceIfNeeded(order._id);
  } catch (err) {
    console.error("Invoice generation failed:", err.message);
    // do NOT fail order — invoice can be regenerated later
  }

}

    return res.json({
      success: true,
      message: "Order placed",
      orderId: order._id,
    });
  } catch (error) {
    await session.abortTransaction();
    const status = error.statusCode || 500;
    return res.status(status).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};







exports.placeBuyNowOrder = async (req, res) => {
  const session = await mongoose.startSession();
  await session.startTransaction();

  try {
    const { buyNowId, paymentMethod, address } = req.body;
    const userId = req.user._id;

    // Validate payment
    if (!["cod", "wallet"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Invalid payment method" });
    }

    // Validate address
    if (!address?.addressId || !address?.snapshot) {
      return res.status(422).json({ success: false, message: "Address required" });
    }

    // Get BuyNow data
    const buyNow = await BuyNow.findOne({
      _id: buyNowId,
      userId
    }).populate("product.productId").session(session);

    // console.log(buyNow);
    

    if (!buyNow) {
      return res.status(404).json({
        success: false,
        message: "Buy Now session expired"
      });
    }

    const product = buyNow.product?.productId
    const quantity = 1;
    const subTotal = product.salePrice;
    const grandTotal = subTotal; // no coupon
    console.log(grandTotal);
    

    // Wallet payment
    let walletUsed = 0;
    if (paymentMethod === "wallet") {
      const wallet = await Wallet.findOne({ userId }).session(session);
      console.log(wallet);

      console.log(wallet.balance < grandTotal);
      
      

      if (!wallet || wallet.balance < grandTotal) {
        return res.status(402).json({
          success: false,
          message: "Insufficient wallet balance"
        });
      }

      wallet.balance -= grandTotal;
      walletUsed = grandTotal;

      wallet.transactionHistory.push({
        type: "debit",
        amount: grandTotal,
        description: "Buy Now Order Payment"
      });

      await wallet.save({ session });
    }
    // console.log(product);
    // console.log(product.quantity);
    
    

    // Stock check
    if (product.quantity < quantity) {
      return res.status(409).json({
        success: false,
        message: "Insufficient stock"
      });
    }

    // Deduct stock
    await Product.findByIdAndUpdate(
      product._id,
      { $inc: { quantity: - quantity } },
      { session }
    );

    // Create order
    const order = new Order({
      userId,
      items: [{
        productId: product._id,
        productName: product.productName,
        productImage: product?.productImage[0],
        quantity,
        price: product.salePrice,
        subtotal: subTotal,
        itemStatus: "Confirmed"
      }],
      address,
      checkoutType: "buyNow",
      subTotal,
      discount: 0,
      grandTotal,
      walletAmountUsed: walletUsed,
      paymentMethod,
      paymentStatus: paymentMethod === "cod" ? "N/A" : "Paid",
      orderStatus: "Confirmed"
    });

    

    await order.save({ session });



    // Remove BuyNow session
    await BuyNow.deleteOne({ _id: buyNowId }).session(session);

    await session.commitTransaction();

    if (paymentMethod === "wallet") {
  try {
    await createInvoiceIfNeeded(order._id);
  } catch (err) {
    console.error("Invoice generation failed:", err.message);
    // do NOT fail order — invoice can be regenerated later
  }

}


    res.status(200).json({
      success: true,
      message: "Buy Now order placed",
      orderId: order._id
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

    // find order
    const order = await Order.findOne({ _id: orderId, userId: user._id })
      .populate("items.productId")
      .lean();

      console.log(order)

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
      const err = new Error("Invalid order ID");
      err.statusCode = 400;
      throw err;
    }

    // Add validation early
    if (reason && reason.length > 500) {
      const err = new Error(
        "Cancellation reason too long (max 500 characters)"
      );
      err.statusCode = 400;
      throw err;
    }

    //  find order
    const order = await Order.findOne({
      _id: orderId,
      userId: user._id,
    }).session(session);

    if (!order) {
      const err = new Error("Order not found");
      err.statusCode = 400;
      throw err;
    }

    // After finding order
    if (!order.items || order.items.length === 0) {
      const err = new Error("Order has no items to cancel");
      err.statusCode = 400;
      throw err;
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

      const err = new Error(
        statusMsg[order.orderStatus] ||
          `Cannot cancel order in ${order.orderStatus} status`
      );
      err.statusCode = 400;
      throw err;
    }

    // update order

    order.orderStatus = "Cancelled";
    order.cancelledAt = new Date();
    order.cancellationReason = reason?.trim() || "User requested cancellation";
    order.items.forEach((item) => {
      item.itemStatus = "Cancelled";
      item.cancelledAt = new Date();
    });

    // Restore stock

    await Promise.all(
      order.items.map(async (item) => {
        const product = await Product.findById(item.productId).session(session);
        if (!product) {
          const err = new Error(`Product not found: ${item.productId}`);
          err.statusCode = 404;
          throw err;
        }
        product.quantity += item.quantity;
        await product.save({ session });
      })
    );

    // maxrefundable amount for safety to prevent double refund money
    const totalProcessed = order.refunds
      .filter((r) => r.status === "Processed")
      .reduce((sum, r) => sum + r.amount, 0);

    const maxRefundable = order.grandTotal - totalProcessed;

    let refundAmount = 0;
    let refundRecord = null;

    if (order.paymentMethod === "cod") {
      refundAmount = 0;
      order.paymentStatus = "N/A";
    } else {
      refundAmount = Math.min(maxRefundable, order.grandTotal);

      if (refundAmount <= 0) {
        const err = new Error("No refundable amount available");
        err.statusCode = 404;
        throw err;
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
        { upsert: true, new: true, session }
      );

      if (!walletUpdate) {
        throw new Error("Failed to update wallet balance");
      }

      refundRecord = {
        refundId: `refund_${crypto.randomUUID()}`,
        amount: refundAmount,
        reason,
        itemIds: order.items.map((i) => i._id),
        status: "Processed",
      };

      order.refunds.push(refundRecord);
    }

    const totalPaid = order.grandTotal;
    const totalRefunded = order.refunds
      .filter((r) => r.status === "Processed")
      .reduce((sum, r) => sum + r.amount, 0);

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
        refundAmount: refundAmount > 0 ? Number(refundAmount.toFixed(2)) : null,
        refundedTo: refundAmount > 0 ? "wallet" : null,
        refundId: refundRecord?.refundId || null,
        paymentStatus: order.paymentStatus,
        totalRefunded: totalRefunded,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("orderCancel error:", error);
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to cancel order",
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
    console.log(cancellationReason);
    
    const user = req.user;

    // validate orderid and itemid
    if (
      !mongoose.Types.ObjectId.isValid(orderId) ||
      !mongoose.Types.ObjectId.isValid(itemId)
    ) {
      const err = new Error("Invalid orderId or itemId");
      err.statusCode = 400;
      throw err;
    }

    // validate reason
    if (cancellationReason && cancellationReason.length > 500) {
      const err = new Error(
        "Cancellation reason too long (max 500 characters)"
      );
      err.statusCode = 400;
      throw err;
    }

    //find order
    const order = await Order.findOne({
      _id: orderId,
      userId: user._id,
    }).session(session);
    if (!order) {
      const err = new Error("Order not found");
      err.statusCode = 404;
      throw err;
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

      const err = new Error(
        statusMsg[order.orderStatus] || "Cannot cancel item"
      );
      err.statusCode = 400;
      throw err;
    }

    // find item
    const item = order.items.id(itemId);
    if (!item) {
      const err = new Error("Item not found");
      err.statusCode = 404;
      throw err;
    }

    // check if item level cancellation is allowed
    if (!CANCELLABLE_STATUSES.includes(item.itemStatus)) {
      const err = new Error("Item cannot be cancelled");
      err.statusCode = 404;
      throw err;
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
    item.cancellationReason = cancellationReason?.trim() || "User requested cancellation";
    item.cancelledAt = new Date();

    // Restore stock
    const product = await Product.findById(item.productId).session(session);
    if (!product) {
      const err = new Error("Product not found");
      err.statusCode = 404;
      throw err;
    }
    product.quantity += item.quantity;
    await product.save({ session });

    //Check Coupon Validity (Before Save)
    const newSubTotal = originalSubTotal - item.subtotal;

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
      (item) => item.itemStatus === "Cancelled"
    ).length;
    const totalCount = order.items.length;

    // update order status and save order
   if (cancelledCount === totalCount) {
  order.orderStatus = "Cancelled";

  // ✅ Set order-level cancellation reason safely
  order.cancellationReason = "Order cancelled due to item cancellations";
  order.cancelledAt = new Date();
} else if (cancelledCount > 0) {
  order.orderStatus = "PartiallyCancelled";
}


    await order.save({ session });

    // PRORATE DISCOUNT
    const itemRatio = item.subtotal / originalSubTotal;
    const proratedDiscount = itemRatio * originalDiscount;
    const itemRefundAmount = Math.max(0, item.subtotal - proratedDiscount);

    // CAP REFUND
    const totalProcessed = order.refunds
      .filter((refundRecord) => refundRecord.status === "Processed")
      .reduce((sum, refundRecord) => sum + refundRecord.amount, 0);

    const maxRefundable = originalGrandTotal - totalProcessed;

    const actualRefundAmount = Math.min(itemRefundAmount, maxRefundable);

    let refundRecord = null;

    // Refund cod
    if (order.paymentMethod === "cod") {
      // COD: No refund needed
      refundRecord = null;
    }
    // Add refund amount to wallet for both wallet and razorpay payment
    else {
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
        { upsert: true, new: true, session }
      );

      if (!walletUpdate) {
        throw new Error("Failed to update wallet balance");
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

    if (refundRecord) {
      order.refunds.push(refundRecord);
    }

    // update payment status
    if (order.paymentMethod !== "cod") {
      const totalRefunded = order.refunds
        .filter((r) => r.status === "Processed")
        .reduce((sum, r) => sum + r.amount, 0);

      if (totalRefunded >= originalGrandTotal) {
        order.paymentStatus = "Refunded";
      } else if (totalRefunded > 0) {
        order.paymentStatus = "PartiallyRefunded";
      }
    } else {
      order.paymentStatus = "N/A";
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
        refundAmount: refundRecord
          ? Number(refundRecord.amount.toFixed(2))
          : null,
        refundedTo: refundRecord ? "wallet" : null,
        refundId: refundRecord?.refundId || null,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("cancelSingleItem error:", error);
    console.log(error)
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to cancel item",
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

    // check if order status is not delivered
    if (order.orderStatus !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered orders can be returned",
      });
    }

    // check is order already in returned or return pending state
    if (["Returned", "ReturnPending"].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: "Order already returned or return is pending",
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

    // check is item status not delivered
    if (item.itemStatus !== "Delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered items can be returned",
      });
    }

    // check is itemstatus is already returned or in return pending state
    if (["Returned", "ReturnPending"].includes(item.itemStatus)) {
      return res.status(400).json({
        success: false,
        message: "Item already returned or return is pending",
      });
    }

    // update item status
    item.itemStatus = "ReturnPending";
    item.returnReason = returnReason;
    item.returnRequestedAt = new Date();

    // Save order
    await order.save();

    return res.status(201).json({
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
