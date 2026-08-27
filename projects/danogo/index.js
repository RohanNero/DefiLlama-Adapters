const { fetchURL } = require('../helper/utils');
const { post } = require('../helper/http');

const DANOGO_GATEWAY_ENDPOINT = 'https://danogo-gateway.tekoapis.com/api/v1'
const KUPO_ENDPOINT = 'https://kupo.tekoapis.com/matches'
const KOIOS_ENDPOINT = 'https://api.koios.rest/api/v1'
const DECODED_PREFIX_LENGTH = 2;
const ADA_TO_LOVELACE = 1000000;

const POOL_CONTRACTS = [
  'addr1wx2degj2ru0uctl4rnvs7vh5l608smvxrgkm7lf8txxjd6qs43szs',
  'addr1wxq5m69fj3ffw25l48lzcr6e7jtf0usgqpwqq8k2c8wl64cvrfrgq',
]
const MARKET_NFT_POLICY = '814de8a99452972a9fa9fe2c0f59f49697f208005c001ecac1ddfd57'

const STAKING_CONTRACT = 'addr1xxt4n07cnlafzefqvne69mmxmnzu2t9gtd27jw9d9yvc7u5htxla38l6j9jjqe8n5thkdhx9c5k2sk64ayu262ge3aequnmfak'

// Danogo-minted tokens (e.g. dADA,dUSDM,dUSDA,dUSDCx,dBTC)
const DANOGO_POLICIES = [
  '94dca24a1f1fcc2ff51cd90f32f4fe9e786d861a2dbf7d27598d26e8',
  '73f29518da0013a671458d52624a4828c5b5bedaff8a950b0063b1cf',
]

// Bech32 character set
const ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const ALPHABET_MAP = {};
for (let z = 0; z < ALPHABET.length; z++) ALPHABET_MAP[ALPHABET.charAt(z)] = z;

function convert(data, inBits, outBits, pad) {
  let value = 0, bits = 0;
  const maxV = (1 << outBits) - 1;
  const result = [];
  for (let i = 0; i < data.length; ++i) {
    value = (value << inBits) | data[i];
    bits += inBits;
    while (bits >= outBits) {
      bits -= outBits;
      result.push((value >> bits) & maxV);
    }
  }
  if (pad) {
    if (bits > 0) result.push((value << (outBits - bits)) & maxV);
  } else {
    if (bits >= inBits) return 'Excess padding';
    if ((value << (outBits - bits)) & maxV) return 'Non-zero padding';
  }
  return result;
}

const bech32AddressToHexString = (address) => {
  const lowered = address.toLowerCase();
  if (address !== lowered) throw new Error('Mixed-case string');
  const split = lowered.lastIndexOf('1');
  if (split <= 0) throw new Error('Missing prefix/separator');
  const wordChars = lowered.slice(split + 1);
  if (wordChars.length < 6) throw new Error('Data too short');
  const words = [];
  for (let i = 0; i < wordChars.length - 6; ++i) {
    const v = ALPHABET_MAP[wordChars.charAt(i)];
    if (v === undefined) throw new Error('Unknown character ' + wordChars.charAt(i));
    words.push(v);
  }
  const decoded = convert(words, 5, 8, false);
  if (!Array.isArray(decoded)) throw new Error(decoded);
  return Buffer.from(decoded).toString('hex').substring(DECODED_PREFIX_LENGTH);
};

const fetchSmartContractAddresses = async () => {
  const res = await fetchURL(`${DANOGO_GATEWAY_ENDPOINT}/smartcontract-addresses`);
  return res.data.data.addresses.map(bech32AddressToHexString);
}

const fetchUTXOs = async (pattern) => {
  const res = await fetchURL(`${KUPO_ENDPOINT}/${pattern}?unspent`);
  return res.data;
}

async function tvl(api) {
  const scriptHexes = await fetchSmartContractAddresses();
  const patterns = [
    ...scriptHexes.map((h) => `${h}/*`), // payment-credential wildcard: captures all stake variants
    STAKING_CONTRACT, // full address
  ];

  const utxoSets = await Promise.all(patterns.map(fetchUTXOs));

  for (const utxos of utxoSets) {
    for (const utxo of utxos) {
      api.add('lovelace', utxo.value.coins); // ADA
      for (const [assetId, quantity] of Object.entries(utxo.value.assets || {})) {
        // assetId is "policyId.assetNameHex"; skip protocol-minted receipts, keep real deposits.
        if (DANOGO_POLICIES.includes(assetId.split('.')[0])) continue;
        api.add(assetId.replace('.', ''), quantity); // concatenated unit is how the coins server keys it
      }
    }
  }
}

async function borrowed(api) {
  for (const contract of POOL_CONTRACTS) {
    const utxos = await post(`${KOIOS_ENDPOINT}/address_utxos`, { _addresses: [contract], _extended: true });
    for (const utxo of utxos) {
      const assets = utxo.asset_list || [];
      if (!utxo.inline_datum || !assets.some((a) => a.policy_id === MARKET_NFT_POLICY)) continue;

      const totalBorrow = Number(utxo.inline_datum.value.fields[2].int);
      if (!totalBorrow) continue;

      const underlyingAsset = assets.find((a) => a.policy_id !== MARKET_NFT_POLICY && !DANOGO_POLICIES.includes(a.policy_id));
      const underlying = underlyingAsset ? underlyingAsset.policy_id + (underlyingAsset.asset_name || '') : 'lovelace';
      api.add(underlying, totalBorrow);
    }
  }
}

module.exports = {
  timetravel: false,
  methodology:
    'TVL is the user-deposited assets (ADA + native tokens) locked in Dano Finance smart-contract UTXOs on Cardano, plus the ADA routed to the staking contract. Borrowed is the underlying lent out of each lending market, read from the market UTXO datums.',
  cardano: {
    tvl,
    borrowed,
  },
}
