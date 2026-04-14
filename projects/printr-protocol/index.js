const { defaultTokens } = require('../helper/cex')
const { getConfig } = require('../helper/cache')
const { getConnection, sumTokens2 } = require('../helper/solana')
const { sliceIntoChunks } = require('../helper/utils')
const { PublicKey } = require('@solana/web3.js')

// Printr contract is deployed at the same address on all EVM chains (CREATE2)
const PRINTR_CONTRACT = '0xb77726291b125515d0a7affeea2b04f2ff243172'

// Chain ID mapping for API calls
const chainIds = {
  ethereum: 1,
  bsc: 56,
  arbitrum: 42161,
  base: 8453,
  avax: 43114,
  mantle: 5000,
  monad: 143,
}

// Solana constants
const PRINTR_API = 'https://api-preview.printr.money'
const SOLANA_CHAIN_ID = 900

// Meteora DBC VirtualPool account layout offsets
// Source: Meteora DBC IDL (dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN)
const VIRTUAL_POOL_DISCRIMINATOR = [213, 224, 5, 209, 98, 69, 119, 92]
const QUOTE_VAULT_OFFSET = 200   // pubkey SPL token account holding quote (SOL) reserves
const IS_MIGRATED_OFFSET = 305   // u8 (0 = active, 1 = migrated)

/**
 * Calculates TVL for Printr protocol on EVM chains
 * @param {object} api - DefiLlama SDK API object
 */
async function tvl(api) {
  const treasury = await api.call({ target: PRINTR_CONTRACT, abi: 'function treasury() view returns (address)' })
  const wNative = await api.call({ target: PRINTR_CONTRACT, abi: 'function wrappedNativeToken() view returns (address)' })
  await api.sumTokens({ owner: treasury, tokens: [wNative, ...(defaultTokens[api.chain] || [])] })
}

const PAGE_SIZE = 500

async function fetchAllSolanaTokens() {
  const tokens = []
  let skip = 0
  while (true) {
    const endpoint = `${PRINTR_API}/chains/${SOLANA_CHAIN_ID}/tokenlist.json?size=${PAGE_SIZE}&skip=${skip}`
    const data = await getConfig(`printr-protocol/${SOLANA_CHAIN_ID}/${skip}`, endpoint)
    if (!data || !Array.isArray(data.tokens)) {
      if (skip === 0) throw new Error(`Invalid token list response from ${endpoint}`)
      break
    }
    if (!data.tokens.length) break
    tokens.push(...data.tokens)
    if (data.tokens.length < PAGE_SIZE) break
    skip += PAGE_SIZE
  }
  return tokens
}

async function solanaTvl() {
  const tokens = await fetchAllSolanaTokens()
  const active = tokens.filter(t => t.extensions?.curveAddress && !t.extensions?.isGraduated)
  if (!active.length) return {}

  const seen = new Set()
  const curveKeys = []
  for (const t of active) {
    const addr = t.extensions.curveAddress
    if (seen.has(addr)) continue
    seen.add(addr)
    try { curveKeys.push(new PublicKey(addr)) } catch { }
  }
  if (!curveKeys.length) return {}

  // Read quote vault token account addresses from VirtualPool account data
  const connection = getConnection()
  const tokenAccounts = []
  for (const chunk of sliceIntoChunks(curveKeys, 100)) {
    const accounts = await connection.getMultipleAccountsInfo(chunk)
    for (const account of accounts) {
      if (!account || account.data.length < IS_MIGRATED_OFFSET + 1) continue
      if (!VIRTUAL_POOL_DISCRIMINATOR.every((b, i) => account.data[i] === b)) continue
      if (account.data.readUInt8(IS_MIGRATED_OFFSET) !== 0) continue
      tokenAccounts.push(new PublicKey(account.data.slice(QUOTE_VAULT_OFFSET, QUOTE_VAULT_OFFSET + 32)).toBase58())
    }
  }

  return sumTokens2({ tokenAccounts })
}

module.exports = {
  timetravel: false,
  methodology: `Omnichain token launchpad with Proof of Belief staking, configurable fee distribution, custom bonding curves, and anti-PVP mechanics across 8 chains.
TVL: Sum of reserves locked in active Printr bonding curves and tokens locked in Proof of Belief (POB) staking pools. Each curve holds a base pair token (e.g., USDC, USDT, USD1) that users deposit to buy tokens. Graduated tokens (curves with completionThreshold=0) are excluded as their liquidity has moved to DEX pools (Meteora on Solana, Uniswap V3 on ETH/Base/Arb/Avax, PancakeSwap V3 on BNB/Monad, Merchant Moe on Mantle). Locked POB tokens are not used as liquidity, they represent onchain commitment only.`
}

// Register TVL function for each supported EVM chain
Object.keys(chainIds).forEach(chain => {
  module.exports[chain] = { tvl }
})

// Register Solana TVL
module.exports.solana = { tvl: solanaTvl }
