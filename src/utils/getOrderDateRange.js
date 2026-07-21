 function getOrderDateRange(label) {
  // Creates a NEW Date object by copying the value of 'now'.
  // This is done because Date objects are mutable.
  //
  // const start = now;
  //
  // both 'start' and 'now' would point to the SAME Date object.
  // Modifying 'start' would also modify 'now'.
  //
  // Using new Date(now) creates an independent copy, so changes
  // made to 'start' won't affect 'now'.

  // current date
  // date obj are mutable
  const now = new Date();
  if (label === "Last 30 days") {
    // create copy of current date,
    const start = new Date(now);
    // Move date back by 30 days
    start.setDate(start.getDate() - 30);
    return { createdAt: { $gte: start } };
  }
  if (label === "2024") {
    return {
      createdAt: { $gte: new Date("2024-01-01"), $lt: new Date("2025-01-01") },
    };
  }
  if (label === "2023") {
    return {
      createdAt: { $gte: new Date("2023-01-01"), $lt: new Date("2024-01-01") },
    };
  }
  if (label === "Older") {
    return { createdAt: { $lt: new Date("2023-01-01") } };
  }
  return null;
}


module.exports = getOrderDateRange;