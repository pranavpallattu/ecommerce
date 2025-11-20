const Order = require("../models/orderSchema");

exports.getOrderSummary = async (req, res) => {
  try {
    const orderSummary = await Order.aggregate([
      {
        $group: {
          _id: "$orderStatus",
          count: { $sum: 1 },
        },
      },
    ]);

    const summary = {
      totalOrders: 0,
      delivered: 0,
      processing: 0,
      confirmed: 0,
      pending: 0,
      cancelled: 0,
      partiallyCancelled: 0,
      shipped: 0,
      returned: 0,
      partiallyReturned: 0,
      returnPending: 0,
      returnRejected: 0,
    };

    orderSummary.forEach((item) => {
      summary.totalOrders += item.count;
      summary[item._id.toLowerCase()] = item.count;
    });

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching order summary:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
