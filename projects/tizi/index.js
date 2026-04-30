const sdk = require('@defillama/sdk')
const ADDRESSES = require('../helper/coreAssets.json')
const { getLogs2 } = require('../helper/cache/getLogs')

const TD = '0x469bbd88eEA8A2D9a5C6c82d9890Cf60962C27e6'
const DEPOSIT_HELPER = '0xBfE36e368AB2f14f59e7093D4f215880D5944CE0'
const STRATEGY_MANAGER = '0x6a4eA29d7D603fcfC9cf67EeaEb8150D53552fCF'

const STRATEGY_MANAGER_DEPLOYMENTS = {
    base: 41697135
}

// Positions live in: position(id, owner) and market(id), no receipt token
const MORPHO = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb'

// keccak256("Supply(bytes32,address,address,uint256,uint256)")
const SUPPLY_TOPIC = '0xedf8870433c83823eb071d3df1caa8d008f12f6440918c20d75a3602cda30fe0'

const morphoAbi = {
  position:
    'function position(bytes32, address) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)',
  market:
    'function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
  idToMarketParams:
    'function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',
}

// Tizi's StrategyManager is on Base and tracks strategies for every chain Tizi deploys to
async function getStrategiesForChain(chainId) {
  const baseApi = new sdk.ChainApi({ chain: 'base' })
  return baseApi.call({
    target: STRATEGY_MANAGER,
    abi: 'function getActiveAddrByChainId(uint256) view returns (address[])',
    params: [chainId],
  })
}

async function getMarketIdsFor(api, strategy) {
  const padded = '0x' + strategy.toLowerCase().slice(2).padStart(64, '0')
  const logs = await getLogs2({
    api,
    target: MORPHO,
    topics: [SUPPLY_TOPIC, null, padded],
    fromBlock: STRATEGY_MANAGER_DEPLOYMENTS[api.chain],
    extraKey: 'morpho-supply-' + strategy.toLowerCase(),
  })
  return [...new Set(logs.map((l) => l.topics[1]))]
}

async function addMorphoSupply(api, strategy) {
  const marketIds = await getMarketIdsFor(api, strategy)
  if (!marketIds.length) return

  const [positions, markets, params] = await Promise.all([
    api.multiCall({
      target: MORPHO,
      abi: morphoAbi.position,
      calls: marketIds.map((id) => ({ params: [id, strategy] })),
    }),
    api.multiCall({ target: MORPHO, abi: morphoAbi.market, calls: marketIds }),
    api.multiCall({ target: MORPHO, abi: morphoAbi.idToMarketParams, calls: marketIds }),
  ])

  positions.forEach((p, i) => {
    const shares = BigInt(p.supplyShares)
    if (shares === 0n) return
    const m = markets[i]
    const assets = (shares * BigInt(m.totalSupplyAssets)) / BigInt(m.totalSupplyShares)
    api.add(params[i].loanToken, assets.toString())
  })
}

async function tvlBase(api) {
    // idle USDC to be sent out with enterFarm or in withdrawal queue
    const vault = await api.call({ target: DEPOSIT_HELPER, abi: 'address:vault' })
    const nftVault = await api.call({ target: DEPOSIT_HELPER, abi: 'address:nftVault' })

    await api.sumTokens({ owners: [vault, nftVault], tokens: [ADDRESSES.base.USDC] })

    const strategies = await getStrategiesForChain(api.chainId)
    for (const s of strategies) await addMorphoSupply(api, s)
}

module.exports = {
  methodology:
    "TVL counts all idle tokens and in active strategies.",
  base: { tvl: tvlBase },
}
