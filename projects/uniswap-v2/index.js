const { getChainTvl } = require('../helper/getUniSubgraphTvl');
const { get } = require('../helper/http');
const { getUniTVL } = require('../helper/unknownTokens');

const v2graph = getChainTvl({ ethereum: 'A3Np3RQbaBA6oKJgiwDJeo5T3zrYfGHPWFYayMwtNDum' })

const config = {
  ethereum: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // uses subgraph
  base: '0x8909dc15e40173ff4699343b6eb8132c65e18ec6',
  optimism: '0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf',
  arbitrum: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
  polygon: '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C',
  bsc: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
  avax: '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C',
  unichain: '0x1F98400000000000000000000000000000000002',
  monad: '0x182a927119d56008d921126764bf884221b10f59',
  xlayer: '0xdf38f24fe153761634be942f9d859f3dba857e95',
  // celo: '0x79a530c8e2fA8748B7B40dd3629C0520c2cCf03f', // no pairs
  zora: '0x0F797dC7efaEA995bB916f268D919d0a1950eE3C',
  blast: '0x5C346464d33F90bABaf70dB6388507CC889C1070',
  wc: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
}

async function tvl(api) {
  try {
    const endpoint = `https://interface.gateway.uniswap.org/v2/uniswap.explore.v1.ExploreStatsService/ProtocolStats?connect=v1&encoding=json&message=%7B%22chainId%22%3A%22${api.chainId}%22%7D`
    const res = await get(endpoint, { headers: { 'origin': 'https://app.uniswap.org' } })
    const v2 = res.dailyProtocolTvl?.v2
    if (!v2 || !v2.length) throw new Error('No v2 data')
    const closest = v2.reduce((best, d) =>
      Math.abs(d.timestamp - api.timestamp) < Math.abs(best.timestamp - api.timestamp) ? d : best
    )
    api.addUSDValue(closest.value)
  } catch {
    if (api.chain === 'ethereum') return v2graph(api)
    const factory = config[api.chain]
    return getUniTVL({ factory, useDefaultCoreAssets: true, permitFailure: true })(api)
  }
}

module.exports = { misrepresentedTokens: true, isHeavyProtocol: true }

Object.keys(config).forEach(chain => {
  module.exports[chain] = { tvl }
})
