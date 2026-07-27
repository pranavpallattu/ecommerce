const generateSalesReport = require("../../services/salesReportService");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const formatCurrency = require("../../utils/formatCurrency");
const dayjs = require("dayjs");

exports.getSalesReport = async (req, res) => {
  try {
    const { filterType = "all", startDate, endDate } = req.query;

    const data = await generateSalesReport({ filterType, startDate, endDate });

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

exports.downloadSalesPDF = async (req, res) => {
  try {
    const data = await generateSalesReport(req.body);
    const doc = new PDFDocument({ size: "A4", margin: 50, compress: true });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Sales_Report_OneBazaar.pdf"',
    );
    doc.pipe(res);

    const BOTTOM = () => doc.page.height - doc.page.margins.bottom;
    const ROW_H = 20;

    const ensureSpace = (needed) => {
      if (doc.y + needed > BOTTOM() - 25) doc.addPage();
    };

    // doc.text() always mutates doc.y, even with explicit x/y — save/restore around footer draws.
   const addFooter = () => {
  const savedY = doc.y;

  const footerY = BOTTOM() - 42;

  // Top divider
  doc
    .moveTo(50, footerY - 8)
    .lineTo(545, footerY - 8)
    .lineWidth(0.7)
    .stroke("#d1d5db");

  // Brand
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#1e40af")
    .text(
      "One Bazaar • One World. Infinite Finds.",
      50,
      footerY,
      {
        width: doc.page.width - 100,
        align: "center",
      }
    );

  // Generated timestamp
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#64748b")
    .text(
      `Report generated on ${dayjs().format("DD MMM YYYY • hh:mm A")}`,
      50,
      footerY + 13,
      {
        width: doc.page.width - 100,
        align: "center",
      }
    );

  // System generated text
  doc
    .font("Helvetica-Oblique")
    .fontSize(7)
    .fillColor("#94a3b8")
    .text(
      "This report is system generated.",
      50,
      footerY + 25,
      {
        width: doc.page.width - 100,
        align: "center",
      }
    );

  // Page number
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#94a3b8")
    .text(
      `Page ${doc.bufferedPageRange().start + doc.bufferedPageRange().count}`,
      500,
      footerY + 25,
      {
        width: 45,
        align: "right",
      }
    );

  doc.y = savedY;
};
    doc.on("pageAdded", addFooter);

    const sectionTitle = (title) => {
      ensureSpace(38);
      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor("#1e40af")
        .text(title, 50, doc.y, { lineBreak: false });
      doc.y += 24;
    };

    const divider = (before = 5, after = 12, color = "#e2e8f0") => {
      doc.y += before;
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(color);
      doc.y += after;
    };

    const row = (cells, cols) => {
      ensureSpace(ROW_H);
      const y = doc.y;
      cells.forEach((val, i) =>
        doc.text(String(val ?? ""), cols[i].x, y, {
          width: cols[i].width,
          align: cols[i].align || "left",
          lineBreak: false,
        }),
      );
      doc.y = y + ROW_H;
    };

    const GRID_COLS = [
      { x: 50, width: 145 },
      { x: 200, width: 95, align: "right" },
      { x: 310, width: 145 },
      { x: 460, width: 85, align: "right" },
    ];

    const keyValueGrid = (entries) => {
      doc.fontSize(10.5).font("Helvetica").fillColor("#334155");
      for (let i = 0; i < entries.length; i += 2) {
        const [l1, v1] = entries[i];
        const [l2, v2] = entries[i + 1] || ["", ""];
        row([l1, v1, l2, v2], GRID_COLS);
      }
    };

    // ---------- payment methods table (unchanged) ----------
    const TABLE_COLS = [
      { x: 70, width: 170 },
      { x: 250, width: 90, align: "right" },
      { x: 350, width: 100, align: "right" },
      { x: 460, width: 90, align: "right" },
    ];

    const tableSection = (title, headers, rows) => {
      sectionTitle(title);
      doc.fontSize(10.5).font("Helvetica-Bold").fillColor("#1e293b");
      row(headers, TABLE_COLS);
      divider(2, 6, "#94a3b8");

      doc.font("Helvetica").fontSize(10.5).fillColor("#334155");
      rows.forEach((r) => row(r, TABLE_COLS));
      divider();
    };

    // ---------- compact header: logo+brand (left) / title+period (right) ----------
    const logoUrl =
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSgiPftJFEcFuclHRqhqXpbM58OXt2F5zRmtA&s";
    try {
      doc.image(logoUrl, 50, 42, { width: 52 });
    } catch (e) {
      doc
        .fontSize(40)
        .font("Helvetica-Bold")
        .fillColor("#1e40af")
        .text("1", 60, 42);
    }

    doc
      .fontSize(18)
      .font("Helvetica-Bold")
      .fillColor("#1e40af")
      .text("One Bazaar", 112, 44, { lineBreak: false });
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#64748b")
      .text("One World. Infinite Finds.", 112, 65, { lineBreak: false });

    const periodLabel =
      data.filterType === "all"
        ? "All Time"
        : data.reportPeriod.replace(/\s\d{2}:\d{2} [AP]M/g, "");

    doc
      .fontSize(15)
      .font("Helvetica-Bold")
      .fillColor("#1e3a8a")
      .text("Sales Report", 300, 42, {
        width: 245,
        align: "right",
        lineBreak: false,
      });
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#475569")
      .text(periodLabel, 300, 61, {
        width: 245,
        align: "right",
        lineBreak: false,
      });
    doc
      .fontSize(8)
      .fillColor("#94a3b8")
      .text(`Generated: ${dayjs().format("DD MMM YYYY • hh:mm A")}`, 300, 76, {
        width: 245,
        align: "right",
        lineBreak: false,
      });

    doc.y = 100;
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(2).stroke("#1e40af");
    doc.y += 18;

    // ---------- overall summary ----------
    sectionTitle("Overall Summary");
    keyValueGrid([
      ["Total Orders", data.totalOrders],
      ["Cart Orders", data.cartOrders],
      ["Buy Now Orders", data.buynowOrders],
      ["Total Products Sold", data.totalProductsSold],
      ["Total Items Sold", data.totalItemsSold],
      ["Average Order Value", formatCurrency(data.averageOrderValue)],
      ["Total Revenue", formatCurrency(data.totalAmount)],
      ["Net Revenue", formatCurrency(data.netRevenue)],
      ["Total Discount", formatCurrency(data.totalDiscount)],
      ["Coupon Deduction", formatCurrency(data.couponDeduction)],
      ["Total Refunded", formatCurrency(data.totalRefunded)],
    ]);
    divider();

    // ---------- payment methods ----------
    const methodLabels = {
      cod: "Cash on Delivery",
      wallet: "Wallet",
      razorpay: "Razorpay",
    };
    tableSection(
      "Payment Methods",
      ["Method", "Orders", "Amount", "% Revenue"],
      Object.entries(data.paymentMethods).map(([key, m]) => [
        methodLabels[key] || key,
        m.count,
        formatCurrency(m.amount),
        `${m.percentage}%`,
      ]),
    );

    // ---------- order status breakdown ----------
    sectionTitle("Order Status Breakdown");
    keyValueGrid([
      ["Pending", data.pending],
      ["Confirmed", data.confirmed],
      ["Processing", data.processing],
      ["Shipped", data.shipped],
      ["Delivered", data.delivered],
      ["Cancelled", data.cancelled],
      ["Partially Cancelled", data.partiallyCancelled],
      ["Return Pending", data.returnPending],
      ["Partially Return Pending", data.partiallyReturnPending],
      ["Returned", data.returned],
      ["Partially Returned", data.partiallyReturned],
      ["Return Rejected", data.returnRejected],
      ["Partially Return Rejected", data.partiallyReturnRejected],
    ]);

    addFooter();
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
    const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("One Bazaar Sales Report");

    // HEADER
    sheet.mergeCells("A1", "B1");
    sheet.getCell("A1").value = "One Bazaar Sales Report";
    sheet.getCell("A1").font = { size: 18, bold: true };
    sheet.getCell("A1").alignment = { horizontal: "center" };

    sheet.addRow([]);
    sheet.addRow(["Generated On", new Date().toLocaleString()]);
    sheet.addRow([
      "Report Period",
      data.filterType === "all" ? "All Time" : data.reportPeriod,
    ]);
    sheet.addRow([]);

    // SUMMARY
    sheet.addRow(["Summary", ""]).font = { bold: true };
    [
      ["Total Orders", data.totalOrders],
      ["Cart Orders", data.cartOrders],
      ["Buy Now Orders", data.buynowOrders],
      ["Total Products Sold", data.totalProductsSold],
      ["Total Items Sold", data.totalItemsSold],
      ["Average Order Value", inr(data.averageOrderValue)],
      ["Total Revenue", inr(data.totalAmount)],
      ["Net Revenue", inr(data.netRevenue)],
      ["Total Discount", inr(data.totalDiscount)],
      ["Coupon Deduction", inr(data.couponDeduction)],
      ["Total Refunded", inr(data.totalRefunded)],
    ].forEach((row) => sheet.addRow(row));
    sheet.addRow([]);

    // PAYMENT METHODS
    sheet.addRow(["Payment Method", "Orders", "Amount", "% of Revenue"]).font =
      { bold: true };
    const methodLabels = {
      cod: "Cash on Delivery",
      wallet: "Wallet",
      razorpay: "Razorpay",
    };
    Object.entries(data.paymentMethods).forEach(([key, m]) => {
      sheet.addRow([
        methodLabels[key] || key,
        m.count,
        inr(m.amount),
        `${m.percentage}%`,
      ]);
    });
    sheet.addRow([]);

    // ORDER STATUS
    sheet.addRow(["Order Status", "Count"]).font = { bold: true };
    [
      ["Pending", data.pending],
      ["Confirmed", data.confirmed],
      ["Processing", data.processing],
      ["Shipped", data.shipped],
      ["Delivered", data.delivered],
      ["Cancelled", data.cancelled],
      ["Partially Cancelled", data.partiallyCancelled],
      ["Return Pending", data.returnPending],
      ["Partially Return Pending", data.partiallyReturnPending],
      ["Returned", data.returned],
      ["Partially Returned", data.partiallyReturned],
      ["Return Rejected", data.returnRejected],
      ["Partially Return Rejected", data.partiallyReturnRejected],
    ].forEach((row) => sheet.addRow(row));

    // Footer
    sheet.addRow([]);
    sheet.addRow([]);

    const footerStart = sheet.lastRow.number + 1;

    sheet.mergeCells(`A${footerStart}:D${footerStart}`);
    sheet.getCell(`A${footerStart}`).value =
      "One Bazaar • One World. Infinite Finds.";
    sheet.getCell(`A${footerStart}`).font = {
      bold: true,
      italic: true,
      color: { argb: "1E40AF" },
    };
    sheet.getCell(`A${footerStart}`).alignment = {
      horizontal: "center",
    };

    sheet.mergeCells(`A${footerStart + 1}:D${footerStart + 1}`);
    sheet.getCell(`A${footerStart + 1}`).value =
      `Report generated on ${dayjs().format("DD MMM YYYY • hh:mm A")}`;
    sheet.getCell(`A${footerStart + 1}`).font = {
      size: 10,
      color: { argb: "6B7280" },
    };
    sheet.getCell(`A${footerStart + 1}`).alignment = {
      horizontal: "center",
    };

    sheet.mergeCells(`A${footerStart + 2}:D${footerStart + 2}`);
    sheet.getCell(`A${footerStart + 2}`).value =
      "This report is system generated.";
    sheet.getCell(`A${footerStart + 2}`).font = {
      italic: true,
      size: 9,
      color: { argb: "9CA3AF" },
    };
    sheet.getCell(`A${footerStart + 2}`).alignment = {
      horizontal: "center",
    };

    // Column widths
    sheet.columns.forEach((col) => {
      col.width = 25;
    });

    // Force consistent left alignment on every cell (skip title row)
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell({ includeEmpty: false }, (cell) => {
        cell.alignment = { horizontal: "left" };
      });
    });

    // DOWNLOAD
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
