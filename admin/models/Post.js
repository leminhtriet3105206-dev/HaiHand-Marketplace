const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  title: { type: String, required: true },
  price: { type: Number, required: true },
  
  
  category: { type: String, required: true }, 
  
  
  location: { type: String, default: "Toàn quốc" }, 

  image: String,
  description: String,
  status: { type: String, default: "Chờ duyệt" },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Post", postSchema);