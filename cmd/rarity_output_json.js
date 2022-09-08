const appRoot = require('app-root-path');
const config = require(appRoot + '/config/config.js');
const Database = require('better-sqlite3');
const jsondata = require(appRoot + '/modules/jsondata.js');
const fs = require('fs');

let databasePath = appRoot + '/config/' + config.sqlite_file_name;

if (!fs.existsSync(databasePath)) {
  databasePath = appRoot + '/config/database.sqlite.sample';
}

const db = new Database(databasePath);
const outputPath = appRoot + '/config/collection-rarities.json';

fs.truncateSync(outputPath);

const logger = fs.createWriteStream(outputPath, {
  flags: 'a'
});

logger.write("[\n");

let totalratCount = db.prepare('SELECT COUNT(id) as rat_total FROM rats').get().rat_total;
let rats = db.prepare('SELECT rats.* FROM rats ORDER BY id').all();

let count = 0;
rats.forEach(rat => {
    console.log("Process rat: #" + rat.id);
    if ((count+1) == totalratCount) {
        logger.write(JSON.stringify(jsondata.rat(rat))+"\n");
    } else {
        logger.write(JSON.stringify(jsondata.rat(rat))+",\n");
    }
    count++
});

logger.write("]");

logger.end();