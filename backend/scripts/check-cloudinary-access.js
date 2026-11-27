require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
const cloudinary = require('cloudinary').v2;
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
cloudinary.api.ping({ timeout: 15000 }).then(result => console.log(JSON.stringify({ status: result.status })))
  .catch(error => { const cause = error.error || error; console.error(JSON.stringify({ status: 'failed', code: cause.http_code || cause.code, message: cause.message || String(cause) })); process.exitCode = 1; });
