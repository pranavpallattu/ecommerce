const Order = require("../models/orderSchema");
const dayjs = require("dayjs");
const isoWeek = require("dayjs/plugin/isoWeek");
const advancedFormat = require("dayjs/plugin/advancedFormat");
const { roundMoney } = require("../utils/currency");

dayjs.extend(isoWeek);
dayjs.extend(advancedFormat);
const formatDate = (date) => dayjs(date).format("DD/MM/YYYY hh:mm A");

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

  const totalAmount = roundMoney(
    orders.reduce((sum, order) => sum + (order.grandTotal || 0), 0),
  );

  // Calculate product discounts
  const totalDiscount = roundMoney(
    orders.reduce((sum, order) => {
      const orderDiscount = order.items.reduce((itemSum, item) => {
        const regular = item.productId?.regularPrice || 0;
        const sale = item.productId?.salePrice || 0;
        const discount = (regular - sale) * item.quantity;
        return itemSum + (discount > 0 ? discount : 0);
      }, 0);

      return sum + orderDiscount;
    }, 0),
  );

  const couponDeduction = roundMoney(
    orders.reduce((sum, order) => sum + (order.discount || 0), 0),
  );

  const totalRefunded = roundMoney(
    orders.reduce((sum, order) => {
      const refundTotal = (order.refunds || []).reduce(
        (rSum, refund) => rSum + (refund?.amount || 0),
        0,
      );

      return sum + refundTotal;
    }, 0),
  );

  const netRevenue = roundMoney(totalAmount - totalRefunded);

  const cartOrders = await Order.find({
    checkoutType: "cart",
    createdAt: { $gte: startDate, $lte: endDate },
  }).countDocuments();
  const buynowOrders = await Order.find({
    checkoutType: "buyNow",
    createdAt: { $gte: startDate, $lte: endDate },
  }).countDocuments();

  const totalItemsSold = orders.reduce((sum, order) => {
    return sum + order.items.reduce((s, item) => s + item.quantity, 0);
  }, 0);

  const averageOrderValue =
    totalOrders > 0 ? roundMoney(netRevenue / totalOrders) : 0;

  const paymentMethods = {
    cod: {
      count: 0,
      amount: 0,
      percentage: 0,
    },
    wallet: {
      count: 0,
      amount: 0,
      percentage: 0,
    },
    razorpay: {
      count: 0,
      amount: 0,
      percentage: 0,
    },
  };

  orders.forEach((order) => {
    if (order.paymentMethod in paymentMethods) {
      paymentMethods[order.paymentMethod].count++;
      paymentMethods[order.paymentMethod].amount += order.grandTotal || 0;
    }
  });

  Object.values(paymentMethods).forEach((method) => {
    method.amount = roundMoney(method.amount);
  });

  Object.values(paymentMethods).forEach((method) => {
    method.percentage =
      totalAmount > 0
        ? Number(((method.amount / totalAmount) * 100).toFixed(1))
        : 0;
  });

  const productsSold = new Set();

  orders.forEach((order) => {
    order.items.forEach((item) => {
      if (item.productId?._id) {
        productsSold.add(item.productId._id.toString());
      }
    });
  });

  const totalProductsSold = productsSold.size;

  const reportPeriod =
    filterType === "all"
      ? "All Time"
      : `${formatDate(startDate)} — ${formatDate(endDate)}`;

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

  const partiallyReturnPending = orders.filter(
    (o) => o.orderStatus === "PartiallyReturnPending",
  ).length;

  const partiallyReturnRejected = orders.filter(
    (o) => o.orderStatus === "PartiallyReturnRejected",
  ).length;

  return {
    totalOrders,
    cartOrders,
    buynowOrders,
    totalProductsSold,
    totalItemsSold,
    paymentMethods,
    averageOrderValue,
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
    partiallyReturnPending,
    partiallyReturned,
    returnPending,
    returnRejected,
    partiallyReturnRejected,
    netRevenue,
    filterType,
    reportPeriod,
  };
};

module.exports = generateSalesReport;
