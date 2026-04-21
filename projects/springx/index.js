const { sumTokens2 } = require("../helper/unwrapLPs")

const FARM = "0xafF15Ca201C08F05f65d4d0A9d9C368C8356f796"
const poolsAbi = "function pools(uint256) view returns (address stakeToken, uint8 stakeDecimals, address vault, uint64 lastRewardTime, uint256 totalStaked, bool exists)"

async function tvl(api) {
  const poolIds = await api.call({ abi: "function getAllPoolIds() view returns (uint256[])", target: FARM })
  const pools = await api.multiCall({ abi: poolsAbi, target: FARM, calls: poolIds })
  const tokensAndOwners = pools.filter(p => p.exists).map(p => [p.stakeToken, p.vault])
  return sumTokens2({ api, tokensAndOwners })
}

module.exports = {
  plasma: { tvl },
}
