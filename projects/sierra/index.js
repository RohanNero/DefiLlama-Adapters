const { sumTokens } = require('../helper/sumTokens');
const ADDRESSES = require('../helper/coreAssets.json');

const abi = "function getPoolDynamicAccountState(address lender) public view returns (tuple(address poolAddr, address accountAddr, address liquidityAssetAddr, uint256 tokenBalance, uint256 assetBalance, uint256 maxWithdrawRequest, uint256 maxRedeemRequest, uint256 requestedSharesOf, uint256 requestedAssetsOf, uint256 acceptedShares, uint256 acceptedAssets, uint256 assetsDeposited, uint256 assetsWithdrawn) _poolAccountState)"

const openTradeVaults = [
    '0x09Ca60Ca323a6313aE144778c3EbDfCCFBB5e5D2', // OpenTrade XMMF Vault
    '0x3458F1Cab06cdf7C9323d8FffB04093F9D8380b6', // OpenTrade xMorphoGPUSDC-Base Vault
    '0x4a8094F20906a453a4A74769aa74c4012B0d5Df6', // OpenTrade xAaveUSDC-ETH Vault
    '0x4c8eaBA17c3b30295f442A6415d495e8410a5693' // OpenTrade xWildcatWMTUSDC-ETH Vault
];

// Owner of reserves backing SIERRA, see https://debank.com/profile/0xBC7C0b1b9C61f35068561077FbaA163707128597 or https://docs.sierra.money/reserves-management/reserve-strategy
const owner = "0xBC7C0b1b9C61f35068561077FbaA163707128597"

async function tvl(api) {

    const balances = await sumTokens({
        api,
        owners: [
            owner,
        ],
        tokens: [
            ADDRESSES.avax.USDC, // USDC on Avalanche
        ],
    });

    // get tokens staked in openTrade
    const openTradeBalances = await api.multiCall({
        abi,
        calls: openTradeVaults.map(vault => ({ target: vault, params: owner })),
    })

    openTradeBalances.forEach(balance => {
        api.add(ADDRESSES.avax.USDC, balance.assetBalance)
    });

    return balances;
}

module.exports = {
    timetravel: false,
    avax: {
        tvl,
    },
};