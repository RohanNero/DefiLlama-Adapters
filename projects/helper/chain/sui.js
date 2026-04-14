
const sdk = require('@defillama/sdk')

const http = require('../http')
const { getEnv } = require('../env')
const { transformDexBalances } = require('../portedTokens')
const { sliceIntoChunks, getUniqueAddresses } = require('../utils')

//https://docs.sui.io/concepts/data-access/graphql-rpc

const endpoint = () => getEnv('SUI_RPC')
const graphEndpoint = () => getEnv('SUI_GRAPH_RPC')

async function graphqlCall(query, variables = {}) {
  const { data, errors } = await http.post(graphEndpoint(), { query, variables })
  if (errors?.length && !data) throw new Error(`[sui graphql] ${errors[0].message}`)
  return { data, errors }
}

// GraphQL returns flat JSON while JSON-RPC wraps nested Move structs as { type, fields }
// Normalize to match old JSON-RPC format:
//   - UID "id" fields: "0x..." -> { id: "0x..." }
//   - Nested structs: { key: val } -> { fields: { key: val } }
function normalizeFields(fields) {
  if (!fields || typeof fields !== 'object') return fields
  const normalized = {}
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'id' && typeof value === 'string') {
      normalized[key] = { id: value }
    } else if (Array.isArray(value)) {
      normalized[key] = value.map(v => (typeof v === 'object' && v !== null) ? wrapStruct(v) : v)
    } else if (typeof value === 'object' && value !== null) {
      normalized[key] = wrapStruct(value)
    } else {
      normalized[key] = value
    }
  }
  return normalized
}

// Wrap a nested plain object as { fields: { ... } } to match JSON-RPC's struct format
function wrapStruct(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj
  return { fields: normalizeFields(obj) }
}

function formatObject(obj) {
  if (!obj) return null
  // GraphQL omits spaces after commas in type params; JSON-RPC includes them
  const type = obj.type.repr.replace(/,(?!\s)/g, ', ')
  return { type, fields: normalizeFields(obj.json), dataType: 'moveObject' }
}

async function getObject(objectId) {
  const { data } = await graphqlCall(`{
    object(address: "${objectId}") {
      asMoveObject { contents { json type { repr } } }
    }
  }`)
  return formatObject(data.object?.asMoveObject?.contents)
}

async function fnSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function queryEvents({ eventType, transform = i => i }) {
  let filter = {}
  if (eventType) filter.MoveEventType = eventType
  const items = []
  let cursor = null
  do {
    const { data, nextCursor, hasNextPage } = await call('suix_queryEvents', [filter, cursor], { withMetadata: true, })
    cursor = hasNextPage ? nextCursor : null
    items.push(...data)
  } while (cursor)
  return items.map(i => i.parsedJson).map(transform)
}

async function getObjects(objectIds, { sleep } = {}) {
  if (!objectIds.length) return []
  if (objectIds.length > 20) {
    const chunks = sliceIntoChunks(objectIds, 20)
    const res = []
    for (const chunk of chunks) {
      if (sleep && res.length) await fnSleep(sleep)
      res.push(...(await getObjects(chunk)))
    }
    return res
  }
  const aliases = objectIds.map((id, i) => `o${i}: object(address: "${id}") { asMoveObject { contents { json type { repr } } } }`).join('\n')
  const { data } = await graphqlCall(`{ ${aliases} }`)
  return objectIds.map((_, i) => formatObject(data[`o${i}`]?.asMoveObject?.contents))
}

async function getDynamicFieldObject(parent, id, { idType = '0x2::object::ID' } = {}) {
  // Fall back to JSON-RPC for dynamic field lookups — the BCS encoding
  // varies by type (object ID, vector<u8>, etc.) and is complex to handle generically
  return (await call('suix_getDynamicFieldObject', [parent, {
    "type": idType,
    "value": id
  }])).content
}

async function getDynamicFieldObjects({ parent, cursor = null, limit = 48, items = [], idFilter = i => i, addedIds = new Set(), sleep }) {
  if (sleep) await fnSleep(sleep)
  const {
    result: { data, hasNextPage, nextCursor }
  } = await http.post(endpoint(), { jsonrpc: "2.0", id: 1, method: 'suix_getDynamicFields', params: [parent, cursor, limit], })
  sdk.log('[sui] fetched items length', data.length, hasNextPage, nextCursor)
  const fetchIds = data.filter(idFilter).map(i => i.objectId).filter(i => i && !addedIds.has(i))
  fetchIds.forEach(i => addedIds.add(i))
  const objects = await getObjects(fetchIds, { sleep })
  items.push(...objects)
  if (!hasNextPage) return items
  return getDynamicFieldObjects({ parent, cursor: nextCursor, items, limit, idFilter, addedIds, sleep })
}

// Legacy JSON-RPC call - kept as fallback
async function call(method, params, { withMetadata = false } = {}) {
  if (!Array.isArray(params)) params = [params]
  const {
    result, error
  } = await http.post(endpoint(), { jsonrpc: "2.0", id: 1, method, params, })
  if (!result && error) throw new Error(`[sui] ${error.message}`)
  if (['suix_getAllBalances'].includes(method)) return result
  return withMetadata ? result : result.data
}

async function multiCall(calls) {
  return Promise.all(calls.map(i => call(...i)))
}


function dexExport({
  account,
  poolStr,
  token0Reserve = i => i.fields.coin_x_reserve,
  token1Reserve = i => i.fields.coin_y_reserve,
  getTokens = i => i.type.split('<')[1].replace('>', '').split(', '),
  isAMM = true,
  eventType,
  eventTransform,
}) {
  return {
    timetravel: false,
    misrepresentedTokens: true,
    sui: {
      tvl: async (api) => {
        const data = []
        let pools
        if (!eventType) {
          pools = await getDynamicFieldObjects({ parent: account, idFilter: i => poolStr ? i.objectType.includes(poolStr) : i })
        } else {
          pools = await queryEvents({ eventType, transform: eventTransform })
          pools = await getObjects(pools)
        }
        sdk.log(`[sui] Number of pools: ${pools.length}`)
        pools.forEach(i => {
          const [token0, token1] = getTokens(i)
          if (isAMM) {
            data.push({
              token0,
              token1,
              token0Bal: token0Reserve(i),
              token1Bal: token1Reserve(i),
            })
          } else {
            api.add(token0, token0Reserve(i))
            api.add(token1, token1Reserve(i))
          }
        })

        if (!isAMM) return api.getBalances()

        return transformDexBalances({ chain: 'sui', data })
      }
    }
  }
}


async function sumTokens({ owners = [], blacklistedTokens = [], api, tokens = [], }) {
  owners = getUniqueAddresses(owners, true)
  const blacklistSet = new Set(blacklistedTokens)
  const tokenSet = new Set(tokens)

  for (const owner of owners) {
    let after = null
    do {
      const { data } = await graphqlCall(`query ($after: String) {
        address(address: "${owner}") {
          balances(after: $after) {
            nodes { coinType { repr } totalBalance }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`, { after })
      const { nodes, pageInfo } = data.address.balances
      after = pageInfo.hasNextPage ? pageInfo.endCursor : null
      nodes.forEach(n => {
        const coinType = n.coinType.repr
        if (blacklistSet.has(coinType)) return
        if (tokenSet.size > 0 && !tokenSet.has(coinType)) return
        api.add(coinType, n.totalBalance)
      })
    } while (after)
  }
  return api.getBalances()
}

function sumTokensExport(config) {
  return (api) => sumTokens({ ...config, api })
}

async function queryEventsByType({ eventType, transform = i => i }) {
  const items = []
  let after = null
  do {
    const { data } = await graphqlCall(`query ($after: String) {
      events(first: 50, after: $after, filter: { type: "${eventType}" }) {
        pageInfo { endCursor hasNextPage }
        nodes { contents { json } }
      }
    }`, { after })
    const { pageInfo, nodes } = data.events
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null
    items.push(...nodes.map(n => n.contents.json).map(transform))
  } while (after)
  return items
}


async function getTokenSupply(token) {
  const { data } = await graphqlCall(`{
    coinMetadata(coinType: "${token}") {
      supply
      decimals
    }
  }`)
  const supply = data.coinMetadata.supply
  const decimals = data.coinMetadata.decimals ?? 0
  return { supply, decimals, normalized: supply / 10 ** decimals }
}

module.exports = {
  endpoint: endpoint(),
  call,
  multiCall,
  getObject,
  getObjects,
  queryEvents,
  getDynamicFieldObject,
  getDynamicFieldObjects,
  dexExport,
  sumTokens,
  sumTokensExport,
  queryEventsByType,
  getTokenSupply,
};
