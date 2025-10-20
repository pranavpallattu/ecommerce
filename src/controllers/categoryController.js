const Category = require("../models/categorySchema");
const {
  validateCategoryData,
  validateEditCategoryData,
} = require("../utils/validation");

exports.addCategoryController = async (req, res) => {
  validateCategoryData(req);
  const { name, description, offer } = req.body;

  try {
    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(401).json({ message: "category already exists" });
    }

    const category = new Category({
      name: name.trim().toLowerCase(),
      description: description.trim(),
      offer,
    });

    await category.save();
    res.json({ message: "category added successfully", data: category });
  } catch (error) {
    res.status(400).send(error);
  }
};

exports.editCategoryController = async (req, res) => {
  try {
    const { id } = req.params;

    validateEditCategoryData(req);

    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res.status(401).json({ message: "Category doesnt exists" });
    }

    Object.keys(req.body).forEach(
      (key) => (existingCategory[key] = req.body[key])
    );

    await existingCategory.save();

    return res.json({
      message: existingCategory.name + " category is updated successfully",
      data: existingCategory,
    });
  } catch (error) {
    res.status(400).send(error);
  }
};

exports.listCategoryController = async (req, res) => {
  try {
    const { id } = req.params;

    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res.status(404).json({ message: "category doesnt exists" });
    }

    existingCategory.isActive = true;
    await existingCategory.save();
    res.json({
      message: ` ${existingCategory.name} is marked as listed successfully`,
    });
  } catch (error) {
    res.status(400).send(error);
  }
};

exports.unListCategoryController = async (req, res) => {
  try {
    const { id } = req.params;

    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res.status(404).json({ message: "category doesnt exists" });
    }

    existingCategory.isActive = false;
    await existingCategory.save();
    res.json({
      message: ` ${existingCategory.name} is marked as not listed successfully`,
    });
  } catch (error) {
    res.status(400).send(error);
  }
};

exports.deleteCategoryController = async (req, res) => {
  try {
    const { id } = req.params;

    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res.status(404).json({ message: "category doesnt exists" });
    }

    await Category.findByIdAndDelete(id);
    res.json({ message: existingCategory.name + "deleted successfully" });
  } catch (error) {
    res.status(400).send(error);
  }
};

exports.softDeleteCategoryController = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { $set: { isDeleted: true, deletedAt: Date.now() } },
      { new: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ message: "category doesnt exists" });
    }

    res.json({
      message: updatedCategory.name + " Category soft deleted successfully",
    });
  } catch (error) {
    res.status(400).send(error);
  }
};

exports.getAllCategoriesController=async(req,res)=>{
    try{
        const Categories=await Category.find({isDeleted:{$ne:true}})
          if(Categories.length===0){
         return res.status(404).json({message:"No categories found"})
        }

        res.json({message:"all categories",
            data:Categories
        })


    }
    catch (error) {
    res.status(400).send(error);
  }
}