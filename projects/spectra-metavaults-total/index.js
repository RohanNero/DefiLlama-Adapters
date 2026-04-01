const sdk = require("@defillama/sdk");
const { getCache, setCache } = require("../helper/cache");
const config = require("../spectra-metavaults/config.json");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const WRAPPER_INIT_EVENT =
  "event MetaVaultWrapperInitialized(address indexed owner, address indexed infraVault, address indexed wrapper)";

async function getWrapperLogs(api, fromBlock) {
  const chain = api.chain;
  const key = `spectra-metavaults/${chain}/wrapper-init`;
  let cache = await getCache("logs", key);
  if (!cache || !Array.isArray(cache.logs)) cache = { logs: [], fromBlock, toBlock: 0 };

  const toBlock = await api.getBlock();
  const fetchFrom = cache.toBlock ? cache.toBlock + 1 : fromBlock;

  if (fetchFrom <= toBlock) {
    const newLogs = await sdk.getEventLogs({
      chain,
      noTarget: true,
      eventAbi: WRAPPER_INIT_EVENT,
      fromBlock: fetchFrom,
      toBlock,
      entireLog: true,
    });
    cache.logs = cache.logs.concat(newLogs || []);
    cache.toBlock = toBlock;
    await setCache("logs", key, cache);
  }

  return cache.logs;
}

function parseLogs(logs) {
  const ethers = require("ethers");
  const iface = new ethers.Interface([WRAPPER_INIT_EVENT]);
  return logs.map((l) => {
    try {
      const parsed = iface.parseLog(l);
      return {
        owner: parsed.args[0],
        infraVault: parsed.args[1],
        wrapper: parsed.args[2],
      };
    } catch {
      return l;
    }
  });
}

async function getMetavaultData(api, metavaultSources) {
  if (!metavaultSources.length) return null;

  const fromBlock = Math.min(...metavaultSources.map((s) => s.fromBlock));
  const rawLogs = await getWrapperLogs(api, fromBlock);
  const logs = parseLogs(rawLogs);

  const wrappersMap = {};
  for (const log of logs) {
    if (!log.wrapper) continue;
    const key = log.wrapper.toLowerCase();
    if (!wrappersMap[key]) wrappersMap[key] = log;
  }

  const wrappers = Object.values(wrappersMap);
  if (!wrappers.length) return null;

  // Validate each wrapper's owner is registered (chainsCount > 0)
  const registryCounts = await Promise.all(
    metavaultSources.map(({ metavaultRegistry }) =>
      api.multiCall({
        calls: wrappers.map(({ owner }) => ({
          target: metavaultRegistry,
          params: [owner],
        })),
        abi: "function chainsCount(address) view returns (uint256)",
        permitFailure: true,
      })
    )
  );

  const validWrappers = wrappers.filter((_, i) =>
    registryCounts.some((counts) => {
      const v = counts[i];
      if (!v) return false;
      try { return BigInt(v) > 0n; } catch { return false; }
    })
  );
  if (!validWrappers.length) return null;

  // Resolve on-chain infraVault for each valid wrapper
  const wrapperInfraVaults = await api.multiCall({
    calls: validWrappers.map(({ wrapper }) => ({ target: wrapper })),
    abi: "function getInfraVault() view returns (address)",
    permitFailure: true,
  });

  // Dedupe infraVaults
  const uniqueInfraVaults = {};
  validWrappers.forEach(({ infraVault: infraVaultFromEvent }, i) => {
    let infraVault = wrapperInfraVaults[i];
    if (!infraVault || infraVault.toLowerCase() === ZERO_ADDRESS)
      infraVault = infraVaultFromEvent;
    if (!infraVault || infraVault.toLowerCase() === ZERO_ADDRESS) return;
    uniqueInfraVaults[infraVault.toLowerCase()] = infraVault;
  });

  return Object.values(uniqueInfraVaults);
}

const tvl = async (api) => {
  const sources = config[api.chain];
  const metavaultSources = sources.filter(({ metavaultRegistry }) => metavaultRegistry);

  const infraVaults = await getMetavaultData(api, metavaultSources);
  if (!infraVaults || !infraVaults.length) return;

  const [assets, totalAssets] = await Promise.all([
    api.multiCall({
      calls: infraVaults,
      abi: "function asset() view returns (address)",
      permitFailure: true,
    }),
    api.multiCall({
      calls: infraVaults,
      abi: "function totalAssets() view returns (uint256)",
      permitFailure: true,
    }),
  ]);

  assets.forEach((asset, i) => {
    const balance = totalAssets[i];
    if (!asset || asset.toLowerCase() === ZERO_ADDRESS || !balance) return;
    api.add(asset, balance);
  });
};

module.exports = {
  methodology: "TVL is the total value of assets deposited in Spectra MetaVaults.",
  hallmarks: [["2026-02-12", "MetaVaults Launch"]],
};

Object.keys(config).forEach((chain) => {
  module.exports[chain] = { tvl };
});
