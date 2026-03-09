import fs from 'fs';
const res = await fetch('https://noticiasargentinas.com');
const text = await res.text();
const links = text.match(/href="([^"]+)"/g) || [];
const unique = [...new Set(links)].map(l => l.replace('href="', '').replace('"', ''));
fs.writeFileSync('links.txt', unique.join('\n'));
console.log('done');
