const appRoot = require('app-root-path');
const config = require(appRoot + '/config/config.js');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const Database = require('better-sqlite3');
const jsondata = require(appRoot + '/modules/jsondata.js');
const _ = require('lodash');
const MarkdownIt = require('markdown-it'),
    md = new MarkdownIt();

let databasePath = appRoot + '/config/' + config.sqlite_file_name;

if (!fs.existsSync(databasePath)) {
  databasePath = appRoot + '/config/database.sqlite.sample';
}

const db = new Database(databasePath);

/* GET rats listing. */
router.get('/:id', function(req, res, next) {
  let ratId = req.params.id;
  let useTraitNormalization = req.query.trait_normalization;

  let scoreTable = 'rat_scores';
  if (useTraitNormalization == '1') {
    useTraitNormalization = '1';
    scoreTable = 'normalized_rat_scores';
  } else {
    useTraitNormalization = '0';
  }

  let rat = db.prepare('SELECT rats.*, '+scoreTable+'.rarity_rank FROM rats INNER JOIN '+scoreTable+' ON (rats.id = '+scoreTable+'.rat_id) WHERE rats.id = ?').get(ratId);
  let ratScore = db.prepare('SELECT '+scoreTable+'.* FROM '+scoreTable+' WHERE '+scoreTable+'.rat_id = ?').get(ratId);
  let allTraitTypes = db.prepare('SELECT trait_types.* FROM trait_types').all();
  let allDetailTraitTypes = db.prepare('SELECT trait_detail_types.* FROM trait_detail_types').all();
  let allTraitCountTypes = db.prepare('SELECT rat_trait_counts.* FROM rat_trait_counts').all();

  let ratTraits = db.prepare('SELECT rat_traits.*, trait_types.trait_type  FROM rat_traits INNER JOIN trait_types ON (rat_traits.trait_type_id = trait_types.id) WHERE rat_traits.rat_id = ?').all(ratId);
  let totalratCount = db.prepare('SELECT COUNT(id) as rat_total FROM rats').get().rat_total;

  let ratTraitData = {};
  let ignoredratTraitData = {};
  let ignoreTraits = config.ignore_traits.map(ignore_trait => ignore_trait.toLowerCase());
  ratTraits.forEach(ratTrait => {
    ratTraitData[ratTrait.trait_type_id] = ratTrait.value;

    if (!ignoreTraits.includes(ratTrait.trait_type.toLowerCase())) {
      ignoredratTraitData[ratTrait.trait_type_id] = ratTrait.value;
    }
  });

  let allDetailTraitTypesData = {};
  allDetailTraitTypes.forEach(detailTrait => {
    allDetailTraitTypesData[detailTrait.trait_type_id+'|||'+detailTrait.trait_detail_type] = detailTrait.rat_count;
  });

  let allTraitCountTypesData = {};
  allTraitCountTypes.forEach(traitCount => {
    allTraitCountTypesData[traitCount.trait_count] = traitCount.rat_count;
  });

  let title = config.collection_name + ' | ' + config.app_name;
  //let description = config.collection_description + ' | ' + config.app_description
  let description = rat ? `💎 ID: ${ rat.id }
    💎 Rarity Rank: ${ rat.rarity_rank }
    💎 Rarity Score: ${ ratScore.rarity_sum.toFixed(2) }` : '';

  if (!_.isEmpty(rat)) {
    title = rat.name + ' | ' + config.app_name;
  }
  
  res.render('rat', { 
    appTitle: title,
    appDescription: description,
    ogTitle: title,
    ogDescription: description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: rat ? rat.image.replace('ipfs://', 'https://ipfs.io/ipfs/'): config.main_og_image,
    activeTab: 'rarity',
    rat: rat, 
    ratScore: ratScore, 
    allTraitTypes: allTraitTypes, 
    allDetailTraitTypesData: allDetailTraitTypesData, 
    allTraitCountTypesData: allTraitCountTypesData, 
    ratTraitData: ratTraitData, 
    ignoredratTraitData: ignoredratTraitData,
    totalratCount: totalratCount, 
    trait_normalization: useTraitNormalization,
    _: _,
    md: md
  });
});

router.get('/:id/json', function(req, res, next) {
  let ratId = req.params.id;
  let useTraitNormalization = req.query.trait_normalization;

  let scoreTable = 'rat_scores';
  if (useTraitNormalization == '1') {
    useTraitNormalization = '1';
    scoreTable = 'normalized_rat_scores';
  } else {
    useTraitNormalization = '0';
  }

  let rat = db.prepare('SELECT rats.*, '+scoreTable+'.rarity_rank FROM rats INNER JOIN '+scoreTable+' ON (rats.id = '+scoreTable+'.rat_id) WHERE rats.id = ?').get(ratId);
  
  if (_.isEmpty(rat)) {
    res.end(JSON.stringify({
      status: 'fail',
      message: 'not_exist',
    }));
  }

  let ratData = jsondata.rat(rat, scoreTable);
  
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    status: 'success',
    message: 'success',
    rat: ratData
  }));
});

router.get('/:id/similar', function(req, res, next) {
  let ratId = req.params.id;
  let useTraitNormalization = req.query.trait_normalization;

  let scoreTable = 'rat_scores';
  if (useTraitNormalization == '1') {
    useTraitNormalization = '1';
    scoreTable = 'normalized_rat_scores';
  } else {
    useTraitNormalization = '0';
  }

  let rat = db.prepare('SELECT rats.*, '+scoreTable+'.rarity_rank FROM rats INNER JOIN '+scoreTable+' ON (rats.id = '+scoreTable+'.rat_id) WHERE rats.id = ?').get(ratId);
  let ratScore = db.prepare('SELECT '+scoreTable+'.* FROM '+scoreTable+' WHERE '+scoreTable+'.rat_id = ?').get(ratId);
  let allTraitTypes = db.prepare('SELECT trait_types.* FROM trait_types').all();
  let similarCondition = '';
  let similarTo = {};
  let similarrats = null;
  if (ratScore) {
    allTraitTypes.forEach(traitType => {
      similarCondition = similarCondition + 'IIF('+scoreTable+'.trait_type_'+traitType.id+'_value = :trait_type_'+traitType.id+', 1 * '+scoreTable+'.trait_type_'+traitType.id+'_rarity, 0) + ';
      similarTo['trait_type_'+traitType.id] = ratScore['trait_type_'+traitType.id+'_value'];
    });
    similarTo['trait_count'] = ratScore['trait_count'];
    similarTo['this_rat_id'] = ratId;
    similarrats = db.prepare(`
      SELECT
        rats.*,
        `+scoreTable+`.rat_id, 
        (
          ` 
          + similarCondition +
          `
          IIF(`+scoreTable+`.trait_count = :trait_count, 1 * 0, 0)
        )
        similar 
      FROM `+scoreTable+`  
      INNER JOIN rats ON (`+scoreTable+`.rat_id = rats.id)
      WHERE `+scoreTable+`.rat_id != :this_rat_id
      ORDER BY similar desc
      LIMIT 12
      `).all(similarTo);
  }

  
  let title = config.collection_name + ' | ' + config.app_name;
  let description = config.collection_description + ' | ' + config.app_description
  if (!_.isEmpty(rat)) {
    title = rat.name + ' | ' + config.app_name;
  }

  res.render('similar_rats', { 
    appTitle: title,
    appDescription: description,
    ogTitle: title,
    ogDescription: description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: rat ? rat.image.replace('ipfs://', 'https://ipfs.io/ipfs/'): config.main_og_image,
    activeTab: 'rarity',
    rat: rat,
    similarrats: similarrats,
    trait_normalization: useTraitNormalization,
    _: _
  });
});

module.exports = router;
