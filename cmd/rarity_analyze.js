const appRoot = require('app-root-path');
const config = require(appRoot + '/config/config.js');
const collectionData = require(appRoot + '/config/' + config.collection_file_name);
const fs = require('fs');
const Database = require('better-sqlite3');
const _ = require('lodash');
const argv = require('minimist')(process.argv.slice(2),{
    string: ['mode'],
});

let mode = argv['mode'];

const databasePath = appRoot + '/config/' + config.sqlite_file_name;

if (mode != 'force') { 
    if (fs.existsSync(databasePath)) {
        console.log("Database exist.");
        return;
    }
}

fs.writeFileSync(databasePath, '', { flag: 'w' });
console.log("Database created.");

const db = new Database(databasePath);

let totalrat = 0;
let traitTypeId = 0;
let traitDetailTypeId = 0;
let ratTraitTypeId = 0;
let ratScoreId = 0;

let traitTypeIdMap = {};
let traitTypeCount = {};
let traitDetailTypeIdMap = {};
let traitDetailTypeCount = {};
let ratTraitTypeCount = {};

let ignoreTraits = config.ignore_traits.map(ignore_trait => ignore_trait.toLowerCase());

db.exec(
    "CREATE TABLE rats (" +
        "id INT, " +
        "name TEXT, " +
        "description TEXT, " + 
        "image TEXT, " +
        "external_url TEXT, " +
        "animation_url TEXT " +
    ")"
);

db.exec(
    "CREATE TABLE trait_types (" +
        "id INT, " +
        "trait_type TEXT, " +
        "trait_data_type TEXT, " +
        "rat_count INT " +
    ")"
);

db.exec(
    "CREATE TABLE trait_detail_types (" +
        "id INT, " +
        "trait_type_id INT, " +
        "trait_detail_type TEXT, " +
        "rat_count INT " +
    ")"
);

db.exec(
    "CREATE TABLE rat_traits (" +
        "id INT, " +
        "rat_id INT, " +
        "trait_type_id INT, " + 
        "value TEXT " +
    ")"
);

db.exec(
    "CREATE TABLE rat_trait_counts (" +
        "trait_count INT, " +
        "rat_count INT " +
    ")"
);

let insertratStmt = db.prepare("INSERT INTO rats VALUES (?, ?, ?, ?, ?, ?)");
let insertTraitTypeStmt = db.prepare("INSERT INTO trait_types VALUES (?, ?, ?, ?)");
let insertTraitDetailTypeStmt = db.prepare("INSERT INTO trait_detail_types VALUES (?, ?, ?, ?)");
let insertPuntTraitStmt = db.prepare("INSERT INTO rat_traits VALUES (?, ?, ?, ?)");

let count1 = config.collection_id_from;
collectionData.forEach(element => {

    if (element.id != undefined) {
        element.id = element.id.toString();
    }
    if (element.id == undefined) {
        element['id'] = count1;
    }
    if (_.isEmpty(element.id)) {
        element['id'] = count1;
    }
    if (_.isEmpty(element.name)) {
        element['name'] = config.collection_name + ' #' + element.id;
    }
    if (!element.name.includes('#'+element.id)) {
        element['name'] = element['name'] + ' #' + (count1 + config.collection_id_from);
    }
    if (_.isEmpty(element.description)) {
        element['description'] = '';
    }
    if (_.isEmpty(element.external_url)) {
        element['external_url'] = '';
    }
    if (_.isEmpty(element.animation_url)) {
        element['animation_url'] = '';
    }

    console.log("Prepare rat: #" + element.id);
    
    insertratStmt.run(element.id, element.name, element.description, element.image, element.external_url, element.animation_url);

    let thisratTraitTypes = [];

    if (_.isEmpty(element.attributes) && !_.isEmpty(element.traits)) {
        element.attributes = [];
        for (const [key, value] of Object.entries(element.traits)) {
            element.attributes.push(
                {
                    trait_type: key,
                    value: value
                }
            );
        }
    }

    // fake data for date
    /*
    element.attributes.push({
        value: '2456221590',
        trait_type: 'date',
        display_type: 'date',
    });
    */

    element.attributes.forEach(attribute => {

        if (attribute.value) {
            attribute.value = attribute.value.toString();
        }

        if (_.isEmpty(attribute.trait_type) || _.isEmpty(attribute.value) || attribute.value.toLowerCase() == 'none' || attribute.value.toLowerCase() == 'nothing' || attribute.value.toLowerCase() == '0') {
            return;
        }

        // Trait type
        if (!traitTypeCount.hasOwnProperty(attribute.trait_type)) {
            let traitDataType = 'string';
            if (!_.isEmpty(attribute.display_type) && attribute.display_type.toLowerCase() == 'date') {
                traitDataType = 'date';
            }
            insertTraitTypeStmt.run(traitTypeId, _.startCase(attribute.trait_type), traitDataType, 0);
            traitTypeIdMap[attribute.trait_type] = traitTypeId;
            traitTypeId = traitTypeId + 1;
            if (!ignoreTraits.includes(attribute.trait_type.toLowerCase())) {
                traitTypeCount[attribute.trait_type] = 0 + 1;
            } else {
                traitTypeCount[attribute.trait_type] = 0;
            }
        } else {
            if (!ignoreTraits.includes(attribute.trait_type.toLowerCase())) {
                traitTypeCount[attribute.trait_type] = traitTypeCount[attribute.trait_type] + 1;
            } else {
                traitTypeCount[attribute.trait_type] = 0;
            }
        }

        // Trait detail type
        if (!traitDetailTypeCount.hasOwnProperty(attribute.trait_type+'|||'+attribute.value)) {
            insertTraitDetailTypeStmt.run(traitDetailTypeId, traitTypeIdMap[attribute.trait_type], attribute.value, 0);
            traitDetailTypeIdMap[attribute.trait_type+'|||'+attribute.value] = traitDetailTypeId;
            traitDetailTypeId = traitDetailTypeId + 1;
            if (!ignoreTraits.includes(attribute.trait_type.toLowerCase())) {
                traitDetailTypeCount[attribute.trait_type+'|||'+attribute.value] = 0 + 1;
            } else {
                traitDetailTypeCount[attribute.trait_type+'|||'+attribute.value] = 0;
            }
        } else {
            if (!ignoreTraits.includes(attribute.trait_type.toLowerCase())) {
                traitDetailTypeCount[attribute.trait_type+'|||'+attribute.value] = traitDetailTypeCount[attribute.trait_type+'|||'+attribute.value] + 1; 
            } else {
                traitDetailTypeCount[attribute.trait_type+'|||'+attribute.value] = 0;
            }  
        }

        insertPuntTraitStmt.run(ratTraitTypeId, element.id, traitTypeIdMap[attribute.trait_type], attribute.value);  
        ratTraitTypeId = ratTraitTypeId + 1;
        
        if (!ignoreTraits.includes(attribute.trait_type.toLowerCase())) {
            thisratTraitTypes.push(attribute.trait_type);
        }
    });

    if (!ratTraitTypeCount.hasOwnProperty(thisratTraitTypes.length)) {
        ratTraitTypeCount[thisratTraitTypes.length] = 0 + 1;
    } else {
        ratTraitTypeCount[thisratTraitTypes.length] = ratTraitTypeCount[thisratTraitTypes.length] + 1;
    }

    totalrat = totalrat + 1;
    count1 = count1 + 1;
});

console.log(traitTypeCount);
let updateTraitTypeStmt = db.prepare("UPDATE trait_types SET rat_count = :rat_count WHERE id = :id");
for(let traitType in traitTypeCount)
{
    let thisTraitTypeCount = traitTypeCount[traitType];
    let traitTypeId = traitTypeIdMap[traitType];
    updateTraitTypeStmt.run({
        rat_count: thisTraitTypeCount,
        id: traitTypeId
    });
}
console.log(traitDetailTypeCount);
let updateTraitDetailTypeStmt = db.prepare("UPDATE trait_detail_types SET rat_count = :rat_count WHERE id = :id");
for(let traitDetailType in traitDetailTypeCount)
{
    let thisTraitDetailTypeCount = traitDetailTypeCount[traitDetailType];
    let traitDetailTypeId = traitDetailTypeIdMap[traitDetailType];
    updateTraitDetailTypeStmt.run({
        rat_count: thisTraitDetailTypeCount,
        id: traitDetailTypeId
    });
}
console.log(ratTraitTypeCount);
let insertratTraitContStmt = db.prepare("INSERT INTO rat_trait_counts VALUES (?, ?)");
for(let countType in ratTraitTypeCount)
{
    let thisTypeCount = ratTraitTypeCount[countType];
    insertratTraitContStmt.run(countType, thisTypeCount);
}

let createScoreTableStmt = "CREATE TABLE rat_scores ( id INT, rat_id INT, ";
let insertratScoreStmt = "INSERT INTO rat_scores VALUES (:id, :rat_id, ";

for (let i = 0; i < traitTypeId; i++) {
    createScoreTableStmt = createScoreTableStmt + "trait_type_" + i + "_percentile DOUBLE, trait_type_" + i + "_rarity DOUBLE, trait_type_" + i + "_value TEXT, ";
    insertratScoreStmt = insertratScoreStmt + ":trait_type_" + i + "_percentile, :trait_type_" + i + "_rarity, :trait_type_" + i + "_value, ";
}

createScoreTableStmt = createScoreTableStmt + "trait_count INT,  trait_count_percentile DOUBLE, trait_count_rarity DOUBLE, rarity_sum DOUBLE, rarity_rank INT)";
insertratScoreStmt = insertratScoreStmt + ":trait_count,  :trait_count_percentile, :trait_count_rarity, :rarity_sum, :rarity_rank)";

db.exec(createScoreTableStmt);
insertratScoreStmt = db.prepare(insertratScoreStmt);

let count2 = config.collection_id_from;
collectionData.forEach(element => {
    
    if (element.id != undefined) {
        element.id = element.id.toString();
    }
    if (_.isEmpty(element.id)) {
        element['id'] = count2;
    }

    console.log("Analyze rat: #" + element.id);

    let thisratTraitTypes = [];
    let thisratDetailTraits = {};

    if (_.isEmpty(element.attributes) && !_.isEmpty(element.traits)) {
        element.attributes = [];
        for (const [key, value] of Object.entries(element.traits)) {
            element.attributes.push(
                {
                    trait_type: key,
                    value: value
                }
            );
        }
    }

    element.attributes.forEach(attribute => {

        if (attribute.value) {
            attribute.value = attribute.value.toString();
        }
        
        if (_.isEmpty(attribute.trait_type) || _.isEmpty(attribute.value) || attribute.value.toLowerCase() == 'none' || attribute.value.toLowerCase() == 'nothing' || attribute.value.toLowerCase() == '0') {
            return;
        }

        thisratTraitTypes.push(attribute.trait_type);
        thisratDetailTraits[attribute.trait_type] = attribute.value;
    });

    let ratScore = {};
    let raritySum = 0;
    ratScore['id'] = ratScoreId;
    ratScore['rat_id'] = element.id;
    for(let traitType in traitTypeCount)
    {
        
        if (thisratTraitTypes.includes(traitType)) {
            // has trait
            let traitDetailType = thisratDetailTraits[traitType];
            let thisTraitDetailTypeCount = traitDetailTypeCount[traitType+'|||'+traitDetailType];
            let traitTypeId = traitTypeIdMap[traitType];
            if (!ignoreTraits.includes(traitType.toLowerCase())) {
                ratScore['trait_type_' + traitTypeId + '_percentile'] = thisTraitDetailTypeCount/totalrat;
                ratScore['trait_type_' + traitTypeId + '_rarity'] = totalrat/thisTraitDetailTypeCount;
                raritySum = raritySum + totalrat/thisTraitDetailTypeCount;
            } else {
                ratScore['trait_type_' + traitTypeId + '_percentile'] = 0;
                ratScore['trait_type_' + traitTypeId + '_rarity'] = 0;
                raritySum = raritySum + 0;
            }
            ratScore['trait_type_' + traitTypeId + '_value'] = traitDetailType;
        } else {   
            // missing trait
            let thisTraitTypeCount = traitTypeCount[traitType];
            let traitTypeId = traitTypeIdMap[traitType];
            if (!ignoreTraits.includes(traitType.toLowerCase())) {
                ratScore['trait_type_' + traitTypeId + '_percentile'] = (totalrat-thisTraitTypeCount)/totalrat;
                ratScore['trait_type_' + traitTypeId + '_rarity'] = totalrat/(totalrat-thisTraitTypeCount);
                raritySum = raritySum + totalrat/(totalrat-thisTraitTypeCount);
            } else {
                ratScore['trait_type_' + traitTypeId + '_percentile'] = 0;
                ratScore['trait_type_' + traitTypeId + '_rarity'] = 0;
                raritySum = raritySum + 0;
            }
            ratScore['trait_type_' + traitTypeId + '_value'] = 'None';
        }
    }


    thisratTraitTypes = thisratTraitTypes.filter(thisratTraitType => !ignoreTraits.includes(thisratTraitType));
    let thisratTraitTypeCount = thisratTraitTypes.length;

    ratScore['trait_count'] = thisratTraitTypeCount;
    ratScore['trait_count_percentile'] = ratTraitTypeCount[thisratTraitTypeCount]/totalrat;
    ratScore['trait_count_rarity'] = totalrat/ratTraitTypeCount[thisratTraitTypeCount];
    raritySum = raritySum + totalrat/ratTraitTypeCount[thisratTraitTypeCount];
    ratScore['rarity_sum'] = raritySum;
    ratScore['rarity_rank'] = 0;

    insertratScoreStmt.run(ratScore);

    ratScoreId = ratScoreId + 1;
    count2 = count2 + 1;
});

const ratScoreStmt = db.prepare('SELECT rarity_sum FROM rat_scores WHERE rat_id = ?');
const ratRankStmt = db.prepare('SELECT COUNT(id) as higherRank FROM rat_scores WHERE rarity_sum > ?');
let updatratRankStmt = db.prepare("UPDATE rat_scores SET rarity_rank = :rarity_rank WHERE rat_id = :rat_id");

let count3 = config.collection_id_from;
collectionData.forEach(element => {
    if (element.id != undefined) {
        element.id = element.id.toString();
    }
    if (_.isEmpty(element.id)) {
        element['id'] = count3;
    }

    console.log("Ranking rat: #" + element.id);
    let ratScore = ratScoreStmt.get(element.id);
    let ratRank = ratRankStmt.get(ratScore.rarity_sum);
    updatratRankStmt.run({
        rarity_rank: ratRank.higherRank+1,
        rat_id: element.id
    });
    count3 = count3 + 1;
});