const fs = require("fs")
const path = require("path")
const http = require("http")
const https = require("https")

require("dotenv").config()

const ROOT = path.resolve(__dirname, "..")
const STATE_FILE = path.join(ROOT, ".broken-adapter-state.json")

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) } catch { return {} }
}

function saveState(st) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2) + "\n")
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith("https") ? https.get : http.get
    get(url, { timeout: 60_000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchJson(res.headers.location).then(resolve, reject)
      if (res.statusCode >= 400) return reject(new Error("HTTP " + res.statusCode))
      let raw = ""
      res.on("data", (d) => (raw += d))
      res.on("end", () => { try { resolve(JSON.parse(raw)) } catch (e) { reject(e) } })
    }).on("error", reject)
  })
}

function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") }
function compact(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "") }

function resolveAdapter(item) {
  const probes = []
  const add = (v) => {
    if (!v) return
    const t = v.trim().replace(/^\/+/, "")
    const base = t.startsWith("projects/") ? t : "projects/" + t
    probes.push(base, base.endsWith(".js") ? base : base + ".js", base + "/index.js")
  }
  add(item.module?.replace(/.*\/blob\/main\//, ''))
  add(item.slug)
  add(slugify(item.protocolName || ""))
  add(compact(item.protocolName || ""))

  for (const rel of [...new Set(probes)]) {
    const abs = path.join(ROOT, rel)
    if (abs.startsWith(ROOT) && fs.existsSync(abs) && fs.statSync(abs).isFile()) return rel
  }
  return null
}

function errMsg(x) {
  return String(x.errorString_protocol || x.errorStack || x.errorString_tvl || x.error || "").trim()
}

async function fetchBroken() {
  const url = process.env.DL_BROKEN_ADAPTERS_ENDPOINT || process.env.DL_STATS_ENDPOINT || process.env.LLAMA_RUN_STATS_ENDPOINT
  if (!url) throw new Error("Set DL_STATS_ENDPOINT in .env")
  const data = await fetchJson(url)
  const now = Math.floor(Date.now() / 1000)
  return (data.hourlyOutdatedProtocols || [])
    .map((x) => {
      const err = errMsg(x)
      if (!err) return null
      const ts = Number(x.lastUpdate) || null
      const sec = ts && ts > 1e12 ? Math.floor(ts / 1000) : ts
      const adapter = resolveAdapter(x)
      const dirName = adapter ? path.basename(adapter, '.js').replace(/^index$/, '') || path.basename(path.dirname(adapter)) : null
      return {
        name: dirName || x.slug || x.protocolName || "?",
        slug: x.slug, module: x.module,
        adapter,
        ageDays: sec ? Number(((now - sec) / 86400).toFixed(1)) : null,
        chains: x.errorChains || [],
        error: err,
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1))
}

const pad = (s, n) => String(s).slice(0, n).padEnd(n)

const commands = {
  list: async (items) => {
    const st = loadState()
    console.log("\n" + pad("NAME", 30) + " " + pad("ADAPTER", 40) + " " + pad("AGE", 7) + " " + pad("STATUS", 10) + " ERROR")
    console.log("-".repeat(120))
    for (const it of items) {
      const status = st[it.name]?.status || (it.adapter ? "" : "no-path")
      console.log(pad(it.name, 30) + " " + pad(it.adapter || "???", 40) + " " + pad(it.ageDays ?? "?", 7) + " " + pad(status, 10) + " " + it.error.slice(0, 80))
    }
    const counts = { done: 0, skip: 0, wip: 0, noPath: 0 }
    for (const i of items) {
      const s = st[i.name]?.status
      if (s === "done") counts.done++
      else if (s === "skip") counts.skip++
      else if (s === "wip") counts.wip++
      else if (!i.adapter) counts.noPath++
    }
    console.log("\nTotal: " + items.length + "  Done: " + counts.done + "  WIP: " + counts.wip + "  Skipped: " + counts.skip + "  No path: " + counts.noPath + "  Remaining: " + (items.length - counts.done - counts.skip - counts.wip - counts.noPath) + "\n")
  },

  next: async (items) => {
    const st = loadState()
    const next = items.find((i) => i.adapter && !st[i.name])
    if (!next) return console.log("Nothing left to fix.")
    console.log("\n-- " + next.name + " --")
    console.log("Adapter: " + next.adapter)
    console.log("Age:     " + (next.ageDays ?? "?") + " days")
    console.log("Chains:  " + (next.chains.join(", ") || "n/a"))
    console.log("\nError:\n" + next.error.slice(0, 2000) + "\n")
    console.log("Test:    node test.js " + next.adapter)
    console.log('Done:    node scripts/fixBrokenAdapters.js done "' + next.name + '"\n')
  },


  done:  async (_, [name]) => { const st = loadState(); st[name] = { status: "done", at: new Date().toISOString() }; saveState(st); console.log("Done: " + name) },
  wip:   async (_, [name, ...rest]) => { const st = loadState(); st[name] = { status: "wip", at: new Date().toISOString(), note: rest.join(" ") || null }; saveState(st); console.log("WIP: " + name + (rest.length ? " -- " + rest.join(" ") : "")) },
  skip:  async (_, [name]) => { const st = loadState(); st[name] = { status: "skip", at: new Date().toISOString() }; saveState(st); console.log("Skipped: " + name) },
  reset: async (_, [name]) => { const st = loadState(); delete st[name]; saveState(st); console.log("Reset: " + name) },

  stats: async (items) => {
    const st = loadState()
    const groups = { done: [], wip: [], skip: [] }
    for (const [n, v] of Object.entries(st)) (groups[v.status] || []).push([n, v])
    console.log("\nDone (" + groups.done.length + "):")
    for (const [n, v] of groups.done) console.log("  " + n + "  (" + v.at + ")")
    console.log("WIP (" + groups.wip.length + "):")
    for (const [n, v] of groups.wip) console.log("  " + n + "  (" + v.at + ")" + (v.note ? "  " + v.note : ""))
    console.log("Skipped (" + groups.skip.length + "):")
    for (const [n, v] of groups.skip) console.log("  " + n + "  (" + v.at + ")")
    console.log("\nTotal broken: " + items.length + "  Remaining: " + items.filter((i) => i.adapter && !st[i.name]).length + "\n")
  },
}

const NEEDS_FETCH = new Set(["list", "next", "stats"])
const NEEDS_NAME = new Set(["done", "wip", "skip", "reset"])

async function run() {
  const [cmd, ...args] = process.argv.slice(2)

  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log([
      "",
      "fixBrokenAdapters.js -- work through broken DeFi Llama adapters",
      "",
      "  list                 Show all broken adapters",
      "  next                 Show next unfixed adapter",
      // removed 'show' command
      "  done <name>          Mark as fixed",
      "  wip <name> [note]    Mark as work-in-progress",
      "  skip <name>          Mark as skipped",
      "  reset <name>         Clear status",
      "  stats                Progress summary",
      "",
      "Env: DL_STATS_ENDPOINT in .env",
    ].join("\n"))
    return
  }

  if (!commands[cmd]) { console.error("Unknown: " + cmd); process.exit(1) }
  if (NEEDS_NAME.has(cmd) && !args[0]) { console.error("Missing <name>"); process.exit(1) }

  const items = NEEDS_FETCH.has(cmd) ? await fetchBroken() : []
  await commands[cmd](items, args)
}

run().catch((e) => { console.error(e.message); process.exit(1) })
