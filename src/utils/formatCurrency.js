const formatCurrency = (amount) => {
  return `₹${Number(amount).toLocaleString("en-IN")}`;
};


module.exports=formatCurrency