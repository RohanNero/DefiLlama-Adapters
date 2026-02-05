const { sumTokens2 } = require("../helper/unwrapLPs");

const anchor = "0x1c24a0FB7BcF2154A9D37B7b3aA443Bc63Fcc698";
const kta = "0xc0634090F2Fe6c6d75e61Be2b949464aBB498973";

async function tvl(api) {
    await sumTokens2({ api, owner: anchor, fetchCoValentTokens: true, blacklistedTokens: [kta] })
}

async function staking(api) {
    await sumTokens2({ api, owner: anchor, tokens: [kta] })
}

module.exports = {
    methodology: "TVL is calculated as the total value of tokens locked in the Base bridge.",
    base: {
        tvl,
        staking
    }
}