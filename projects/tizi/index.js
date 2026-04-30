const sdk = require('@defillama/sdk')
const { sumTokensDebank } = require('../helper/debank')

const DEPOSIT_HELPER = '0xBfE36e368AB2f14f59e7093D4f215880D5944CE0'
const STRATEGY_MANAGER = '0x6a4eA29d7D603fcfC9cf67EeaEb8150D53552fCF'

// Tizi's StrategyManager lives on Base and tracks active strategies for every chain Tizi deploys to.
async function getStrategiesForChain(chainId) {
  const baseApi = new sdk.ChainApi({ chain: 'base' })
  return baseApi.call({
    target: STRATEGY_MANAGER,
    abi: 'function getActiveAddrByChainId(uint256) view returns (address[])',
    params: [chainId],
  })
}

async function tvl(api) {
  const owners = await getStrategiesForChain(api.chainId)
  if (api.chain === 'base') {
    const [vault, nftVault] = await Promise.all([
      api.call({ target: DEPOSIT_HELPER, abi: 'address:vault' }),
      api.call({ target: DEPOSIT_HELPER, abi: 'address:nftVault' }),
    ])
    owners.push(vault, nftVault)
  }
  if (!owners.length) return
  await sumTokensDebank(api, owners, { includeWalletTokens: true })
}

module.exports = {
  methodology:
    "TVL is sum of positions held by every active Tizi strategy address (per chain, enumerated from Base StrategyManager.getActiveAddrByChainId), plus the Base DepositHelper.vault and DepositHelper.nftVault for idle and queued-withdrawal USDC.",
  base: { tvl },
}
