const { default: mongoose } = require("mongoose");
const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const Wallet = require("../../models/walletSchema");
const Product = require("../../models/productSchema");

exports.placeOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { paymentMethod, address, couponId, couponCode } = req.body;
    const user = req.user;

    // validate payment method
    if (!["cod", "wallet"].includes(paymentMethod)) {
      throw new Error("Invalid payment method");
    }

    // validate cart
    const cart = await Cart.findOne({ userId: user._id }).session(session);
    if (!cart || cart.items.length === 0) {
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
    session.endSession();

    return res.json({
      success: true,
      message: "Order placed",
      orderId: order._id,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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

    return res
      .status(200)
      .json({
        success: true,
        message: `Order details of ${order._id}`,
        data: order,
      });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.orderCancel = async (req, res) => {
  try {
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
