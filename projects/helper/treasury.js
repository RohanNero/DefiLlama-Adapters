const ADDRESSES = require('./coreAssets.json')
const { sumTokensExport, nullAddress } = require('./sumTokens')
const { ankrChainMapping } = require('./token')
const { defaultTokens } = require('./cex')
const { getUniqueAddresses } = require('./utils')
const sdk = require('@defillama/sdk')
const axios = require('axios')
const { getEnv } = require('./env')

const ARB = ADDRESSES.arbitrum.ARB;
const API_URL_COMPLEX  = `https://pro-openapi.debank.com/v1/user/all_complex_protocol_list`

const ACCESSKEY = getEnv('DEBANK_API_KEY')

const debankToLlamaChain = {
  eth: 'ethereum',
  op: 'optimism',
  arb: 'arbitrum',
  avax: 'avax',
  bsc: 'bsc',
  ftm: 'fantom',
  sonic: 'sonic',
  base: 'base',
  matic: 'polygon',
  frax: 'fraxtal',
  mnt: 'mantle'
};

function getLlamaChain(debankChain) {
  return debankToLlamaChain[debankChain] || debankChain;
}

function treasuryExports(config) {
  const { isComplex, complexOwners = [], ...chains } = config;

  const exportObj = {};

  let fetchPromise = null;

  async function getComplexData() {
    if (!fetchPromise) {
      fetchPromise = Promise.all(
        complexOwners.map(id =>
          axios.get(API_URL_COMPLEX, {
            params: { id, is_all: true },
            headers: {
              'accept': 'application/json',
              'AccessKey': ACCESSKEY,
            },
          }).then(r => ({ id, tokens: r.data }))
        )
      );
    }
    return fetchPromise;
  }

  Object.keys(chains).forEach(chain => {
    let { ownTokenOwners = [], ownTokens = [], owners = [], tokens = [], blacklistedTokens = [] } = config[chain]
    const tvlConfig = { permitFailure: true, ...config[chain] };

    if (chain === 'solana') {
      tvlConfig.solOwners = owners;
    } else if (config[chain].fetchCoValentTokens !== false) {
      if (ankrChainMapping[chain]) {
        tvlConfig.fetchCoValentTokens = true;
        if (!tvlConfig.tokenConfig) tvlConfig.tokenConfig = { onlyWhitelisted: false };
      } else if (defaultTokens[chain]) {
        tvlConfig.tokens = [tokens, defaultTokens[chain]].flat();
      }
    }

    tvlConfig.blacklistedTokens = [...ownTokens, ...blacklistedTokens];

    if (chain === 'arbitrum') tvlConfig.tokens = [...tokens, ARB];
    if (!Array.isArray(tvlConfig.tokens)) tvlConfig.tokens = [];

    const baseExport = { tvl: sumTokensExport(tvlConfig) };

    if (isComplex) {
      exportObj[chain] = {
        tvl: async (api) => {
          // Run base sumTokens first (ankr token discovery)
          await baseExport.tvl(api);

          if (!complexOwners.length) return api.getBalances();
          const data = await getComplexData();
          if (!data.length) return api.getBalances();

          const blacklist = new Set(getUniqueAddresses([...ownTokens, ...blacklistedTokens], false));

          // List base tokens so we can identify receipt tokens to replace with DeBank's unwrapped values
          const baseTokens = new Set(Object.keys(api.getBalancesV2().getBalances()).map(k => k.toLowerCase()));

          // Add DeBank positions and collect pool.ids (receipt tokens) to remove
          const debankAdded = new Set();
          const poolIdsToRemove = new Set();
          for (const entry of data) {
            for (const token of entry.tokens || []) {
              if (getLlamaChain(token.chain) !== chain) continue;
              for (const { asset_token_list = [], pool } of token.portfolio_item_list || []) {
                for (const { id: rawId, decimals, amount } of asset_token_list) {
                  if (!rawId) continue;
                  const addr = rawId === 'eth' ? nullAddress : rawId.toLowerCase();
                  debankAdded.add(addr);
                  if (blacklist.has(addr)) continue;
                  api.add(addr, amount * 10 ** decimals);
                }
                if (pool && pool.id) poolIdsToRemove.add(pool.id.toLowerCase());
              }
            }
          }

          // Remove receipt tokens that ankr found, unless DeBank also adds them as underlying assets
          for (const poolAddr of poolIdsToRemove) {
            if (debankAdded.has(poolAddr)) continue;
            if (baseTokens.has(poolAddr) || baseTokens.has(`${chain}:${poolAddr}`))
              api.removeTokenBalance(poolAddr);
          }
          return api.getBalances();
        }
      };
    } else {
      exportObj[chain] = baseExport;
    }

    if (ownTokens.length > 0) {
      const { solOwners, ...other } = config[chain];
      const opts = {
        ...other,
        owners: [...owners, ...ownTokenOwners],
        tokens: ownTokens,
        chain,
        uniV3WhitelistedTokens: ownTokens,
      };
      exportObj[chain].ownTokens = sumTokensExport(opts);
    }
  });

  return exportObj;
}

function ohmStaking(exports) {
  const dummyTvl = () => ({})
  const newExports = {}
  Object.entries(exports).forEach(([chain, value]) => {
    if (typeof value === 'object' && typeof value.tvl === 'function') {
      newExports[chain] = { ...value, tvl: dummyTvl }
    } else {
      newExports[chain] = value
    }
  })
  return newExports
}

function ohmTreasury(exports) {
  const dummyTvl = () => ({})
  const newExports = {}
  Object.entries(exports).forEach(([chain, value]) => {
    if (typeof value === 'object' && typeof value.staking === 'function') {
      newExports[chain] = { ...value, }
      delete newExports[chain].staking
    } else {
      newExports[chain] = value
    }
  })
  return newExports
}

module.exports = {
  nullAddress,
  treasuryExports,
  ohmTreasury,
  ohmStaking,
}
