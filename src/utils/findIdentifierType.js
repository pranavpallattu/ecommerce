const validator=require("validator")
const findIdentifierType=(identifier)=>{

if(!identifier || typeof identifier !== "string"){
     return { type: 'invalid', normalized: null };
}

const trimmed=identifier.trim();

 if (validator.isEmail(trimmed)) {
    return {
      type: 'email',
      normalized: trimmed.toLowerCase()
    };
  }

   const cleanedPhone = trimmed.replace(/[\s\-\(\)]/g, '');

    if (validator.isMobilePhone(cleanedPhone, 'any', { strictMode: false })) {
    return {
      type: 'phone',
      normalized: cleanedPhone
    };
  }

  return { type: 'invalid', normalized: null };

}

module.exports=findIdentifierType