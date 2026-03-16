const PDFDocument = require("pdfkit");
const { PassThrough } = require("stream");
const { invoicePrefix, company } = require("../config/invoice");
const supabase = require("../config/supabase");

module.exports = async function generateInvoice(order) {
  const invoiceNumber = `${invoicePrefix}-${Date.now()}`;
  const fileName = `${invoiceNumber}.pdf`;
  const storagePath = `orders/${order._id}/${fileName}`;

  /* ---------- PDF Setup ---------- */
  const doc = new PDFDocument({ margin: 50 });
  const stream = new PassThrough();
  const chunks = [];

  doc.pipe(stream);
  stream.on("data", (chunk) => chunks.push(chunk));

  /* =====================================================
     🏢 COMPANY DETAILS
     ===================================================== */
  doc.fontSize(18).text(company.name);
  doc.fontSize(10).text(company.address);
  doc.text(company.phone);
  doc.moveDown();

  /* =====================================================
     🧾 INVOICE META
     ===================================================== */
  doc.fontSize(14).text(`Invoice No: ${invoiceNumber}`);
  doc.fontSize(11).text(`Order ID: ${order._id}`);
  doc.text(`Invoice Date: ${new Date().toLocaleDateString("en-IN")}`);
  doc.text(`Checkout Type: ${order.checkoutType}`);
  doc.text(`Order Status: ${order.orderStatus}`);
  doc.moveDown();

  /* =====================================================
     👤 CUSTOMER DETAILS
     ===================================================== */
  const addr = order.address.snapshot;

  doc.fontSize(12).text(`Customer Name: ${addr.name}`);
  doc.text(`Phone: ${addr.phone}`);
  doc.text(
    `Address (${addr.addressType}): ${addr.streetAddress}, ${addr.landmark}, ${addr.city}, ${addr.state} - ${addr.pincode}, ${addr.country}`
  );
  doc.moveDown();

  /* =====================================================
     📦 ITEMS
     ===================================================== */
  doc.fontSize(13).text("Items:");
  order.items.forEach((item, index) => {
    doc.fontSize(11).text(
      `${index + 1}. ${item.productName} × ${item.quantity}  — ₹${item.subtotal}`
    );
  });

  doc.moveDown();

  /* =====================================================
     💰 PRICING SUMMARY
     ===================================================== */
  doc.fontSize(12).text(`Subtotal: ₹${order.subTotal}`);
  doc.text(`Discount: ₹${order.discount}`);
  doc.text(`Wallet Used: ₹${order.walletAmountUsed || 0}`);
  doc.fontSize(13).text(`Grand Total: ₹${order.grandTotal}`);
  doc.moveDown();

  /* =====================================================
     💳 PAYMENT DETAILS
     ===================================================== */
  doc.fontSize(12).text("Payment Details:");
  doc.text(`Payment Method: ${order.paymentMethod}`);
  doc.text(`Payment Status: ${order.paymentStatus}`);

  if (order.razorpayPaymentId) {
    doc.text(`Razorpay Payment ID: ${order.razorpayPaymentId}`);
  }

  if (order.walletAmountUsed > 0) {
    doc.text(`Wallet Transaction: Debit`);
  }

  doc.moveDown();

  /* =====================================================
     🔁 RETURN / REFUND INFO (OPTIONAL)
     ===================================================== */
  if (order.cancelledAt || order.refunds?.length) {
    doc.fontSize(12).text("Return / Refund Information:");

    if (order.cancelledAt) {
      doc.text(`Cancelled On: ${new Date(order.cancelledAt).toLocaleDateString("en-IN")}`);
      doc.text(`Cancellation Reason: ${order.cancelledReason || "N/A"}`);
    }

    if (order.refunds?.length) {
      order.refunds.forEach((refund, i) => {
        doc.text(
          `Refund ${i + 1}: ₹${refund.amount} on ${new Date(refund.date).toLocaleDateString("en-IN")}`
        );
      });
    }

    doc.moveDown();
  }

  /* =====================================================
     📝 NOTES
     ===================================================== */
  doc.fontSize(10).text("Notes:");
  doc.text("• This is a system generated invoice.");
  doc.text("• Goods once sold cannot be returned except as per policy.");

  doc.end();

  /* ---------- Finish PDF ---------- */
  await new Promise((resolve) => stream.on("end", resolve));
  const pdfBuffer = Buffer.concat(chunks);

  /* =====================================================
     ☁️ UPLOAD TO SUPABASE
     ===================================================== */
  const { error } = await supabase.storage
    .from("invoices")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (error) {
    throw new Error("Invoice upload failed: " + error.message);
  }

  /* ---------- Signed URL (7 days) ---------- */
  const { data } = await supabase.storage
    .from("invoices")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

  return {
    invoiceNumber,
    storagePath,
    invoiceUrl: data.signedUrl,
  };
};
