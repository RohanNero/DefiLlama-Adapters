const { sumTokens2 } = require("../helper/unwrapLPs")

const rollup = "0x603bb2c05d474794ea97805e8de69bccfb3bca12"
const inbox = "0x15c718c05b8c0dbec4d648b6711d6ce8793969ee"

const owners = [
    "0xe05dc9d5969272831757181fff1532b066254bf1", // fee juice portal
]
const tokens = [
    "0xa27ec0006e59f245217ff08cd52a7e8b169e62d2" // AZTEC
]

async function tvl(api) {
  return sumTokens2({ api, owners, tokens, permitFailure: true })
}

module.exports = {
  methodology: "Tokens locked in Aztec L1 portal contracts for bridging to Aztec L2.",
  ethereum: { tvl },
}
