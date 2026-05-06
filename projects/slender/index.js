const { callSoroban } = require('../helper/chain/stellar')

const POOL_ID = 'CCL2KTHYOVMNNOFDT7PEAHACUBYVFLRH2LYWVQB6IPMHHAVUBC7ZUUC2'

const RESERVES = [
  { symbol: 'XLM',  sac: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA' },
  { symbol: 'XRP',  sac: 'CAAV3AE3VKD2P4TY7LWTQMMJHIJ4WOCZ5ANCIJPC3NRSERKVXNHBU2W7' },
  { symbol: 'USDC', sac: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75' },
]

async function getReserveAddresses(assetSac) {
  const data = await callSoroban(POOL_ID, 'get_reserve', [assetSac])
  const rt = data?.reserve_type
  if (!Array.isArray(rt) || rt[0] !== 'Fungible' || rt.length < 3) {
    throw new Error(`Unexpected reserve_type for ${assetSac}: ${JSON.stringify(rt)}`)
  }
  return { sTokenAddress: rt[1], debtTokenAddress: rt[2] }
}

async function tvl(api) {
  for (const r of RESERVES) {
    const { sTokenAddress } = await getReserveAddresses(r.sac)
    const balance = await callSoroban(r.sac, 'balance', [sTokenAddress])
    api.add(r.sac, balance.toString())
  }
}

/** Underlying = debtToken total supply × debt_coeff / 1e9 (precision) */
async function borrowed(api) {
  for (const r of RESERVES) {
    const { debtTokenAddress } = await getReserveAddresses(r.sac)

    const [debtTokenSupply, debtCoeff] = await Promise.all([
      callSoroban(POOL_ID, 'token_total_supply', [debtTokenAddress]),
      callSoroban(POOL_ID, 'debt_coeff', [r.sac]),
    ])

    const underlyingRaw = debtTokenSupply * debtCoeff / 1_000_000_000n
    api.add(r.sac, underlyingRaw.toString())
  }
}

module.exports = {
  timetravel: false,
  methodology: `TVL counts all deposit tokens held by sToken contracts; borrowed from debtToken total supply × debt coefficient per reserve. Both queried on-chain via Soroban RPC simulation of pool.get_reserve(), pool.token_total_supply(), sac.balance(sToken), and pool.debt_coeff().`,
  stellar: {
    tvl,
    borrowed,
  },
}
