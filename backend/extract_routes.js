const fs = require('fs');
const serverContent = fs.readFileSync('server.js', 'utf-8');
const regex = /app\.(get|post|put|delete)\(['"`]([^'"`]+)['"`]/g;
let match;
const routes = [];
while ((match = regex.exec(serverContent)) !== null) {
  routes.push(`${match[1].toUpperCase()} ${match[2]}`);
}
console.log(routes.join('\n'));
