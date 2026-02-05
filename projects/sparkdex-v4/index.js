const { uniV3Export } = require("../helper/uniswapV3");

// SparkDex V4 — Algebra Integral 1.2.2 on Flare
module.exports = uniV3Export({
    flare: {
        factory: "0x805488DaA81c1b9e7C5cE3f1DCeA28F21448EC6A",
        fromBlock: 54459760,
        isAlgebra: true,
        blacklistedTokens: ["0x657097cc15fdec9e383db8628b57ea4a763f2ba0"] // SPRK
    },
});