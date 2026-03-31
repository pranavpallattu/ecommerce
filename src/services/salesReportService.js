const Order = require("../models/orderSchema");
const dayjs = require("dayjs");
const isoWeek = require("dayjs/plugin/isoWeek");
const advancedFormat = require("dayjs/plugin/advancedFormat");

dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);

const generateSalesReport = async ({ filterType, startDate, endDate }) => {
  const allowedFilterTypes = [
    "all",
    "daily",
    "week",
    "month",
    "year",
    "custom",
  ];

  if (!allowedFilterTypes.includes(filterType)) {
    throw new Error("Invalid filter type");
  }

  // Auto-date filters
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
    // Custom filter
    if (!dayjs(startDate).isValid() || !dayjs(endDate).isValid()) {
      throw new Error("Invalid custom date range");
    }

    startDate = dayjs(startDate).startOf("day").toDate();
    endDate = dayjs(endDate).endOf("day").toDate();
  }

  // Fetch orders
  const orders = await Order.find({
    createdAt: { $gte: startDate, $lte: endDate },
  }).populate("items.productId");

  // Summary Calculations
  const totalOrders = orders.length;

  const totalAmount = orders.reduce(
    (sum, order) => sum + (order.grandTotal || 0),
    0,
  );

  // Calculate product discounts
  const totalDiscount = orders.reduce((sum, order) => {
    const orderDiscount = order.items.reduce((itemSum, item) => {
      const regular = item.productId?.regularPrice || 0;
      const sale = item.productId?.salePrice || 0;
      const discount = (regular - sale) * item.quantity;
      return itemSum + (discount > 0 ? discount : 0);
    }, 0);

    return sum + orderDiscount;
  }, 0);

  const couponDeduction = orders.reduce(
    (sum, order) => sum + (order.discount || 0),
    0,
  );

  const totalRefunded = orders.reduce((sum, order) => {
    const refundTotal = (order.refunds || []).reduce(
      (rSum, refund) => rSum + (refund?.amount || 0),
      0,
    );

    return sum + refundTotal;
  }, 0);

  const cartOrders = await Order.find({
    checkoutType: "cart",
    createdAt: { $gte: startDate, $lte: endDate },
  }).countDocuments();
  const buynowOrders = await Order.find({
    checkoutType: "buyNow",
    createdAt: { $gte: startDate, $lte: endDate },
  }).countDocuments();

  // Order statuses
  const confirmed = orders.filter((o) => o.orderStatus === "Confirmed").length;

  const delivered = orders.filter((o) => o.orderStatus === "Delivered").length;
  const cancelled = orders.filter((o) => o.orderStatus === "Cancelled").length;
  const shipped = orders.filter((o) => o.orderStatus === "Shipped").length;
  const returned = orders.filter((o) => o.orderStatus === "Returned").length;
  const pending = orders.filter((o) => o.orderStatus === "Pending").length;
  const processing = orders.filter(
    (o) => o.orderStatus === "Processing",
  ).length;
  const partiallyCancelled = orders.filter(
    (o) => o.orderStatus === "PartiallyCancelled",
  ).length;
  const partiallyReturned = orders.filter(
    (o) => o.orderStatus === "PartiallyReturned",
  ).length;
  const returnPending = orders.filter(
    (o) => o.orderStatus === "ReturnPending",
  ).length;
  const returnRejected = orders.filter(
    (o) => o.orderStatus === "ReturnRejected",
  ).length;

  const formatDate = (date) => dayjs(date).format("DD/MM/YYYY hh:mm A");

  return {
    totalOrders,
    cartOrders,
    buynowOrders,
    totalAmount,
    totalDiscount,
    couponDeduction,
    totalRefunded,
    pending,
    confirmed,
    processing,
    shipped,
    delivered,
    cancelled,
    partiallyCancelled,
    returned,
    partiallyReturned,
    returnPending,
    returnRejected,
    filterType,
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  };
};

module.exports = generateSalesReport;
