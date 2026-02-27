const { configPost } = require('../helper/cache')

const subgraphEndpoint = 'https://api.goldsky.com/api/public/project_cm97dvfxxyivn01xe2sda93ka/subgraphs/angstrom-mainnet/prod/gn'

const metaQuery = { query: `{ _meta { block { number } } }` }

const poolQuery = (blockNumber) => ({
  query: `{
    pools(first: 1000, block: {number: ${blockNumber}}) {
      token0 { id decimals }
      token1 { id decimals }
      totalValueLockedToken0
      totalValueLockedToken1
    }
  }`
})

module.exports.ethereum = {
  tvl: async (api) => {
    const block = await api.getBlock(api.timestamp)
    const { data: metaData } = await configPost('angstrom-meta', subgraphEndpoint, metaQuery)
    const graphBlock = Number(metaData._meta.block.number)
    const { data } = await configPost('angstrom-pools', subgraphEndpoint, poolQuery(Math.min(block, graphBlock)))
    for (const pool of data.pools) {
      api.add(pool.token0.id, Number(pool.totalValueLockedToken0) * (10 ** Number(pool.token0.decimals)))
      api.add(pool.token1.id, Number(pool.totalValueLockedToken1) * (10 ** Number(pool.token1.decimals)))
    }
  },
}

module.exports.doublecounted = true
module.exports.methodology = 'Count total assets are deposited in Angstrom hooks on Uniswap v4 using subgraph provided by AngStrom.'
