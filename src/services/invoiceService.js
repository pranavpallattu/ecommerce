const PDFDocument = require("pdfkit");
const { PassThrough } = require("stream");
const supabase = require("../config/supabase");
const { roundMoney } = require("../utils/currency");

const COMPANY = {
  name: "oneBazaar",
  address: "Kochi, Kerala - 682001",
  phone: "+91 484 123 4567",
  email: "support@onebazaar.in",
  website: "www.onebazaar.in",
  gstin: "32AAABC1234D1Z5",
};

const INVOICE_PREFIX = "OB";

const COLORS = {
  navy: "#1e3a8a",
  sky: "#0ea5e9",
  headerBg: "#dbeafe",
  savedBg: "#eff6ff",
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
const RIGHT_EDGE = MARGIN + CONTENT_W;

function hRule(doc, y, color = COLORS.sky, w = 1) {
  doc
    .save()
    .moveTo(MARGIN, y)
    .lineTo(RIGHT_EDGE, y)
    .lineWidth(w)
    .strokeColor(color)
    .stroke()
    .restore();
}

// CHANGED: back to "INR" prefix (no ₹ symbol) per latest request, but kept Indian
// thousands grouping — "INR 1,499.00" instead of the old ungrouped "INR 1499.00".
function formatINR(n) {
  return `INR ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function textRight(doc, txt, x, y, width) {
  doc.text(txt, x, y, { width, align: "right" });
}

function textCenter(doc, txt, x, y, width) {
  doc.text(txt, x, y, { width, align: "center" });
}

const PAYMENT_METHOD_LABELS = {
  cod: "Cash on Delivery",
  razorpay: "Razorpay",
  wallet: "Wallet",
};

// ---------- PDF BUFFER GENERATOR ----------
async function generatePdfBuffer(order, invoiceNumber) {
  const orderDate = new Date(order.createdAt || Date.now());
  const invoiceDate = new Date();

  const fmtDate = (d) =>
    d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
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

  // ---------- HEADER ----------
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

  // ---------- META ROW ----------
  // CHANGED: split single "Payment Date" into separate "Order Date" and "Invoice Date",
  // now 5 columns. Box height increased so longer values (Order ID) can wrap if needed.
  const META_H = 42;
  doc.rect(MARGIN, y, CONTENT_W, META_H).fill(COLORS.offWhite);

  const metaItems = [
    { label: "Invoice No", value: invoiceNumber },
    { label: "Order ID", value: String(order._id) },
    { label: "Order Date", value: fmtDate(orderDate) },
    { label: "Invoice Date", value: fmtDate(invoiceDate) },
    { label: "Payment Status", value: order.paymentStatus || "Pending" },
  ];

  const colW = CONTENT_W / metaItems.length;
  metaItems.forEach(({ label, value }, i) => {
    const cx = MARGIN + i * colW;
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(COLORS.muted)
      .text(label.toUpperCase(), cx + 8, y + 6, { width: colW - 12 });
    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(COLORS.dark)
      .text(value, cx + 8, y + 17, { width: colW - 12 });
  });

  y += META_H + 16;

  // ---------- BILL TO + PAYMENT INFO ----------
  const BOX_H = 110;
  const HALF = (CONTENT_W - 12) / 2;

  doc
    .rect(MARGIN, y, HALF, BOX_H)
    .lineWidth(0.5)
    .strokeColor("#cbd5e1")
    .fillAndStroke(COLORS.offWhite, "#cbd5e1");
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.navy)
    .text("BILLING ADDRESS", MARGIN + 10, y + 10);

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
    [
      "Payment Method",
      PAYMENT_METHOD_LABELS[order.paymentMethod] ||
        order.paymentMethod.toUpperCase(),
    ],
    ["Payment Status", isCOD ? "Pending" : order.paymentStatus || "Paid"],
    ...(isCOD ? [["Payment Due", "On Delivery"]] : []),
    ...(order.razorpayPaymentId
      ? [["Payment ID", order.razorpayPaymentId]]
      : []),
    ...(order.razorpayOrderId ? [["Order ID", order.razorpayOrderId]] : []),
  ];

  payRows.forEach(([lbl, val], i) => {
    const ry = y + 26 + i * 17;

    // Label
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(lbl, rightX + 10, ry, {
        width: 75,
      });

    // Value
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COLORS.dark)
      .text(val, rightX + 90, ry, {
        width: HALF - 100,
        lineBreak: false,
      });
  });

  y += BOX_H + 22;

  // ---------- ORDER SUMMARY ----------
  const itemCount = order.items.length;
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);

  const paymentMethodLabel = {
    cod: "Cash on Delivery",
    wallet: "Wallet",
    razorpay: "Razorpay",
  };

  const summaryItems = [
    {
      label: "Products Sold",
      value: String(itemCount),
    },
    {
      label: "Units Sold",
      value: String(totalQty),
    },
    {
      label: "Order Status",
      value: order.orderStatus || "Confirmed",
    },
    {
      label: "Payment Method",
      value: paymentMethodLabel[order.paymentMethod] || "N/A",
    },
    {
      label: "Payment Status",
      value: isCOD ? "Pending" : order.paymentStatus || "Pending",
    },
  ];

  const SUM_H = 54;
  const sumGap = 10;
  const sumW =
    (CONTENT_W - sumGap * (summaryItems.length - 1)) / summaryItems.length;

  summaryItems.forEach((item, i) => {
    const sx = MARGIN + i * (sumW + sumGap);
    doc
      .roundedRect(sx, y, sumW, SUM_H, 6)
      .fillAndStroke(COLORS.headerBg, "#bfdbfe");
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.navy)
      .text(item.label.toUpperCase(), sx + 10, y + 10, { width: sumW - 20 });
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(COLORS.navy)
      .text(item.value, sx + 10, y + 26, { width: sumW - 20 });
  });

  y += SUM_H + 22;

  // ---------- ITEMS TABLE ----------
  // CHANGED: standard invoice terminology — "Product", "Unit Price", "Total"
  const COLS = {
    no: { label: "#", x: MARGIN, w: 25, align: "center" },
    desc: { label: "Product", x: MARGIN + 25, w: 210, align: "left" },
    qty: { label: "Qty", x: MARGIN + 235, w: 45, align: "center" },
    rate: { label: "Unit Price", x: MARGIN + 280, w: 110, align: "right" },
    amount: { label: "Total", x: MARGIN + 390, w: 115, align: "right" },
  };

  const TH = 24;
  doc.rect(MARGIN, y, CONTENT_W, TH).fill(COLORS.headerBg);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.navy);
  Object.values(COLS).forEach(({ label, x, w, align }) =>
    doc.text(label, x + 4, y + 8, { width: w - 8, align }),
  );

  let ry = y + TH;
  const ROW_H = 26;

  let offerDiscount = 0;

  order.items.forEach((item, i) => {
    doc
      .rect(MARGIN, ry, CONTENT_W, ROW_H)
      .fill(i % 2 === 0 ? COLORS.white : COLORS.rowAlt);

    const textY = ry + 8;
    const name =
      item.productName?.length > 50
        ? item.productName.slice(0, 47) + "..."
        : item.productName || "";

    const regularPrice = item.productId?.regularPrice;
    if (regularPrice && regularPrice > item.price) {
      offerDiscount += (regularPrice - item.price) * item.quantity;
    }

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

  offerDiscount = roundMoney(offerDiscount);

  hRule(doc, ry + 1, COLORS.sky, 1.5);
  y = ry + 28;

  // ---------- TOTALS SECTION ----------
  const TOTAL_LBL_X = MARGIN + 290;
  const TOTAL_VAL_X = MARGIN + 390;
  const TOTAL_VAL_W = 115;
  const LINE_H = 21;

  // CHANGED: Coupon code and Coupon Discount now shown as two separate rows
  // instead of "Coupon (CODE)" combined into one label.
  const totals = [
    { label: "Subtotal", value: formatINR(order.subTotal) },
    {
      label: "Offer Discount",
      value: offerDiscount > 0 ? `${formatINR(offerDiscount)}` : formatINR(0),
    },
  ];

  if (order.discount > 0) {
    if (order.couponCode)
      totals.push({ label: "Coupon", value: order.couponCode });
    totals.push({
      label: "Coupon Discount",
      value: `${formatINR(order.discount)}`,
    });
  }

  totals.push({ label: "Shipping Charge", value: "FREE" });

  if (order.walletAmountUsed > 0) {
    totals.push({
      label: "Wallet Used",
      value: `${formatINR(order.walletAmountUsed)}`,
    });
  }

  totals.forEach(({ label, value }) => {
    doc.font("Helvetica").fontSize(9.8).fillColor(COLORS.muted);
    doc.text(label, TOTAL_LBL_X, y, { width: 95, align: "right" });
    doc.font("Helvetica-Bold").fillColor(COLORS.dark);
    textRight(doc, value, TOTAL_VAL_X + 4, y, TOTAL_VAL_W - 8);
    y += LINE_H;
  });

  // ---------- YOU SAVED (new) ----------
  const totalSavings = roundMoney(offerDiscount + (order.discount || 0));
  if (totalSavings > 0) {
    y += 4;
    const saveBoxH = 26;
    doc
      .roundedRect(
        TOTAL_LBL_X - 12,
        y - 6,
        RIGHT_EDGE - (TOTAL_LBL_X - 12),
        saveBoxH,
        5,
      )
      .fill(COLORS.savedBg);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.navy);
    doc.text("YOU SAVED", TOTAL_LBL_X, y, { width: 95, align: "right" });
    textRight(
      doc,
      formatINR(totalSavings),
      TOTAL_VAL_X + 4,
      y,
      TOTAL_VAL_W - 8,
    );
    y += saveBoxH + 6;
  }

  hRule(doc, y + 3, "#cbd5e1", 0.8);
  y += 14;

  // ---------- GRAND TOTAL BOX ----------
  // FIXED: box now spans a fixed width anchored exactly to RIGHT_EDGE (was overshooting
  // the page's right margin before), and label/value are vertically centered using a
  // computed offset instead of a hardcoded y+6 that sat unevenly inside the box.
  const GT_H = 38;
  const GT_Y = y - 8;
  const GT_X = TOTAL_LBL_X - 12;
  const GT_W = RIGHT_EDGE - GT_X;
  const GT_FONT = 13;
  const GT_TEXT_Y = GT_Y + (GT_H - GT_FONT) / 2 - 1;

  doc.rect(GT_X, GT_Y, GT_W, GT_H).fill(COLORS.navy);
  doc.font("Helvetica-Bold").fontSize(GT_FONT).fillColor(COLORS.white);
  doc.text("GRAND TOTAL", TOTAL_LBL_X, GT_TEXT_Y, {
    width: 95,
    align: "right",
  });
  textRight(
    doc,
    formatINR(order.grandTotal),
    TOTAL_VAL_X + 4,
    GT_TEXT_Y,
    TOTAL_VAL_W - 8,
  );

  y = GT_Y + GT_H + 25;

  // ---------- FOOTER ----------
  const FOOTER_Y = PAGE_H - 100;

  doc
    .save()
    .dash(3, { space: 2 })
    .moveTo(MARGIN, FOOTER_Y)
    .lineTo(RIGHT_EDGE, FOOTER_Y)
    .lineWidth(1)
    .strokeColor(COLORS.sky)
    .stroke()
    .undash()
    .restore();

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
    .text("oneBazaar • One World. Infinite Finds.", MARGIN, FOOTER_Y + 25, {
      width: CONTENT_W,
      align: "center",
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.dark)
    .text(
      `For support: ${COMPANY.email}  |  ${COMPANY.website}`,
      MARGIN,
      FOOTER_Y + 39,
      { width: CONTENT_W, align: "center" },
    );

  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(COLORS.muted)
    .text(
      "This is a computer-generated invoice. No signature required. Goods once sold are not taken back except as per our Return & Refund Policy.",
      MARGIN,
      FOOTER_Y + 53,
      { width: CONTENT_W, align: "center" },
    );

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

// ---------- MAIN FUNCTION ----------
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
    generatedAt: new Date(),
  };
};
