const formatCurrency = (amount) => {
  if (amount == null || isNaN(amount)) return "INR 0";
  return `INR ${Number(amount).toLocaleString("en-IN")}`;
};

module.exports=formatCurrency