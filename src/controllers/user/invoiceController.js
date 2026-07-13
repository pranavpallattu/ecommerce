const supabase = require("../../config/supabase");
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

  // const { invoiceNumber, invoiceUrl, storagePath } =
  //   await generateInvoice(order);

    // console.log(invoiceNumber,  invoiceUrl,   storagePath);
    

 const { invoiceNumber, storagePath, generatedAt } =
  await generateInvoice(order);

order.invoice = {
  number: invoiceNumber,
  storagePath,
  generatedAt,
};

  await order.save();
};



exports.downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    if (!order || !order.invoice?.storagePath) {
      return res.status(404).json({
        message: "Invoice not found",
      });
    }

    const { data, error } = await supabase.storage
      .from("invoices")
      .createSignedUrl(order.invoice.storagePath, 60 * 10); // 10 minutes

    if (error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.redirect(data.signedUrl);
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Failed to download invoice",
    });
  }
};
