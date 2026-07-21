const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minLength: 10,
      maxLength: 500,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    regularPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    salePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    productImage: {
      type: [
        {
          imageUrl: {
            type: String,
            required: true,
            trim: true,
          },
          hash: {
            type: String,
            required: true,
          },
        },
      ],
      required: true,
      validate: {
        validator: function (arr) {
          return arr && arr.length >= 1 && arr.length <= 4;
        },
        message: "Product must have 1 to 4 images",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["Available", "Out of stock"],
      required: true,
      default: "Available",
    },
    offer: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

productSchema.pre("save", function (next) {
  this.status = this.quantity > 0 ? "Available" : "Out of stock";

  next();
});

productSchema.pre("findOneAndUpdate", async function (next) {
  // Get the fields that are being updated
  const update = this.getUpdate();

  // Fetch the existing product from the database
  const product = await this.model.findOne(this.getQuery());

  // Use the updated quantity if provided; otherwise use the current quantity
  const quantity = update.quantity ?? product.quantity;

  // Automatically update the product status based on available stock
  update.status = quantity > 0 ? "Available" : "Out of stock";

  // Apply the modified update object to the query
  this.setUpdate(update);

  // Continue with the update operation
  next();
});

const Product = mongoose.model("Product", productSchema);
module.exports = Product;
