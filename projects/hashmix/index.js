const POOL = "0x587A7eaE9b461ad724391Aa7195210e0547eD11d";
const { sumTokens2, nullAddress } = require("../helper/unwrapLPs");
const { get } = require("../helper/http");

async function tvl(api) {
  // Dead endpoint
  // let tvl = await get("https://fvm.hashmix.org/fevmapi/tvl");
  // api.add(nullAddress, tvl.data);
  return sumTokens2({ api, owner: POOL, tokens: [nullAddress] });
}

module.exports = {
  methodology:
    "HashMix FIL Liquid Staking Protocol is a decentralized staking protocol on Filecoin, connecting FIL holders and miners in the ecosystem.",
  deadFrom: "2025-03-11", // Last reported data before endpoint went down, docs/twitter haven't updated in 2 years
  filecoin: {
    tvl,
  },
};
