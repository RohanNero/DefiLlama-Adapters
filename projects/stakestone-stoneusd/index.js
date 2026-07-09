const ETH_DEPOSIT_VAULT = '0x749342526451Eb0a8c5dc3b02cB60Cb1088ED2cC';
const ETH_WITHDRAWAL_CONTROLLER = '0x081d9019b016d7879b3aa4b278728771bfdb0b29';

const WITHDRAWAL_STATUS_COMPLETED = 5;

const abi = {
  getUnderlyings: 'function getUnderlyings() view returns (address[])',
  tokenDeposited: 'function tokenDeposited(address) view returns (uint256)',
  receiptsLength: 'function getWithdrawalReceiptsLength() view returns (uint256)',
  getReceipts: 'function getWithdrawalReceipts(uint256 offset, uint256 limit) view returns ((address requester, address requestAsset, uint256 requestShares, uint256 shareTokenPrice, uint256 requestAssetPrice, uint256 feeRate, uint8 status)[])',
};

const tvl = async (api) => {
  const underlyings = await api.call({ abi: abi.getUnderlyings, target: ETH_DEPOSIT_VAULT });

  const deposited = await api.multiCall({
    abi: abi.tokenDeposited,
    target: ETH_DEPOSIT_VAULT,
    calls: underlyings,
  });

  const decimals = await api.multiCall({ abi: 'erc20:decimals', calls: underlyings });

  const bal = {};
  underlyings.forEach((t, i) => { bal[t] = BigInt(deposited[i]); });

  const length = await api.call({ abi: abi.receiptsLength, target: ETH_WITHDRAWAL_CONTROLLER });
  const decByToken = Object.fromEntries(underlyings.map((t, i) => [t.toLowerCase(), decimals[i]]));

  const PAGE = 500;
  for (let offset = 0; offset < +length; offset += PAGE) {
    const receipts = await api.call({
      abi: abi.getReceipts,
      target: ETH_WITHDRAWAL_CONTROLLER,
      params: [offset, PAGE],
    });
    for (const r of receipts) {
      if (+r.status !== WITHDRAWAL_STATUS_COMPLETED) continue;
      const asset = r.requestAsset;
      const dec = decByToken[asset.toLowerCase()];
      if (dec === undefined) continue;

      const assetOut = (BigInt(r.requestShares) * BigInt(r.shareTokenPrice)) / BigInt(r.requestAssetPrice);
      const assetOutNative = (assetOut * (10n ** BigInt(dec))) / (10n ** 18n);
      if (bal[asset] !== undefined) bal[asset] -= assetOutNative;
    }
  }

  for (const [t, v] of Object.entries(bal)) {
    api.add(t, v < 0n ? 0n : v);
  }
};

module.exports = {
  ethereum: { tvl },
  bsc: { tvl: () => ({}) },
  monad: { tvl: () => ({}) },
  doublecounted: false,
};
