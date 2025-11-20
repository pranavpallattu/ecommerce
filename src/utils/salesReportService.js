const Order = require("../models/orderSchema");
const dayjs = require("dayjs");
const isoWeek = require("dayjs/plugin/isoWeek");
const advancedFormat = require("dayjs/plugin/advancedFormat");

dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);
const generateSalesReport = async ({ startDate, endDate, filterType }) => {

  // Auto-date selection
  if (filterType === "today") {
    startDate = dayjs().startOf("day").toDate();
    endDate = dayjs().endOf("day").toDate();
  } else if (filterType === "week") {
    startDate = dayjs().startOf("isoWeek").toDate();
    endDate = dayjs().endOf("isoWeek").toDate();
  } else if (filterType === "month") {
    startDate = dayjs().startOf("month").toDate();
    endDate = dayjs().endOf("month").toDate();
  } else if (filterType === "all") {
    startDate = new Date(0); // 1970
    endDate = new Date(); // now
  } else {
    // Custom date range
    if (!dayjs(startDate).isValid() || !dayjs(endDate).isValid()) {
      return res.status(400).json({
        success: false,
        message: "Invalid custom date range",
      });
    }

    startDate = dayjs(startDate).startOf("day").toDate();
    endDate = dayjs(endDate).endOf("day").toDate();
  }

  // Fetch orders
  const orders = await Order.find({
    createdAt: { $gte: startDate, $lte: endDate },
  }).populate("items.productId");

  // Calculations
  const totalOrders = orders.length;

  const totalAmount = orders.reduce(
    (sum, order) => sum + (order.grandTotal || 0),
    0
  );

// Calculate total discount from all order items
const totalDiscount = orders.reduce((sum, order) => {
  const orderDiscount = order.items.reduce((itemSum, item) => {
    const regularPrice = item.productId?.regularPrice || 0;
    const salePrice = item.productId?.salePrice || 0;
    const discount = (regularPrice - salePrice) * item.quantity;
    return itemSum + (discount > 0 ? discount : 0);
  }, 0);
  return sum + orderDiscount;
}, 0);

  const couponDeduction = orders.reduce(
    (sum, order) => sum + (order.discount || 0),
    0
  );

  const delivered = orders.filter((o) => o.orderStatus === "Delivered").length;
  const cancelled = orders.filter((o) => o.orderStatus === "Cancelled").length;
  const shipped = orders.filter((o) => o.orderStatus === "Shipped").length;
  const returned = orders.filter((o) => o.orderStatus === "Returned").length;
  const pending = orders.filter((o) => o.orderStatus === "Pending").length;
  const processing = orders.filter(
    (o) => o.orderStatus === "Processing"
  ).length;

  const formatDate = (date) => dayjs(date).format("DD/MM/YYYY hh:mm A");


  return {
      totalOrders,
      totalAmount,
      totalDiscount,
      couponDeduction,
      delivered,
      cancelled,
      shipped,
      returned,
      pending,
      processing,
      filterType,
      startDate:formatDate(startDate),
      endDate:formatDate(endDate),
  };
};

module.exports=generateSalesReport