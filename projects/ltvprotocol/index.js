const { sumTokens } = require("../helper/sumTokens");

const AAVE_COLLATERAL_TOKEN_CONTRACT = '0x0b925ed163218f6662a35e0f0371ac234f9e9371';
const AAVE_BORROWED_TOKEN_CONTRACT = '0xeA51d7853EEFb32b6ee06b1C12E6dcCA88Be0fFE';
const VAULT_CONTRACT = '0xa260b049ddD6567E739139404C7554435c456d9E';

async function tvl(api) {
    await sumTokens({ api, tokensAndOwners: [[AAVE_COLLATERAL_TOKEN_CONTRACT, VAULT_CONTRACT]] });
}

async function borrowed(api) {
    const borrowedBalance = await api.call({
        abi: 'erc20:balanceOf',
        target: AAVE_BORROWED_TOKEN_CONTRACT,
        params: [VAULT_CONTRACT],
    });
    api.add(AAVE_BORROWED_TOKEN_CONTRACT, -1 * borrowedBalance)
}

module.exports = {
    methodology: 'counts all the collateral locked in the vault.',
    start:
        "2025-11-12",
    ethereum: {
        tvl,
        borrowed,
    }
}; 