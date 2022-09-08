const appRoot = require('app-root-path');
const config = require(appRoot + '/config/config.js');
const fs = require('fs');
const Database = require('better-sqlite3');
const _ = require('lodash');

let databasePath = appRoot + '/config/' + config.sqlite_file_name;

if (!fs.existsSync(databasePath)) {
  databasePath = appRoot + '/config/database.sqlite.sample';
}

const db = new Database(databasePath);

exports.rat = function (rat, scoreTable) {
  let ratId = rat.id;
  let ratTraits = db.prepare('SELECT rat_traits.trait_type_id, trait_types.trait_type, rat_traits.value  FROM rat_traits INNER JOIN trait_types ON (rat_traits.trait_type_id = trait_types.id) WHERE rat_traits.rat_id = ?').all(ratId);
  let ratScore = db.prepare('SELECT '+scoreTable+'.* FROM '+scoreTable+' WHERE '+scoreTable+'.rat_id = ?').get(ratId);
  let allTraitTypes = db.prepare('SELECT trait_types.* FROM trait_types').all();

  let ratTraitsData = [];
  let ratTraitIDs = [];
  ratTraits.forEach(ratTrait => {
    let percentile = ratScore['trait_type_'+ratTrait.trait_type_id+'_percentile'];
    let rarity_score = ratScore['trait_type_'+ratTrait.trait_type_id+'_rarity'];
    ratTraitsData.push({
      trait_type: ratTrait.trait_type,
      value: ratTrait.value,
      percentile: percentile,
      rarity_score: rarity_score,
    });
    ratTraitIDs.push(ratTrait.trait_type_id);
  });

  let missingTraitsData = [];
  allTraitTypes.forEach(traitType => {
    if (!ratTraitIDs.includes(traitType.id)) {
      let percentile = ratScore['trait_type_'+traitType.id+'_percentile'];
      let rarity_score = ratScore['trait_type_'+traitType.id+'_rarity'];
      missingTraitsData.push({
        trait_type: traitType.trait_type,
        percentile: percentile,
        rarity_score: rarity_score,
      });
    }
  });

  return {
    id: rat.id,
    name: rat.name,
    image: rat.image,
    attributes: ratTraitsData,
    missing_traits: missingTraitsData,
    trait_count: {
      count: ratScore.trait_count,
      percentile: ratScore.trait_count_percentile,
      rarity_score: ratScore.trait_count_rarity
    },
    rarity_score: ratScore.rarity_sum,
    rarity_rank: ratScore.rarity_rank
  };
};