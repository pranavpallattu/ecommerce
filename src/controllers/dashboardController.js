

exports.getOrderSummary=async(req,res)=>{
    try{

        
        
    }
    catch (error) {
    console.error("Error fetching order summary:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}