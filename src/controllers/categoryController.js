const Category = require("../models/categorySchema");
const { validateCategoryData } = require("../utils/validation");

// Helper: Normalize name
const normalizeName = (name) => name.trim().toLowerCase();

exports.addCategoryController = async (req, res) => {
  try {
    // 1. Validate + clean data
    const { name, description, offer } = validateCategoryData(req); // ← returns cleaned object

    // 2. Check for duplicate
    const existing = await Category.findOne({
      name: normalizeName(name),
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Category with this name already exists",
      });
    }

    // 3. Create category
    const category = new Category({
      name: normalizeName(name),
      description: description.trim(),
      offer: offer || null,
    });

    await category.save();

    return res.status(201).json({
      success: true,
      message: "Category added successfully",
      data: category,
    });
  } catch (error) {
    // Validation errors come from validateCategoryData
    if (
      error.message.includes("required") ||
      error.message.includes("length")
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error("Add category error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.editCategoryController = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Validate incoming data
    const { name, description, offer } = validateCategoryData(req);

    // 2. Find category
    const category = await Category.findById(id);
    if (!category) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    // 3. Prevent editing deleted category
    if (category.deletedAt) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot edit a deleted category" });
    }

    // 4. Duplicate name check (if name is being changed)
    if (name) {
      const normalized = normalizeName(name);
      const duplicate = await Category.findOne({
        name: normalized,
        _id: { $ne: id },
      });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "Another category with this name already exists",
        });
      }
      category.name = normalized;
    }

    // 5. Update other fields if provided
    if (description !== undefined) category.description = description.trim();
    if (offer !== undefined) category.offer = offer;

    // 6. Save
    await category.save();

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: category,
    });
  } catch (error) {
    if (
      error.message.includes("required") ||
      error.message.includes("length")
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error("Edit category error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
exports.listCategoryController = async (req, res) => {
  try {
    const { id } = req.params;

    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res.status(404).json({ message: "category doesnt exists" });
    }

    if (existingCategory.deletedAt) {
      return res
        .status(400)
        .json({ message: "Deleted category cannot be listed" });
    }

    existingCategory.isActive = true;
    await existingCategory.save();
    res.status(200).json({
      success: true,
      message: ` ${existingCategory.name} is marked as listed successfully`,
    });
  } catch (error) {
    console.error("Error in list category :" + error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.unListCategoryController = async (req, res) => {
  try {
    const { id } = req.params;

    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res.status(404).json({ message: "category doesnt exists" });
    }

    if (existingCategory.deletedAt) {
      return res
        .status(400)
        .json({ message: "Deleted category cannot be listed" });
    }

    existingCategory.isActive = false;
    await existingCategory.save();
    res.status(200).json({
      success: true,
      message: ` ${existingCategory.name} is marked as not listed successfully`,
    });
  } catch (error) {
    console.error("Error in unList category :" + error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// exports.deleteCategoryController = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const existingCategory = await Category.findById(id);
//     if (!existingCategory) {
//       return res.status(404).json({ message: "category doesnt exists" });
//     }

//     await Category.findByIdAndDelete(id);
//     res.status(200).json({
//       success: true,
//       message: existingCategory.name + "deleted successfully",
//     });
//   } catch (error) {
//     console.error("Error in delete category :" + error);
//     return res.status(500).json({ success: false, message: error.message });
//   }
// };

exports.softDeleteCategoryController = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { $set: { deletedAt: Date.now(), isActive: false } },
      { new: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ message: "category doesnt exists" });
    }

    res.json({
      success: true,
      message: updatedCategory.name + " Category soft deleted successfully",
    });
  } catch (error) {
    console.error("Error in soft delete category :" + error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCategoriesController = async (req, res) => {
  try {
    const search = req.query.search?.trim() || "";
    const page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 5;
    limit = limit > 5 ? 5 : limit;

    const skip = (page - 1) * limit;

    // Build search query
    const searchQuery = {
      deletedAt: null, // get only NOT deleted categories
      ...(search && {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ],
      }),
    };

    // Run queries in parallel
    const [totalCategories, categories] = await Promise.all([
      Category.countDocuments(searchQuery),
      Category.find(searchQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    const totalPages = Math.ceil(totalCategories / limit);

    return res.status(200).json({
      success: true,
      message: "Categories retrieved successfully",
      data: categories,
      pagination: {
        totalCategories,
        totalPages,
        currentPage: page,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
