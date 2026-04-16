// src/utils/generateInvoice.js
const PDFDocument = require("pdfkit");
const { PassThrough } = require("stream");
const supabase = require("../config/supabase");

const COMPANY = {
  name: "oneBazaar",
  address: "Kochi, Kerala - 682001",
  phone: "+91 484 123 4567",
  email: "support@onebazaar.in",
  gstin: "32AAABC1234D1Z5",
};

const INVOICE_PREFIX = "OB";

const COLORS = {
  navy: "#1e3a8a",
  sky: "#0ea5e9",
  white: "#ffffff",
  offWhite: "#f8fafc",
  rowAlt: "#f1f5f9",
  dark: "#1e293b",
  muted: "#64748b",
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 45;
const CONTENT_W = PAGE_W - MARGIN * 2;

function hRule(doc, y, color = COLORS.sky, w = 1) {
  doc
    .save()
    .moveTo(MARGIN, y)
    .lineTo(PAGE_W - MARGIN, y)
    .lineWidth(w)
    .strokeColor(color)
    .stroke()
    .restore();
}

function formatINR(n) {
  return `INR ${Number(n || 0).toFixed(2)}`;
}

function textRight(doc, txt, x, y, width) {
  doc.text(txt, x, y, { width, align: "right" });
}

function textCenter(doc, txt, x, y, width) {
  doc.text(txt, x, y, { width, align: "center" });
}

// ====================== PDF BUFFER GENERATOR ======================
async function generatePdfBuffer(order, invoiceNumber) {
  const orderDate = new Date(order.createdAt || Date.now());
  const dateStr = orderDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = orderDate.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    bufferPages: true,
    info: { Title: `Invoice ${invoiceNumber}`, Author: "oneBazaar" },
  });

  const stream = new PassThrough();
  const chunks = [];
  doc.pipe(stream);
  stream.on("data", (c) => chunks.push(c));

  // ── 1. HEADER ───────────────────────────────────────────────────────────────
  const HEADER_H = 90;
  doc.rect(0, 0, PAGE_W, HEADER_H).fill(COLORS.navy);

  doc
    .font("Helvetica-Bold")
    .fontSize(26)
    .fillColor(COLORS.white)
    .text("oneBazaar", MARGIN, 28);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#93c5fd")
    .text(`${COMPANY.address} | ${COMPANY.phone}`, MARGIN, 58)
    .text(`${COMPANY.email} | GSTIN: ${COMPANY.gstin}`, MARGIN, 71);

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(COLORS.sky)
    .text("TAX INVOICE", 0, 30, { width: PAGE_W - MARGIN, align: "right" });

  let y = HEADER_H + 18;

  // ── 2. META ROW ─────────────────────────────────────────────────────────────
  doc.rect(MARGIN, y, CONTENT_W, 34).fill(COLORS.offWhite);

  const metaItems = [
    { label: "Invoice No", value: invoiceNumber },
    { label: "Order ID", value: String(order._id) },
    { label: "Date", value: `${dateStr} ${timeStr}` },
    { label: "Status", value: order.orderStatus || "Confirmed" },
  ];

  const colW = CONTENT_W / metaItems.length;
  metaItems.forEach(({ label, value }, i) => {
    const cx = MARGIN + i * colW;
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.muted)
      .text(label.toUpperCase(), cx + 8, y + 5, { width: colW - 10 });
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLORS.dark)
      .text(value, cx + 8, y + 16, { width: colW - 10 });
  });

  y += 50;

  // ── 3. BILL TO + PAYMENT INFO ────────────────────────────────────────────────
  const BOX_H = 110;
  const HALF = (CONTENT_W - 12) / 2;

  // Bill To Box
  doc
    .rect(MARGIN, y, HALF, BOX_H)
    .lineWidth(0.5)
    .strokeColor("#cbd5e1")
    .fillAndStroke(COLORS.offWhite, "#cbd5e1");

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.navy)
    .text("BILL TO", MARGIN + 10, y + 10);

  const addr = order.address.snapshot || {};
  const addrLines = [
    addr.name || "",
    addr.phone || "",
    addr.streetAddress + (addr.landmark ? ", " + addr.landmark : ""),
    `${addr.city}, ${addr.state} - ${addr.pincode}`,
    addr.country || "India",
  ];

  addrLines.forEach((line, i) => {
    if (i === 0) doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.dark);
    else doc.font("Helvetica").fontSize(9).fillColor(COLORS.dark);
    doc.text(line, MARGIN + 10, y + 24 + i * 14, { width: HALF - 20 });
  });

  // Payment Details Box
  const rightX = MARGIN + HALF + 12;
  doc
    .rect(rightX, y, HALF, BOX_H)
    .lineWidth(0.5)
    .strokeColor("#cbd5e1")
    .fillAndStroke(COLORS.offWhite, "#cbd5e1");

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.navy)
    .text("PAYMENT DETAILS", rightX + 10, y + 10);

  const isCOD = order.paymentMethod === "cod";
  const payRows = [
    ["Method", isCOD ? "Cash on Delivery" : order.paymentMethod.toUpperCase()],
    ["Status", isCOD ? "Pending (COD)" : order.paymentStatus || "Paid"],
    ...(order.razorpayPaymentId ? [["Txn ID", order.razorpayPaymentId]] : []),
    ...(order.razorpayOrderId ? [["Order Ref", order.razorpayOrderId]] : []),
  ];

  payRows.forEach(([lbl, val], i) => {
    const ry = y + 26 + i * 17;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(lbl, rightX + 10, ry, { width: 65 });
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COLORS.dark)
      .text(val, rightX + 80, ry, { width: HALF - 90 });
  });

  y += BOX_H + 22;

  // ── 4. ITEMS TABLE ──────────────────────────────────────────────────────────
  const COLS = {
    no: { label: "#", x: MARGIN, w: 25, align: "center" },
    desc: { label: "Item Description", x: MARGIN + 25, w: 230, align: "left" },
    qty: { label: "Qty", x: MARGIN + 255, w: 45, align: "center" },
    rate: { label: "Rate", x: MARGIN + 300, w: 90, align: "right" },
    amount: { label: "Amount", x: MARGIN + 390, w: 115, align: "right" },
  };

  const TH = 24;
  doc.rect(MARGIN, y, CONTENT_W, TH).fill(COLORS.navy);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.white);

  Object.values(COLS).forEach(({ label, x, w, align }) => {
    doc.text(label, x + 4, y + 8, { width: w - 8, align });
  });

  let ry = y + TH;
  const ROW_H = 26;

  order.items.forEach((item, i) => {
    doc
      .rect(MARGIN, ry, CONTENT_W, ROW_H)
      .fill(i % 2 === 0 ? COLORS.white : COLORS.rowAlt);

    const textY = ry + 8;
    const name =
      item.productName?.length > 55
        ? item.productName.slice(0, 52) + "..."
        : item.productName || "";

    doc.fillColor(COLORS.dark);
    textCenter(doc, String(i + 1), COLS.no.x + 4, textY, COLS.no.w - 8);
    doc.text(name, COLS.desc.x + 4, textY, { width: COLS.desc.w - 8 });
    textCenter(
      doc,
      String(item.quantity),
      COLS.qty.x + 4,
      textY,
      COLS.qty.w - 8,
    );
    textRight(
      doc,
      formatINR(item.price),
      COLS.rate.x + 4,
      textY,
      COLS.rate.w - 8,
    );
    textRight(
      doc,
      formatINR(item.subtotal),
      COLS.amount.x + 4,
      textY,
      COLS.amount.w - 8,
    );

    ry += ROW_H;
  });

  hRule(doc, ry + 1, COLORS.sky, 1.5);
  y = ry + 28; // Good spacing after table

  // ── 5. TOTALS SECTION ───────────────────────────────────────────────────────
  const TOTAL_LBL_X = MARGIN + 290;
  const TOTAL_VAL_X = MARGIN + 390;
  const TOTAL_VAL_W = 115;
  const LINE_H = 21;

  const totals = [{ label: "Subtotal", value: formatINR(order.subTotal) }];

  // Add Discount only if > 0
  if (order.discount > 0) {
    totals.push({
      label: `Discount${order.couponCode ? ` (${order.couponCode})` : ""}`,
      value: `- ${formatINR(order.discount)}`,
    });
  }

  // Add Wallet Used only if > 0
  if (order.walletAmountUsed > 0) {
    totals.push({
      label: "Wallet Used",
      value: `- ${formatINR(order.walletAmountUsed)}`,
    });
  }

  doc.font("Helvetica").fontSize(9.8).fillColor(COLORS.muted);

  totals.forEach(({ label, value }) => {
    doc.text(label, TOTAL_LBL_X, y, { width: 95, align: "right" });
    textRight(doc, value, TOTAL_VAL_X + 4, y, TOTAL_VAL_W - 8);
    y += LINE_H;
  });

  hRule(doc, y + 3, "#cbd5e1", 0.8);
  y += 14;

  // ====================== GRAND TOTAL BOX (Fixed) ======================
  const boxWidth = CONTENT_W - (TOTAL_LBL_X - MARGIN) + 15;
  doc.rect(TOTAL_LBL_X - 12, y - 8, boxWidth, 38).fill(COLORS.navy);

  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.white);
  doc.text("GRAND TOTAL", TOTAL_LBL_X, y + 6, { width: 95, align: "right" });
  textRight(
    doc,
    formatINR(order.grandTotal),
    TOTAL_VAL_X + 4,
    y + 6,
    TOTAL_VAL_W - 8,
  );

  y += 55;

  // ── 6. FOOTER ───────────────────────────────────────────────────────────────
  const FOOTER_Y = PAGE_H - 70;
  hRule(doc, FOOTER_Y, COLORS.sky, 1);

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.navy)
    .text("Thank you for shopping with oneBazaar!", MARGIN, FOOTER_Y + 10, {
      width: CONTENT_W,
      align: "center",
    });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(
      "This is a computer-generated invoice. No signature required. | " +
        "Goods once sold are not taken back except per our return & refund policy.",
      MARGIN,
      FOOTER_Y + 28,
      { width: CONTENT_W, align: "center" },
    );

  // Page Numbers
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.muted)
      .text(`Page ${i + 1} of ${pageCount} | oneBazaar`, MARGIN, PAGE_H - 22, {
        width: CONTENT_W,
        align: "center",
      });
  }

  doc.end();
  await new Promise((resolve) => stream.on("end", resolve));
  return Buffer.concat(chunks);
}

// ====================== MAIN FUNCTION ======================
module.exports = async function generateInvoice(order) {
  const invoiceNumber = `${INVOICE_PREFIX}-${Date.now()}`;
  const storagePath = `orders/${order._id}/${invoiceNumber}.pdf`;

  const pdfBuffer = await generatePdfBuffer(order, invoiceNumber);

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
