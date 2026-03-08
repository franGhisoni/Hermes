const fs = require('fs');
const cheerio = require('cheerio');
const $ = cheerio.load(fs.readFileSync('c:/tmp/na-sociedad.html'));
const links = new Set();
$('a').each((i, e) => {
    const href = $(e).attr('href');
    if (href) links.add(href);
});
const linkArr = Array.from(links);
console.log('Total unique links found:', linkArr.length);
console.log('Sample links:');
console.log(linkArr.slice(0, 50).join('\n'));
