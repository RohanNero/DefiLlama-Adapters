const { sumTokens2, nullAddress } = require('../helper/unwrapLPs')
const { getCache, setCache } = require('../helper/cache')
const ADDRESSES = require('../helper/coreAssets.json')

const factory = '0xee13c86ee4eb1ec3a05e2cc3ab70576f31666b3b'
const blacklistedTokens = [
  '0x0b91b07beb67333225a5ba0259d55aee10e3a578', // MNEP
]

const abis = {
  tokenCounter: "uint256:tokenCounter",
  walletOf: "function walletOf(uint256 nftId) view returns (address)",
}

// FetchCoValent tokens was failing due to a large number of wallets
const tokens = [
  nullAddress,                    // MATIC
  ADDRESSES.polygon.WMATIC_2,     // WMATIC
  ADDRESSES.polygon.WETH_1,       // WETH
  ADDRESSES.polygon.WBTC,         // WBTC
  ADDRESSES.polygon.USDC,         // USDC (bridged)
  ADDRESSES.polygon.USDC_CIRCLE,  // USDC (native)
  ADDRESSES.polygon.USDT,         // USDT
  ADDRESSES.polygon.DAI,          // DAI
]

async function tvl(api) {
  const wallets = await getCache('defi-basket', 'wallets')

  const currentLength = await api.call({ target: factory, abi: abis.tokenCounter })
  let newWallets = []
  if (!Array.isArray(wallets) || wallets.length < currentLength) {
    newWallets = await api.fetchList({
      itemAbi: abis.walletOf,
      lengthAbi: abis.tokenCounter,
      target: factory,
    })
    await setCache('defi-basket', 'wallets', newWallets)
  }

  return sumTokens2({ owners: newWallets.length > 0 ? newWallets : wallets, tokens, api, blacklistedTokens })
}

module.exports = {
  timetravel: false,
  methodology: "The TVL is calculated by summing the value of all assets that are in the wallets deployed by the DeFiBasket contract.",
  polygon: {
    tvl
  },
}