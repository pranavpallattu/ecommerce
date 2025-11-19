const generateSalesReport = require("../utils/salesReportService");


exports.getSalesReport = async (req, res) => {
  try {
    const data=await generateSalesReport(req.body);
     return res.status(200).json({ success: true,message:"Sales report summary fetched successfully", data });
  } catch (error) {
    console.error("Error fetching sales report:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

