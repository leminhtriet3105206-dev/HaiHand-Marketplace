const mongoose = require('mongoose');

const productSchema = mongoose.Schema({
   
    user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, required: true },
    description: { type: String },
    
   
    category: { type: String, required: true },
    location: { type: String, required: true },
    details: { type: Map, of: String } 
}, {
    timestamps: true
});

const Product = mongoose.model('Product', productSchema);
module.exports = Product;