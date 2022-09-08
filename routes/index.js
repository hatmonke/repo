const appRoot = require('app-root-path');
const config = require(appRoot + '/config/config.js');
const request = require('sync-request');
const express = require('express');
const router = express.Router();
const Web3 = require('web3');
const fs = require('fs');
const Database = require('better-sqlite3');
const _ = require('lodash');
const ethers = require('ethers');
const ABI = require(appRoot + '/config/nft.json');

let databasePath = appRoot + '/config/' + config.sqlite_file_name;

if (!fs.existsSync(databasePath)) {
  databasePath = appRoot + '/config/database.sqlite.sample';
}

const db = new Database(databasePath);

/* GET home page. */
router.get('/', function(req, res, next) {

  let search = req.query.search;
  let traits = req.query.traits;
  let useTraitNormalization = req.query.trait_normalization;
  let orderBy = req.query.order_by;
  let page = req.query.page;

  let offset = 0;
  let limit = config.page_item_num;

  if (_.isEmpty(search)) {
    search = '';
  }

  if (_.isEmpty(traits)) {
    traits = '';
  }

  let scoreTable = 'rat_scores';
  if (useTraitNormalization == '1') {
    useTraitNormalization = '1';
    scoreTable = 'normalized_rat_scores';
  } else {
    useTraitNormalization = '0';
  }

  if (orderBy == 'rarity' || orderBy == 'id') {
    orderBy = orderBy;
  } else {
    orderBy = 'rarity';
  }

  if (!_.isEmpty(page)) {
    page = parseInt(page);
    if (!isNaN(page)) {
      offset = (Math.abs(page) - 1) * limit;
    } else {
      page = 1;
    }
  } else {
    page = 1;
  }

  let selectedTraits = (traits != '') ? traits.split(',') : [];
  let totalratCount = 0
  let rats = null;
  let orderByStmt = '';
  if (orderBy == 'rarity') {
    orderByStmt = 'ORDER BY '+scoreTable+'.rarity_rank ASC';
  } else {
    orderByStmt = 'ORDER BY rats.id ASC';
  }

  let totalSupply = db.prepare('SELECT COUNT(rats.id) as rat_total FROM rats').get().rat_total;
  let allTraitTypes = db.prepare('SELECT trait_types.* FROM trait_types').all();
  let allTraitTypesData = {};
  allTraitTypes.forEach(traitType => {
    allTraitTypesData[traitType.trait_type] = traitType.rat_count;
  });

  let allTraits = db.prepare('SELECT trait_types.trait_type, trait_detail_types.trait_detail_type, trait_detail_types.rat_count, trait_detail_types.trait_type_id, trait_detail_types.id trait_detail_type_id  FROM trait_detail_types INNER JOIN trait_types ON (trait_detail_types.trait_type_id = trait_types.id) WHERE trait_detail_types.rat_count != 0 ORDER BY trait_types.trait_type, trait_detail_types.trait_detail_type').all();
  let totalratCountQuery = 'SELECT COUNT(rats.id) as rat_total FROM rats INNER JOIN '+scoreTable+' ON (rats.id = '+scoreTable+'.rat_id) ';
  let ratsQuery = 'SELECT rats.*, '+scoreTable+'.rarity_rank FROM rats INNER JOIN '+scoreTable+' ON (rats.id = '+scoreTable+'.rat_id) ';
  let totalratCountQueryValue = {};
  let ratsQueryValue = {};

  if (!_.isEmpty(search)) {
    search = parseInt(search);
    totalratCountQuery = totalratCountQuery+' WHERE rats.id LIKE :rat_id ';
    totalratCountQueryValue['rat_id'] = '%'+search+'%';

    ratsQuery = ratsQuery+' WHERE rats.id LIKE :rat_id ';
    ratsQueryValue['rat_id'] = '%'+search+'%';
  } else {
    totalratCount = totalratCount;
  }

  let allTraitTypeIds = [];
  allTraits.forEach(trait => {
    if (!allTraitTypeIds.includes(trait.trait_type_id.toString())) {
      allTraitTypeIds.push(trait.trait_type_id.toString());
    }
  }); 

  let purifySelectedTraits = [];
  if (selectedTraits.length > 0) {

    selectedTraits.map(selectedTrait => {
      selectedTrait = selectedTrait.split('_');
      if ( allTraitTypeIds.includes(selectedTrait[0]) ) {
        purifySelectedTraits.push(selectedTrait[0]+'_'+selectedTrait[1]);
      }
    });

    if (purifySelectedTraits.length > 0) {
      if (!_.isEmpty(search.toString())) {
        totalratCountQuery = totalratCountQuery + ' AND ';
        ratsQuery = ratsQuery + ' AND ';
      } else {
        totalratCountQuery = totalratCountQuery + ' WHERE ';
        ratsQuery = ratsQuery + ' WHERE ';
      }
      let count = 0;

      purifySelectedTraits.forEach(selectedTrait => {
        selectedTrait = selectedTrait.split('_');
        totalratCountQuery = totalratCountQuery+' '+scoreTable+'.trait_type_'+selectedTrait[0]+'_value = :trait_type_'+selectedTrait[0]+'_value ';
        ratsQuery = ratsQuery+' '+scoreTable+'.trait_type_'+selectedTrait[0]+'_value = :trait_type_'+selectedTrait[0]+'_value ';
        if (count != (purifySelectedTraits.length-1)) {
          totalratCountQuery = totalratCountQuery + ' AND ';
          ratsQuery = ratsQuery + ' AND ';
        }
        count++;

        totalratCountQueryValue['trait_type_'+selectedTrait[0]+'_value'] = selectedTrait[1];
        ratsQueryValue['trait_type_'+selectedTrait[0]+'_value'] = selectedTrait[1];    
      });
    }
  }
  let purifyTraits = purifySelectedTraits.join(',');

  ratsQuery = ratsQuery+' '+orderByStmt+' LIMIT :offset,:limit';
  ratsQueryValue['offset'] = offset;
  ratsQueryValue['limit'] = limit;

  totalratCount = db.prepare(totalratCountQuery).get(totalratCountQueryValue).rat_total;
  rats = db.prepare(ratsQuery).all(ratsQueryValue);

  let totalPage =  Math.ceil(totalratCount/limit);

  res.render('index', { 
    appTitle: config.app_name,
    appDescription: config.app_description,
    ogTitle: config.collection_name + ' | ' + config.app_name,
    ogDescription: config.collection_description + ' | ' + config.app_description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: 'rarity',
    rats: rats, 
    totalratCount: totalratCount,
    totalPage: totalPage, 
    search: search, 
    useTraitNormalization: useTraitNormalization,
    orderBy: orderBy,
    traits: purifyTraits,
    selectedTraits: purifySelectedTraits,
    allTraits: allTraits,
    page: page,
    totalSupply: totalSupply,
    allTraitTypesData: allTraitTypesData,
    _:_ 
  });
});

router.get('/matrix', function(req, res, next) {

  let allTraits = db.prepare('SELECT trait_types.trait_type, trait_detail_types.trait_detail_type, trait_detail_types.rat_count FROM trait_detail_types INNER JOIN trait_types ON (trait_detail_types.trait_type_id = trait_types.id) WHERE trait_detail_types.rat_count != 0 ORDER BY trait_types.trait_type, trait_detail_types.trait_detail_type').all();
  let allTraitCounts = db.prepare('SELECT * FROM rat_trait_counts WHERE rat_count != 0 ORDER BY trait_count').all();
  let totalratCount = db.prepare('SELECT COUNT(id) as rat_total FROM rats').get().rat_total;

  res.render('matrix', {
    appTitle: config.app_name,
    appDescription: config.app_description,
    ogTitle: config.collection_name + ' | ' + config.app_name,
    ogDescription: config.collection_description + ' | ' + config.app_description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: 'matrix',
    allTraits: allTraits,
    allTraitCounts: allTraitCounts,
    totalratCount: totalratCount,
    _:_ 
  });
});
async function getIds(account){
  let provider = new ethers.providers.JsonRpcProvider(
    'https://bsc-dataseed1.binance.org'
  )
  let contract = new ethers.Contract(
    config.collection_contract_address,
    ABI,
    provider
  )
  let callIds = await contract.getTokenIds(account);
  return callIds;
}
router.get('/wallet', async function(req, res, next) {
  let search = req.query.search;
  let useTraitNormalization = req.query.trait_normalization;

  if (_.isEmpty(search)) {
    search = '';
  }

  let scoreTable = 'rat_scores';
  if (useTraitNormalization == '1') {
    useTraitNormalization = '1';
    scoreTable = 'normalized_rat_scores';
  } else {
    useTraitNormalization = '0';
  }

  let isAddress = Web3.utils.isAddress(search);
  let tokenIds = [];
  let rats = null;
  if (isAddress) {
    let callIds = await getIds(search);
    console.log(callIds);
    callIds.forEach(element => {
      tokenIds.push(Number(element._hex));
    });
    if (tokenIds.length > 0) {
      let ratsQuery = 'SELECT rats.*, '+scoreTable+'.rarity_rank FROM rats INNER JOIN '+scoreTable+' ON (rats.id = '+scoreTable+'.rat_id) WHERE rats.id IN ('+tokenIds.join(',')+') ORDER BY '+scoreTable+'.rarity_rank ASC';
      rats = db.prepare(ratsQuery).all();
    }
  }

  res.render('wallet', {
    appTitle: config.app_name,
    appDescription: config.app_description,
    ogTitle: config.collection_name + ' | ' + config.app_name,
    ogDescription: config.collection_description + ' | ' + config.app_description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: 'wallet',
    rats: rats,
    search: search, 
    useTraitNormalization: useTraitNormalization,
    _:_ 
  });
});

module.exports = router;
