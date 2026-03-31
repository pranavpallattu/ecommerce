// src/utils/generateInvoice.js
const PDFDocument = require("pdfkit");
const { PassThrough } = require("stream");
const supabase = require("../config/supabase");

// Company Configuration
const company = {
  name: "oneBazaar",
  address: "Kochi, Kerala - 682001",
  phone: "+91 484 123 4567",
  email: "support@onebazaar.in",
  gstin: "32AAABC1234D1Z5",        // Change later
};

const invoicePrefix = "OB";

/**
 * Professional Tax Invoice Generator for oneBazaar
 */
module.exports = async function generateInvoice(order) {
  const invoiceNumber = `${invoicePrefix}-${Date.now()}`;
  const fileName = `${invoiceNumber}.pdf`;
  const storagePath = `orders/${order._id}/${fileName}`;

  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    bufferPages: true,
  });

  const stream = new PassThrough();
  const chunks = [];

  doc.pipe(stream);
  stream.on("data", (chunk) => chunks.push(chunk));

  const currentDate = new Date();
  const invoiceDate = currentDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const invoiceTime = currentDate.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const colors = {
    primaryBlue: "#1e3a8a",
    secondaryBlue: "#3b82f6",
    lightBlue: "#eff6ff",
    lightGray: "#f9fafb",
    darkText: "#1f2937",
  };

  /* =====================================================
     HEADER
     ===================================================== */
  let y = 45;

  // Light blue header strip
  doc.rect(50, y - 8, 495, 92).fill(colors.lightBlue);

  // Logo Placeholder
  doc.circle(78, y + 32, 24).fill(colors.primaryBlue);
  doc.fillColor("#ffffff").fontSize(19).font("Helvetica-Bold").text("OB", 67, y + 24);

  // Company Name & Details
  doc
    .fillColor(colors.primaryBlue)
    .fontSize(26)
    .font("Helvetica-Bold")
    .text(company.name, 115, y + 18);

  doc
    .fillColor(colors.darkText)
    .fontSize(9.8)
    .font("Helvetica")
    .text(company.address, 115, y + 45)
    .text(`Phone: ${company.phone} | Email: ${company.email}`, 115, y + 56);

  if (company.gstin) {
    doc.text(`GSTIN: ${company.gstin}`, 115, y + 67);
  }

  // ==================== TAX INVOICE BOX (FIXED) ====================
  const boxX = 340;
  const boxY = y - 5;
  const boxWidth = 200;
  const boxHeight = 105;

  doc
    .rect(boxX, boxY, boxWidth, boxHeight)
    .fill("#ffffff")
    .lineWidth(2)
    .strokeColor(colors.primaryBlue)
    .stroke();

  // Title
  doc
    .fillColor(colors.primaryBlue)
    .fontSize(16.5)
    .font("Helvetica-Bold")
    .text("TAX INVOICE", boxX + 35, boxY + 18);

  // Meta Information
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor(colors.darkText);

  let metaY = boxY + 47;

  doc.text("Invoice No :", boxX + 20, metaY);
  doc.text(invoiceNumber, boxX + 110, metaY);

  metaY += 15;
  doc.text("Order ID   :", boxX + 20, metaY);
  doc.text(order._id.toString(), boxX + 110, metaY);

  metaY += 15;
  doc.text("Date       :", boxX + 20, metaY);
  doc.text(`${invoiceDate}  ${invoiceTime}`, boxX + 110, metaY);

  y += 115;

  /* =====================================================
     BILL TO
     ===================================================== */
  doc
    .fillColor(colors.primaryBlue)
    .fontSize(11.5)
    .font("Helvetica-Bold")
    .text("Bill To:", 50, y);

  const addr = order.address.snapshot;

  doc
    .fillColor(colors.darkText)
    .fontSize(10.6)
    .font("Helvetica")
    .text(addr.name, 50, y + 18)
    .text(addr.phone, 50, y + 31)
    .text(`${addr.streetAddress}${addr.landmark ? ", " + addr.landmark : ""}`, 50, y + 44)
    .text(`${addr.city}, ${addr.state} - ${addr.pincode}`, 50, y + 57)
    .text(addr.country || "India", 50, y + 70);

  y += 95;

  /* =====================================================
     ITEMS TABLE
     ===================================================== */
  const tableTop = y;
  const col1 = 50;
  const col2 = 285;
  const col3 = 355;
  const col4 = 455;

  // Table Header
  doc
    .rect(col1 - 5, tableTop, 500, 24)
    .fill(colors.lightBlue)
    .strokeColor(colors.secondaryBlue)
    .lineWidth(1.5)
    .stroke();

  doc
    .fillColor(colors.primaryBlue)
    .font("Helvetica-Bold")
    .fontSize(10.8)
    .text("Item Description", col1, tableTop + 7)
    .text("Qty", col2, tableTop + 7, { width: 60, align: "center" })
    .text("Rate (₹)", col3, tableTop + 7, { width: 80, align: "right" })
    .text("Amount (₹)", col4, tableTop + 7, { width: 80, align: "right" });

  let rowY = tableTop + 24;
  doc.font("Helvetica").fontSize(10.2).fillColor(colors.darkText);

  order.items.forEach((item, index) => {
    if (index % 2 === 1) {
      doc.rect(col1 - 5, rowY, 500, 23).fill(colors.lightGray);
    }

    const desc = item.productName.length > 52 
      ? item.productName.substring(0, 49) + "..." 
      : item.productName;

    doc.text(desc, col1, rowY + 7, { width: 225 });
    doc.text(item.quantity.toString(), col2, rowY + 7, { width: 60, align: "center" });
    doc.text(item.price.toFixed(2), col3, rowY + 7, { width: 80, align: "right" });
    doc.text(item.subtotal.toFixed(2), col4, rowY + 7, { width: 80, align: "right" });

    rowY += 23;
  });

  // Table Bottom Border
  doc
    .moveTo(col1 - 5, rowY + 4)
    .lineTo(545, rowY + 4)
    .strokeColor(colors.secondaryBlue)
    .lineWidth(1.5)
    .stroke();

  y = rowY + 35;

  /* =====================================================
     PRICING SUMMARY
     ===================================================== */
  const summaryX = 330;

  doc.fontSize(10.8).font("Helvetica").fillColor(colors.darkText);

  doc.text("Subtotal", summaryX, y);
  doc.text(`₹ ${order.subTotal.toFixed(2)}`, 485, y, { align: "right" });
  y += 19;

  if (order.discount > 0) {
    doc.text("Discount", summaryX, y);
    doc.text(`- ₹ ${order.discount.toFixed(2)}`, 485, y, { align: "right" });
    y += 19;
  }

  if (order.walletAmountUsed > 0) {
    doc.text("Wallet Used", summaryX, y);
    doc.text(`- ₹ ${order.walletAmountUsed.toFixed(2)}`, 485, y, { align: "right" });
    y += 19;
  }

  // Grand Total
  doc
    .font("Helvetica-Bold")
    .fontSize(13.5)
    .fillColor(colors.primaryBlue)
    .text("Grand Total", summaryX, y);

  doc
    .text(`₹ ${order.grandTotal.toFixed(2)}`, 485, y, { align: "right" });

  y += 40;

  /* =====================================================
     PAYMENT DETAILS
     ===================================================== */
  doc
    .fillColor(colors.primaryBlue)
    .fontSize(11.5)
    .font("Helvetica-Bold")
    .text("Payment Details:", 50, y);

  const isCOD = order.paymentMethod === "cod";

  doc
    .font("Helvetica")
    .fontSize(10.7)
    .fillColor(colors.darkText)
    .text(`Payment Method : ${isCOD ? "CASH ON DELIVERY" : order.paymentMethod.toUpperCase()}`, 50, y + 22);

  if (isCOD) {
    doc.text("Payment Status : Pending (To be collected on delivery)", 50, y + 38);
    doc.fontSize(10).text(`Amount Payable on Delivery : ₹ ${order.grandTotal.toFixed(2)}`, 50, y + 54);
  } else {
    doc.text(`Payment Status : ${order.paymentStatus}`, 50, y + 38);
    if (order.razorpayPaymentId) {
      doc.text(`Razorpay Payment ID : ${order.razorpayPaymentId}`, 50, y + 54);
    }
  }

  /* =====================================================
     FOOTER
     ===================================================== */
  const footerY = doc.page.height - 105;

  doc
    .moveTo(50, footerY - 12)
    .lineTo(545, footerY - 12)
    .lineWidth(1.2)
    .strokeColor(colors.secondaryBlue)
    .stroke();

  doc
    .fontSize(10)
    .fillColor(colors.primaryBlue)
    .text("Thank you for shopping with oneBazaar!", 50, footerY, { align: "center", width: 495 });

  doc
    .fontSize(8.5)
    .fillColor(colors.darkText)
    .text(
      "• This is a computer-generated invoice and does not require any signature.\n" +
      "• Goods once sold will not be taken back except as per our return & refund policy.",
      50,
      footerY + 18,
      { align: "center", width: 495 }
    );

  // Page Numbers
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .fillColor(colors.secondaryBlue)
      .text(`Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 35, {
        align: "center",
        width: doc.page.width - 100,
      });
  }

  doc.end();

  /* ==================== SAVE PDF ==================== */
  await new Promise((resolve) => stream.on("end", resolve));
  const pdfBuffer = Buffer.concat(chunks);

  const { error } = await supabase.storage
    .from("invoices")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) throw new Error("Invoice upload failed: " + error.message);

  const { data: urlData } = await supabase.storage
    .from("invoices")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

  return {
    invoiceNumber,
    storagePath,
    invoiceUrl: urlData.signedUrl,
    generatedAt: new Date(),
  };
};