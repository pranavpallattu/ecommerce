const generateSalesReport = require("../../services/salesReportService");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const formatCurrency = require("../../utils/formatCurrency");

exports.getSalesReport = async (req, res) => {
  try {
    const { filterType = "all", startDate, endDate } = req.query;

    const data = await generateSalesReport({ filterType, startDate, endDate });
    console.log(data);

    return res.status(200).json({
      success: true,
      message: "Sales report summary fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Error fetching sales report:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// src/controllers/salesController.js
const dayjs = require("dayjs");


exports.downloadSalesPDF = async (req, res) => {
  try {
    const data = await generateSalesReport(req.body);

    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      compress: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Sales_Report_OneBazaar.pdf"',
    );

    doc.pipe(res);

    // ====================== HEADER WITH LOGO ======================
    const logoUrl =
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSgiPftJFEcFuclHRqhqXpbM58OXt2F5zRmtA&s";

    // Try to add logo
    try {
      doc.image(logoUrl, 48, 40, { width: 85 });
    } catch (e) {
      // Fallback if image fails to load
      doc
        .fontSize(68)
        .font("Helvetica-Bold")
        .fillColor("#1e40af")
        .text("1", 65, 38);
    }

    // App Name
    doc
      .fontSize(26)
      .font("Helvetica-Bold")
      .fillColor("#1e40af")
      .text("One Bazaar", 145, 52);

    // Tagline
    doc
      .fontSize(11)
      .font("Helvetica")
      .fillColor("#64748b")
      .text("One World. Infinite Finds.", 145, 80);

    // Generated Date
    doc
      .fontSize(10)
      .fillColor("#64748b")
      .text(`Generated: ${dayjs().format("DD MMMM YYYY • hh:mm A")}`, 380, 65, {
        align: "right",
      });

    doc.moveDown(4);

    // Blue Divider
    doc.moveTo(50, doc.y).lineTo(550, doc.y).lineWidth(2.5).stroke("#1e40af");
    doc.moveDown(2.5);

    // ====================== CENTERED TITLE ======================
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .fillColor("#1e3a8a")
      .text("Sales Report", { align: "center" });

    doc.moveDown(0.5);

    doc
      .fontSize(12)
      .font("Helvetica")
      .fillColor("#475569")
      .text(`${data.startDate} — ${data.endDate}`, { align: "center" });

    doc.moveDown(2.5);

    // ====================== OVERALL SUMMARY ======================
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .fillColor("#1e40af")
      .text("Overall Summary");

    doc.moveDown(0.8);

    const summaryX = 70;
    doc.fontSize(12).font("Helvetica");

    const summaryData = [
      ["Total Orders", data.totalOrders],
      ["Cart Orders", data.cartOrders],
      ["Buy Now Orders", data.buynowOrders],
      ["Total Revenue", formatCurrency(data.totalAmount)],
      ["Total Discount", formatCurrency(data.totalDiscount)],
      ["Coupon Deduction", formatCurrency(data.couponDeduction)],
      ["Total Refunded", formatCurrency(data.totalRefunded)],
    ];

    summaryData.forEach(([label, value]) => {
      doc.text(label, summaryX, doc.y);
      doc.text(String(value), 400, doc.y, { align: "right" });
      doc.moveDown(0.7);
    });

    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke("#94a3b8");
    doc.moveDown(1.5);

    // ====================== ORDER STATUS BREAKDOWN ======================
    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .fillColor("#1e40af")
      .text("Order Status Breakdown");

    doc.moveDown(0.8);

    doc.fontSize(11).font("Helvetica-Bold");
    doc.text("Status", 70, doc.y);
    doc.text("Count", 420, doc.y);
    doc.moveDown(0.4);
    doc.moveTo(60, doc.y).lineTo(530, doc.y).stroke("#64748b");
    doc.moveDown(0.5);

    doc.font("Helvetica").fontSize(11).fillColor("#334155");

    const statusList = [
      ["Pending", data.pending],
      ["Confirmed", data.confirmed],
      ["Processing", data.processing],
      ["Shipped", data.shipped],
      ["Delivered", data.delivered],
      ["Cancelled", data.cancelled],
      ["Partially Cancelled", data.partiallyCancelled],
      ["Returned", data.returned],
      ["Partially Returned", data.partiallyReturned],
      ["Return Pending", data.returnPending],
      ["Return Rejected", data.returnRejected],
    ];

    statusList.forEach(([status, count]) => {
      doc.text(status, 70, doc.y);
      doc.text(String(count || 0), 420, doc.y, { align: "right" });
      doc.moveDown(0.65);
    });

    // ====================== FOOTER ======================
    doc
      .fontSize(10)
      .fillColor("#64748b")
      .text("One Bazaar • One World. Infinite Finds.", 50, 780, {
        align: "center",
      });

    doc.end();
  } catch (err) {
    console.error("PDF Generation Error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to generate PDF report" });
  }
};
exports.downloadSalesExcel = async (req, res) => {
  try {
    const data = await generateSalesReport(req.body);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("One Bazaar Sales Report");

    // ---------- HEADER ----------
    sheet.mergeCells("A1", "B1");
    sheet.getCell("A1").value = "One Bazaar Sales Report";
    sheet.getCell("A1").font = { size: 18, bold: true };
    sheet.getCell("A1").alignment = { horizontal: "center" };

    sheet.addRow([]);
    sheet.addRow(["Generated On", new Date().toLocaleString()]);
    sheet.addRow([]);

    // ---------- DATE RANGE ----------
    sheet.addRow(["Start Date", data.startDate]);
    sheet.addRow(["End Date", data.endDate]);
    sheet.addRow([]);

    // ---------- SUMMARY ----------
    sheet.addRow(["Total Orders", data.totalOrders]);
    sheet.addRow(["Cart Orders", data.cartOrders]);
    sheet.addRow(["Buy Now Orders", data.buynowOrders]);

    sheet.addRow(["Total Revenue", `₹${data.totalAmount}`]);
    sheet.addRow(["Total Discount", `₹${data.totalDiscount}`]);
    sheet.addRow(["Coupon Deduction", `₹${data.couponDeduction}`]);
    sheet.addRow(["Total Refunded", `₹${data.totalRefunded}`]);

    sheet.addRow([]);

    // ---------- STATUS TABLE ----------
    sheet.addRow(["Status", "Count"]).font = { bold: true };
    const rows = [
      ["Pending", data.pending],
      ["Confirmed", data.confirmed],
      ["Processing", data.processing],
      ["Shipped", data.shipped],
      ["Delivered", data.delivered],
      ["Cancelled", data.cancelled],
      ["Partially Cancelled", data.partiallyCancelled],
      ["Returned", data.returned],
      ["Partially Returned", data.partiallyReturned],
      ["Return Pending", data.returnPending],
      ["Return Rejected", data.returnRejected],
    ];
    sheet.addRows(rows);

    // Auto column width
    sheet.columns.forEach((col) => {
      col.width = 25;
    });

    // ---------- DOWNLOAD ----------
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=sales_report.xlsx",
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
