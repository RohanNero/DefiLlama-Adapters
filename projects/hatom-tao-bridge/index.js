const { ApiPromise, WsProvider } = require("@polkadot/api");

const TREASURY_ADDRESS = '5HZAAREPzwBc4EPWWeTHA2WRcJoCgy4UBk8mwYFWR5BTCNcT'

module.exports = {
  timetravel: false,
  bittensor: {
    tvl: async (api) => {
      const provider = new WsProvider('wss://entrypoint-finney.opentensor.ai:443')
      const taoApi = await ApiPromise.create({ provider })
      const { data: { free, reserved } } = await taoApi.query.system.account(TREASURY_ADDRESS)

      api.addCGToken('bittensor', (Number(free) + Number(reserved)) / 1e9 )
      await taoApi.disconnect()
    },
  },
}
