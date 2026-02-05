const { uniV3Export } = require("../helper/uniswapV3");

module.exports = uniV3Export({
  flare: {
    factory: '0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652',
    fromBlock: 30717263,
    blacklistedTokens: ['0x657097cc15fdec9e383db8628b57ea4a763f2ba0'] // SPRK
  },
})
