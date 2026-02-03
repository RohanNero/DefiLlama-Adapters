const { cachedGraphQuery } = require('../helper/cache');
const ADDRESSES = require('../helper/coreAssets.json');

const BNBPLUS_TOKEN = "0x5D5721Bf35BDfFBa64E7b8fCeeb4712904a0DD11";
const PANCAKE_V3_NFT = "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364";
const INVESTOR_WALLETS = [
    "0xf1E5cb796940355DfAea708d24494c55a5d1cbC9",
    "0xf756921EFAa2F2dFF633e8dDCB07d8fe2333D652"
];

const TVL_QUERY = `{
    tvlByChain(targetChainName: "bnb", valueBase: BNB, tokenName: "BNB+") {
        tvl
    }
}`;

async function tvl(api) {
    const { tvlByChain: { tvl: totalTvl } } = await cachedGraphQuery(
        'lorenzo-protocol-bnbplus/bsc',
        'https://lorenzo-api.lorenzo-protocol.xyz/v1/graphql/otf',
        TVL_QUERY
    );

    // Get investor token balances
    const tokenBalances = await api.multiCall({
        abi: 'erc20:balanceOf',
        calls: INVESTOR_WALLETS.map(addr => ({ target: BNBPLUS_TOKEN, params: addr })),
    });

    // Get investor NFT positions
    const nftIds = await api.multiCall({
        abi: 'function tokenOfOwnerByIndex(address,uint256) view returns (uint256)',
        calls: INVESTOR_WALLETS.map(addr => ({ target: PANCAKE_V3_NFT, params: [addr, 0] })),
        permitFailure: true,
    });

    const positions = await api.multiCall({
        abi: 'function positions(uint256) view returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)',
        calls: nftIds.filter(Boolean).map(id => ({ target: PANCAKE_V3_NFT, params: [id] })),
    });

    const investorBalance = tokenBalances.reduce((sum, b) => sum + BigInt(b || 0), 0n);
    const nftBalance = positions.reduce((sum, p) => sum + BigInt(p?.[7] || 0), 0n);

    api.add(ADDRESSES.null, BigInt(totalTvl) - investorBalance - nftBalance);
}

module.exports = {
    methodology: "TVL from Lorenzo's BNB+ vault, excluding investor wallet balances and LP positions.",
    bsc: { tvl },
};