const Wallet = require("../../models/walletSchema");

exports.getWalletDetails=async(req,res)=>{
    try{
        const user=req.user

        const wallet=await Wallet.findOne({userId:user._id})

        const balance=wallet.balance
        const transactionHistory=wallet.transactionHistory

        return res.status(200).json({success:true,data:{balance,transactionHistory},message:"wallet details fetched successfully"})

    }
    catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }

}