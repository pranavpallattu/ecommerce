const generateFileName =(productName, index) => {
    console.log(productName,index);
    
  const cleanName = productName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  
  const timestamp = Date.now();
  const suffix = index !== null ? `_img${index + 1}` : "";
  
  return `products/${cleanName}_${timestamp}${suffix}.webp`;
};

// module.exports=generateFileName

module.exports={generateFileName}