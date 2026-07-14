const iota = require('../helper/chain/iota')
const {getAllVaults} = require("./utils")
const ADDRESSES = require('../helper/coreAssets.json')

const COIN_TYPES= {
  IOTA: "0x2::iota::IOTA",
  stIOTA:
    "0x346778989a9f57480ec3fee15f2cd68409c73a62112d40a3efd13987997be68c::cert::CERT",
  VUSD: "0xd3b63e603a78786facf65ff22e79701f3e824881a12fa3268d62a75530fe904f::vusd::VUSD",
  iBTC: "0x387c459c5c947aac7404e53ba69541c5d64f3cf96f3bc515e7f8a067fb725b54::ibtc::IBTC"
};

const CERT_NATIVE_POOL = '0x02d641d7b021b1cd7a2c361ac35b415ae8263be0641f9475ec32af4b9d8a8056'
const CERT_METADATA = '0x8c25ec843c12fbfddc7e25d66869f8639e20021758cac1a3db0f6de3c9fda2ed'
const VCERT_NATIVE_POOL = '0xb435fa61ee8d5473ab36de02c88756f8c74fcc031b4e3a2fe2a6647bb06b2872'
const VCERT_METADATA = '0xb45b32d8d58c6499795036faa92b0561c6df089cdd4fc6ae8a0543981a698bf1'

async function getLstPerIotaRatio(nativePoolId, metadataId) {
    const nativePool = await iota.getObject(nativePoolId);
    const metadata = await iota.getObject(metadataId);

    const totalSupply = BigInt(metadata.fields.total_supply.fields.value) / BigInt(10 ** 9)
    const totalStaked = BigInt(nativePool.fields.total_staked) / BigInt(10 ** 9)
    const totalRewards = BigInt(nativePool.fields.total_rewards) / BigInt(10 ** 9)
    const staked = totalStaked + totalRewards

    return Number(totalSupply) / Number(staked)
}

async function tvl(api) {
    const vaults = await getAllVaults()
    const stIOTARatio = await getLstPerIotaRatio(CERT_NATIVE_POOL, CERT_METADATA)
    const vIOTARatio = await getLstPerIotaRatio(VCERT_NATIVE_POOL, VCERT_METADATA)
    const balances = {}
    Object.values(vaults).forEach((vault)=>{
        const balanceAmount = Number(vault.collateralBalance) / 10 ** vault.collateralDecimal
        const symbol = vault.token
        if(symbol === 'IOTA'){
            balances.iota = (balances.iota || 0) + balanceAmount
        }
        if(symbol === 'stIOTA'){
            balances.iota = (balances.iota || 0) + balanceAmount/stIOTARatio
        }
        if(symbol === 'vIOTA'){
            balances.iota = (balances.iota || 0) + balanceAmount/vIOTARatio
        }
        if(symbol === 'iBTC'){
            balances[`iota:${COIN_TYPES['iBTC']}`] = (balances[`iota:${COIN_TYPES['iBTC']}`] || 0) + Number(vault.collateralBalance)
        }
    })
    return balances
}


module.exports = {
    timetravel: false,
    iota: { 
        tvl,
    }
}