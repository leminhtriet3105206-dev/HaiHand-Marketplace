const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
async function test() {
    try {
        const form = new FormData();
        form.append("title", "test");
        form.append("price", 100);
        form.append("category", "test");
        form.append("location", "test");
        form.append("description", "test");
        form.append("author", "60c72b2f9b1d8b001c8e4b6a");
        form.append("quantity", 1);
        const res = await axios.post("http://localhost:4000/api/posts", form, { headers: form.getHeaders() });
        console.log(res.data);
    } catch (e) {
        console.error("ERROR:", e.response ? e.response.data : e.message);
    }
}
test();