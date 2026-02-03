const ADDRESSES = require('../helper/coreAssets.json')
const { cachedGraphQuery } = require('../helper/cache');

const SUSD1PLUS_TOKEN_CONTRACT_ADDRESS_ETH = "0x8F18f2C97d2f5EC0e1d5B91c1D2ce245a9151972";
const SUSD1PLUS_TOKEN_CONTRACT_ADDRESS_BSC = "0x4F2760B32720F013E900DC92F65480137391199b";

const INVESTOR_WALLETS = [
  "0x6a67d91abcc57644dde0c7002ae514d9f756a445",
  "0xa459188fe0930cb9523c87b1552592036b72dfbc",
  "0x0b19cd74af3895523f3852736dc01a72a59b9750",
]

const SUBGRAPH_URL = "https://lorenzo-api.lorenzo-protocol.xyz/v1/graphql/otf";


const config = {
  ethereum: {
    contractAddr: SUSD1PLUS_TOKEN_CONTRACT_ADDRESS_ETH,
    query: `
      {
        tvlByChain(targetChainName: "ethereum") {
          targetChainName
          tokenName
          tvl
          readableTvl
        }
      }
    `,
  },
  bsc: {
    contractAddr: SUSD1PLUS_TOKEN_CONTRACT_ADDRESS_BSC,
    query: `
      {
        tvlByChain(targetChainName: "bnb") {
          targetChainName
          tokenName
          tvl
          readableTvl
        }
      }
    `,
  },
};

// susd1p to usd1
const TOKEN_MAPPINGS = {
  [SUSD1PLUS_TOKEN_CONTRACT_ADDRESS_ETH]: ADDRESSES.bsc.USD1,
  [SUSD1PLUS_TOKEN_CONTRACT_ADDRESS_BSC]: ADDRESSES.bsc.USD1,
}

async function tvl(api) {
  const chain = api.chain;
  const { contractAddr, query } = config[chain];

  const data = await cachedGraphQuery(`lorenzo-protocol-susd1plus/${chain}`, SUBGRAPH_URL, query);
  const tvlValue = data?.tvlByChain?.tvl;

  // exclude investor wallet balances on BSC
  let adjustedTvlValue = BigInt(tvlValue);
  if (chain == "bsc") {
    const tokenBalances = await api.multiCall({
      abi: 'erc20:balanceOf',
      calls: INVESTOR_WALLETS.map(addr => ({ target: contractAddr, params: addr })),
    });
    const investorBalance = tokenBalances.reduce((sum, b) => sum + BigInt(b || 0), 0n);
    adjustedTvlValue -= investorBalance;
  }


  if (adjustedTvlValue) {
    const targetToken = TOKEN_MAPPINGS[contractAddr] || contractAddr;
    api.add(targetToken, adjustedTvlValue);
  }
}

module.exports = {
  methodology: "Lorenzo sUSD1+ is a vault that represents tokenized real-world assets. The protocol maintains a Net Asset Value (NAV) that reflects the current value of the underlying asset portfolio per token.",
  ethereum: {
    tvl,
  },
  bsc: {
    tvl,
  }
};
