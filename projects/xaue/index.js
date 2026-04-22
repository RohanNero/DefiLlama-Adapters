const { getLogs2 } = require('../helper/cache/getLogs')

const XAUt = '0x68749665FF8D2d112Fa859AA293F07A622782F38'
const VAULT = '0xC86Daf84C01c891B21dEA66f4cA41CD3799f9E6B'
const ADMIN_WALLET = '0x07cd80c066e13679a70e125c76f76e796c8bc748'
const FROM_BLOCK = 24718738

const transferAbi = 'event Transfer(address indexed from, address indexed to, uint256 value)'

async function tvl(api) {
  const [deposits, outflows] = await Promise.all([
    getLogs2({ api, target: XAUt, fromBlock: FROM_BLOCK, eventAbi: transferAbi, extraTopics: [null, VAULT] }),
    getLogs2({ api, target: XAUt, fromBlock: FROM_BLOCK, eventAbi: transferAbi, extraTopics: [VAULT, null] }),
  ])

  let net = 0n
  for (const log of deposits) {
    if (log.from.toLowerCase() !== ADMIN_WALLET) net += BigInt(log.value)
  }
  for (const log of outflows) {
    if (log.to.toLowerCase() !== ADMIN_WALLET) net -= BigInt(log.value)
  }

  if (net > 0n) api.add(XAUt, net)
}

module.exports = {
  methodology: 'TVL is net XAUt deposited into the XAUE vault, excluding transfers to the admin wallet.',
  ethereum: { tvl },
}
