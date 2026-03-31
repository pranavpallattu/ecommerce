const Order = require("../../models/orderSchema");
const generateInvoice = require("../../services/invoiceService");


exports.createInvoiceIfNeeded = async (orderId) => {
  const order = await Order.findById(orderId).populate("items.productId");

  if (!order) throw new Error("Order not found");

  // Only paid orders
// Allow invoice for both Paid and COD
// if (!["Paid", "Pending", "N/A"].includes(order.paymentStatus)) return;
// Only prevent duplicate invoices
if (order.invoice?.number) return;
  // Prevent duplicates
  if (order.invoice?.number) return;

  const { invoiceNumber, invoiceUrl, storagePath } =
    await generateInvoice(order);

    // console.log(invoiceNumber,  invoiceUrl,   storagePath);
    

  order.invoice = {
    number: invoiceNumber,
    url: invoiceUrl,
    storagePath,
    generatedAt: new Date(),
  };

  await order.save();
};



exports.downloadInvoice = async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId);

  if (!order || !order.invoice?.number) {
    return res.status(404).json({ message: "Invoice not found" });
  }

  const filePath = `invoices/${order.invoice.number}.pdf`;

  res.download(filePath);
};
