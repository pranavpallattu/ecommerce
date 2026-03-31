const Order = require("../../models/orderSchema");
const dayjs = require("dayjs");
const isoWeek = require("dayjs/plugin/isoWeek");
const advancedFormat = require("dayjs/plugin/advancedFormat");

dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);

exports.getOrderSummary = async (req, res) => {
  try {
    let { startDate, endDate, filterType } = req.query;

    const allowedFilterTypes = [
      "all",
      "daily",
      "week",
      "month",
      "year",
      "custom",
    ];

    if (!allowedFilterTypes.includes(filterType)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid filter type" });
    }

    if (!filterType) filterType = "all";

    // Auto-date selection
    if (filterType === "daily") {
      startDate = dayjs().startOf("day").toDate();
      endDate = dayjs().endOf("day").toDate();
    } else if (filterType === "week") {
      startDate = dayjs().startOf("isoWeek").toDate();
      endDate = dayjs().endOf("isoWeek").toDate();
    } else if (filterType === "month") {
      startDate = dayjs().startOf("month").toDate();
      endDate = dayjs().endOf("month").toDate();
    } else if (filterType === "year") {
      startDate = dayjs().startOf("year").toDate();
      endDate = dayjs().endOf("year").toDate();
    } else if (filterType === "all") {
      startDate = new Date(0);
      endDate = new Date();
    } else {
      // custom date range
      if (!dayjs(startDate).isValid() || !dayjs(endDate).isValid()) {
        return res.status(400).json({
          success: false,
          message: "Invalid custom date range",
        });
      }
      startDate = dayjs(startDate).startOf("day").toDate();
      endDate = dayjs(endDate).endOf("day").toDate();
    }

    // -------- Fetch Orders ----------
    const orderSummary = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$orderStatus",
          count: { $sum: 1 },
        },
      },
    ]);

    // Fetch orders
    const orders = await Order.find({
      createdAt: { $gte: startDate, $lte: endDate },
    }).populate("items.productId");

   const cartOrders = orders.filter(o => o.checkoutType === "cart").length;
const buynowOrders = orders.filter(o => o.checkoutType === "buyNow").length;


    const totalAmount = orders.reduce(
      (sum, order) => sum + (order.grandTotal || 0),
      0,
    );

    // -------- Default Summary ----------
    const summary = {
      totalAmount,
      totalOrders: 0,
      cartOrders,
      buynowOrders,
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

    // -------- Prepare Response ----------
    orderSummary.forEach((item) => {
      summary.totalOrders += item.count;
      summary[item._id.toLowerCase()] = item.count;
    });

    const formatDate = (date) => dayjs(date).format("DD/MM/YYYY hh:mm A");

    return res.status(200).json({
      success: true,
      filterType,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching order summary:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBestSellingProducts = async (req, res) => {
  try {
    const bestProducts = await Order.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          totalSold: { $sum: "$items.quantity" },
        },
      },

      { $sort: { totalSold: -1 } },
      { $limit: 5 },

      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },

      {
        $project: {
          _id: 0,
          productId: "$_id",
          name: "$product.productName",
          totalSold: 1,
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      message: "Best selling products fetched successfully",
      data: bestProducts,
    });
  } catch (error) {
    console.error("Error fetching order summary:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBestSellingCategories = async (req, res) => {
  try {
    const bestCategories = await Order.aggregate([
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.category",
          totalSold: { $sum: "$items.quantity" },
        },
      },

      { $sort: { totalSold: -1 } },
      { $limit: 5 },

      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },

      {
        $project: {
          _id: 0,
          categoryId: "$_id",
          name: "$category.name",
          totalSold: 1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      message: "best categories fetched successfully",
      data: bestCategories,
    });
  } catch (error) {
    console.error("Error fetching best categories:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
