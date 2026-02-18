const sdk = require("@defillama/sdk");
const { sumTokens2 } = require('../helper/unwrapLPs')
const bytes32ToAddress = (b32) => "0x" + b32.substr(-40);

const hub = '0x1e3f1f1cA8C62aABCB3B78D87223E988Dfa3780E'
const ZERO_BYTES32 = '0x' + '0'.repeat(64)

const wormholeChainIds = {
  arbitrum: 23,
  ethereum: 2,
  optimism: 24,
  base: 30,
  scroll: 34,
}

const spokes = {
  ethereum: '0xd367051613979d1ec894233df9ede31591d0e5ff',
  optimism: '0x93f5c828553968c659db847d5ccea61836efd72d',
  base: '0x76e766336068b0f699d24002c368a4891a4dbcf3',
  scroll: '0xf5b2b5f495756c5486acf73222e7400c7a0e28a6',
}

async function resolveChainTokens(arbApi, wormholeId) {
  const registry = await arbApi.call({ abi: 'address:getAssetRegistry', target: hub })
  const assetIds = await arbApi.call({ abi: 'function getRegisteredAssets() view returns (bytes32[])', target: registry })
  const addresses = await arbApi.multiCall({
    abi: 'function getAssetAddress(bytes32 _id, uint16 _chainId) view returns (bytes32)',
    calls: assetIds.map(id => ({ params: [id, wormholeId] })),
    target: registry,
    permitFailure: true,
  })
  const tokens = []
  const filteredIds = []
  assetIds.forEach((id, i) => {
    const addr = addresses[i]
    if (addr && addr !== ZERO_BYTES32) {
      tokens.push(bytes32ToAddress(addr))
      filteredIds.push(id)
    }
  })
  return { tokens, assetIds: filteredIds }
}

async function tvl(api) {
  const chain = api.chain
  const isArbitrum = chain === 'arbitrum'
  const arbApi = isArbitrum ? api : new sdk.ChainApi({ chain: 'arbitrum', timestamp: api.timestamp })
  const { tokens } = await resolveChainTokens(arbApi, wormholeChainIds[chain])
  return sumTokens2({ api, tokens, owner: isArbitrum ? hub : spokes[chain] })
}

async function borrowed(api) {
  const { tokens, assetIds } = await resolveChainTokens(api, wormholeChainIds.arbitrum)
  const bals = (await api.multiCall({
    abi: "function getGlobalAmounts(bytes32 assetId) view returns ((uint256 deposited, uint256 borrowed))",
    calls: assetIds,
    target: hub,
  })).map(i => i.borrowed)
  api.add(tokens, bals)
}

module.exports = {
  arbitrum: { tvl, borrowed },
  ethereum: { tvl },
  optimism: { tvl },
  base: { tvl },
  scroll: { tvl },
}