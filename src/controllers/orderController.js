const { default: mongoose } = require("mongoose");
const Order = require("../models/orderSchema");
const Product = require("../models/productSchema");
const User = require("../models/userSchema");

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
    const user = req.user;

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
    Cancelled: [],
  };
  const DEFAULT_STATUS = "Processing";

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const user = req.user;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res
        .status(400)
        .json({ success: fale, message: "Invalid orderId" });
    }

    const validStatuses = Object.keys(STATUS_TRANSITIONS);
    if (!status || !validStatuses.includes(status)) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({
          success: false,
          message: `Invalid status. Status must be one of ${validStatuses.join(
            ", "
          )} `,
        });
    }

    const order = await Order.findById(orderId);
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

    if(status === "Delivered"){
      order.deliveredAt = new Date();
      for(const item of order.items){
        item.itemStatus = "Delivered"
      }
    }

    // 7. === CANCELLATION: RESTORE STOCK + REFUND ===
    if(status=== "Cancelled" && order.orderStatus !== "Cancelled"){
      
    }





  } catch (error) {
    console.error("Error updating order status", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
