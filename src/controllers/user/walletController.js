const Wallet = require("../../models/walletSchema");

exports.getWalletDetails = async (req, res) => {
  try {
    const user = req.user;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const wallet = await Wallet.findOne({ userId: user._id });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    // Sort newest first
    const sortedTransactions = [...wallet.transactionHistory].sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const transactions = sortedTransactions.slice(startIndex, endIndex);

    const hasMore = endIndex < sortedTransactions.length;

    return res.status(200).json({
      success: true,
      message: "Wallet details fetched successfully",
      data: {
        balance: wallet.balance,
        transactions,
        page,
        limit,
        hasMore,
        totalTransactions: sortedTransactions.length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
