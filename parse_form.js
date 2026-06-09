const fs = require('fs');
const cheerio = require('cheerio');
const text = fs.readFileSync('test.html', 'utf8');
const $ = cheerio.load(text);
const form = $('#searchbar_form');
console.log('Method:', form.attr('method'), 'Action:', form.attr('action'));
form.find('input').each((i, el) => {
    console.log('Input:', $(el).attr('name'), $(el).attr('id'), $(el).attr('type'), $(el).attr('value'));
});
