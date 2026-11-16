// Ansera local ops/health service.
// ------------------------------------------------------------------
// Local-only (127.0.0.1) HTTP service the Settings page's System Status
// panel talks to. Answers "is everything Send/Refine depend on actually
// up" and can take the narrow set of local-restart actions that are safe
// to run unattended. Mirrors scripts/tunnel-sync.ps1's conventions (hidden
// background process, logs to scripts/logs/, started at logon via a
// Startup-folder .vbs copy).
//
// Deliberately NOT done here, even from /heal: tunnel URL rotation and
// `supabase secrets set` (scripts/tunnel-sync.ps1 already owns that,
// fully automatically); recreating a `missing` (rm'd) container (ai-service
// is cheap to rebuild but that's a deploy action, not a restart; recreating
// Ex without its original volume mounts risks wiping n8n's workflows/
// credentials, so that only ever gets reported, never attempted); probing
// Gmail/OpenRouter/OpenAI credential validity (no cheap non-destructive
// check exists -- a real Send/Refine failure is the signal for those).
// ------------------------------------------------------------------

import { createServer } from 'node:http'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const ENV_PATH = path.join(PROJECT_ROOT, '.env')
const LOG_DIR = path.join(PROJECT_ROOT, 'scripts', 'logs')
const LOG_PATH = path.join(LOG_DIR, 'ops-service.log')
const TUNNEL_SYNC_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'tunnel-sync.ps1')

const PORT = 5679
// ID of the customer-support workflow inside the local n8n instance.
const N8N_WORKFLOW_ID = process.env.N8N_WORKFLOW_ID || 'fXQTTKCeR7wcj9IL'

mkdirSync(LOG_DIR, { recursive: true })

function log(msg) {
  const line = `${new Date().toISOString()}  ${msg}`
  try {
    appendFileSync(LOG_PATH, line + '\n')
  } catch {
    // logging is best-effort; never let it take the service down
  }
  console.log(line)
}

function loadEnv(filePath) {
  const out = {}
  if (!existsSync(filePath)) return out
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return out
}

const env = loadEnv(ENV_PATH)
const N8N_API_KEY = env.N8N_API_KEY
const SUPABASE_URL = env.SUPABASE_URL
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY

// ---- checks ---------------------------------------------------------

async function dockerDaemonUp() {
  try {
    await execFileAsync('docker', ['info', '--format', '{{.ServerVersion}}'])
    return true
  } catch {
    return false
  }
}

async function dockerState(name) {
  try {
    const { stdout } = await execFileAsync('docker', ['inspect', '--format', '{{.State.Running}}', name])
    return stdout.trim() === 'true' ? 'up' : 'down'
  } catch {
    // docker inspect exits non-zero both for "no such object" and other
    // errors; daemon reachability is checked separately so by the time we
    // get here a failure means the container doesn't exist.
    return 'missing'
  }
}

async function checkN8n() {
  if (!N8N_API_KEY) return { reachable: false, error: 'N8N_API_KEY missing from .env' }
  try {
    const res = await fetch(`http://localhost:5678/api/v1/workflows/${N8N_WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return { reachable: false, error: `HTTP ${res.status}` }
    const data = await res.json()

    let lastExecution = null
    try {
      const execRes = await fetch(
        `http://localhost:5678/api/v1/executions?workflowId=${N8N_WORKFLOW_ID}&limit=1`,
        { headers: { 'X-N8N-API-KEY': N8N_API_KEY }, signal: AbortSignal.timeout(4000) },
      )
      if (execRes.ok) {
        const execData = await execRes.json()
        const first = execData.data?.[0]
        if (first) lastExecution = { mode: first.mode, startedAt: first.startedAt }
      }
    } catch {
      // informational only -- not having it is not a failure
    }

    return { reachable: true, active: data.active, lastExecution }
  } catch (err) {
    return { reachable: false, error: String(err?.message || err) }
  }
}

async function checkAiService() {
  try {
    const res = await fetch('http://localhost:8123/health', { signal: AbortSignal.timeout(4000) })
    return { reachable: res.ok }
  } catch (err) {
    return { reachable: false, error: String(err?.message || err) }
  }
}

async function checkSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { reachable: false, error: 'SUPABASE_URL/ANON_KEY missing from .env' }
  }
  try {
    // NOT /rest/v1/ -- Supabase's gateway now 401s that root path for
    // anon/publishable keys ("Only the service_role API key can be used for
    // this endpoint"), even though the project is perfectly reachable.
    // GoTrue's health endpoint is the standard anon-safe reachability probe.
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(5000),
    })
    return { reachable: res.ok }
  } catch (err) {
    return { reachable: false, error: String(err?.message || err) }
  }
}

async function checkEdgeFunction(name) {
  if (!SUPABASE_URL) return { reachable: false, error: 'SUPABASE_URL missing from .env' }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'OPTIONS',
      signal: AbortSignal.timeout(5000),
    })
    return { reachable: res.status === 204 }
  } catch (err) {
    return { reachable: false, error: String(err?.message || err) }
  }
}

// A bare `powershell.exe -Command "1"` cold-starts in ~4s on this machine
// (CLR + hosting engine load, independent of what it runs) -- far too slow
// to shell out to on every /status poll. So /status checks the tunnel by
// actually fetching the current public URL (native fetch, no subprocess);
// any HTTP response at all proves traffic is routing through to n8n. The
// slower process-existence check (needed only to decide whether relaunching
// the watcher would create a duplicate) lives in isTunnelWatcherAlive()
// below and is only ever called from heal(), which already has a loading
// state in the UI.
async function checkTunnel() {
  // Re-read from disk every time, unlike the other env vars cached at
  // startup -- tunnel-sync.ps1 rewrites N8N_BASE_URL in .env live, in this
  // same process's lifetime, every time the tunnel cycles. A cached value
  // here would silently check a dead URL forever after the first rotation.
  const tunnelUrl = loadEnv(ENV_PATH).N8N_BASE_URL
  if (!tunnelUrl) return { reachable: false, error: 'N8N_BASE_URL missing from .env' }
  try {
    const res = await fetch(tunnelUrl, { signal: AbortSignal.timeout(5000) })
    // Cloudflare serves error 1033 ("no tunnel attached to this hostname") as a
    // real HTTP 530, which fetch() resolves happily -- so "got any response at
    // all" would report a dead tunnel as healthy. The more common shape of the
    // same failure is the hostname being deregistered entirely, which throws
    // below, but both mean traffic is not reaching n8n.
    if (res.status === 530) {
      return { reachable: false, error: 'HTTP 530 - hostname resolves but no tunnel is attached' }
    }
    return { reachable: true }
  } catch (err) {
    return { reachable: false, error: String(err?.message || err) }
  }
}

// A forced cycle takes ~18s in the good case (watcher backoff 5s + cloudflared
// start + URL capture ~7s + secrets sync ~4s) and up to ~80s at worst, so a
// cloudflared process younger than this is a tunnel still being born rather
// than a broken one worth killing.
const TUNNEL_CYCLE_GRACE_SECONDS = 90

// Every process fact /heal needs about the tunnel, in one PowerShell round
// trip -- powershell.exe cold-starts in ~4s on this machine no matter what it
// runs, so asking two separate questions would double the button's latency for
// nothing. Both of the commands here are built by joining plain quoted strings
// rather than a template literal, so that PowerShell's `$vars` can't collide
// with JS interpolation.
//
// Two things worth knowing about their shape:
//  - The watcher check has to exclude our own PID: this command's own
//    command-line literally contains "tunnel-sync.ps1" (it's right there in
//    the -like pattern), so without that it matches itself and always reports
//    a watcher alive, even when the real one is dead.
//  - Both end in an explicit `exit 0`. `Get-Process <name>` raises a
//    non-terminating error when nothing matches; -ErrorAction SilentlyContinue
//    hides the message but still leaves powershell.exe exiting 1, which
//    execFile surfaces as a rejection. That is the entire cause of the run of
//    bogus "FAILED to kill stuck cloudflared" lines in ops-service.log on
//    2026-07-26 -- every one of them really meant "there was nothing to kill".
const TUNNEL_PROBE_PS = [
  '$mypid = $PID',
  '$all = @(Get-CimInstance Win32_Process)',
  "$watchers = @($all | Where-Object { $_.ProcessId -ne $mypid -and $_.CommandLine -like '*tunnel-sync.ps1*' })",
  "$cf = @($all | Where-Object { $_.Name -eq 'cloudflared.exe' } | Sort-Object CreationDate -Descending)",
  '$age = -1',
  'if ($cf.Count -gt 0) { $age = [int]((Get-Date) - $cf[0].CreationDate).TotalSeconds }',
  '[Console]::Out.Write(("{0} {1} {2}" -f $watchers.Count, $cf.Count, $age))',
  'exit 0',
].join('\n')

const KILL_CLOUDFLARED_PS = [
  '$p = @(Get-Process cloudflared -ErrorAction SilentlyContinue)',
  'if ($p.Count -gt 0) { $p | Stop-Process -Force -ErrorAction SilentlyContinue }',
  '[Console]::Out.Write($p.Count)',
  'exit 0',
].join('\n')

async function tunnelProcessInfo() {
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      TUNNEL_PROBE_PS,
    ])
    const [watchers, cloudflareds, age] = stdout.trim().split(/\s+/).map((n) => parseInt(n, 10))
    return {
      watcherAlive: watchers > 0,
      cloudflaredRunning: cloudflareds > 0,
      cloudflaredAgeSeconds: Number.isFinite(age) ? age : -1,
      probeFailed: false,
    }
  } catch (err) {
    // Reported rather than guessed at: assuming "no watcher" on a failed probe
    // would make /heal spawn a second one to race the first over cloudflared
    // and the secrets sync.
    log(`tunnelProcessInfo failed: ${err?.message || err}`)
    return { watcherAlive: false, cloudflaredRunning: false, cloudflaredAgeSeconds: -1, probeFailed: true }
  }
}

async function killCloudflared() {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    KILL_CLOUDFLARED_PS,
  ])
  return parseInt(stdout.trim(), 10) || 0
}

async function buildStatus() {
  const daemonReachable = await dockerDaemonUp()
  const [dockerEx, dockerAi, n8n, aiService, supabase, approveReply, refineReply, tunnel] = await Promise.all([
    daemonReachable ? dockerState('Ex') : Promise.resolve('unknown'),
    daemonReachable ? dockerState('ansera-ai-service') : Promise.resolve('unknown'),
    checkN8n(),
    checkAiService(),
    checkSupabase(),
    checkEdgeFunction('approve-reply'),
    checkEdgeFunction('refine-reply'),
    checkTunnel(),
  ])

  return {
    checkedAt: new Date().toISOString(),
    docker: { daemonReachable, Ex: dockerEx, 'ansera-ai-service': dockerAi },
    n8n,
    aiService,
    supabase,
    edgeFunctions: { approveReply, refineReply },
    tunnel,
  }
}

// ---- heal -------------------------------------------------------------

async function heal() {
  const status = await buildStatus()
  const actions = []

  if (!status.docker.daemonReachable) {
    actions.push('Docker daemon not reachable -- start Docker Desktop manually')
  } else {
    // ansera-ai-service: stateless container, safe to start if stopped.
    if (status.docker['ansera-ai-service'] === 'down') {
      try {
        await execFileAsync('docker', ['start', 'ansera-ai-service'])
        actions.push('started ansera-ai-service')
      } catch (err) {
        actions.push(`FAILED to start ansera-ai-service: ${err.message}`)
      }
    } else if (status.docker['ansera-ai-service'] === 'missing') {
      actions.push('ansera-ai-service container not found -- not auto-recreated, see ai-service/README.md')
    }

    // Ex: down -> start. Up but n8n API unreachable, or active:false -> restart
    // (per past-incident notes, a plain activate call doesn't reliably restore
    // polling after a workflow edit desyncs it -- only a container restart does).
    if (status.docker.Ex === 'down') {
      try {
        await execFileAsync('docker', ['start', 'Ex'])
        actions.push('started Ex')
      } catch (err) {
        actions.push(`FAILED to start Ex: ${err.message}`)
      }
    } else if (status.docker.Ex === 'missing') {
      actions.push('Ex container not found -- not auto-recreated (would risk losing n8n workflow/credential data), needs manual recovery')
    } else if (status.docker.Ex === 'up' && (!status.n8n.reachable || status.n8n.active === false)) {
      try {
        await execFileAsync('docker', ['restart', 'Ex'])
        actions.push(
          status.n8n.active === false ? 'restarted Ex (workflow was active=false)' : 'restarted Ex (n8n API was unreachable)',
        )
      } catch (err) {
        actions.push(`FAILED to restart Ex: ${err.message}`)
      }
    }
  }

  // Tunnel.
  //
  // Since 2026-07-27 tunnel-sync.ps1 supervises its own tunnel and cycles a
  // zombied one within ~80s unattended, so this is a "don't make me wait"
  // override rather than the only route back to a working URL. It is
  // deliberately reluctant to act, because the single destructive thing it can
  // do -- killing cloudflared -- is exactly what wrecks a recovery already in
  // flight. That is not hypothetical: on 2026-07-26 two /heal calls six
  // seconds apart killed a healthy replacement tunnel two seconds into its
  // startup, and the watcher's very next log line was "no tunnel URL captured
  // (possibly rate-limited)". The first click had already fixed things; the
  // second broke them again, which is what "the tunnel is unreachable again
  // when I try to fix it from the button" actually was. So every branch here
  // except the last one deliberately does nothing.
  //
  // The guard keys off cloudflared's process age rather than remembering our
  // own last kill, so it equally protects a cycle the watcher started by
  // itself -- which /heal has no way to know about.
  let tunnelPending = false

  if (!status.tunnel.reachable) {
    const proc = await tunnelProcessInfo()

    if (proc.probeFailed) {
      actions.push('tunnel is down but the process probe failed -- taking no tunnel action rather than risk starting a second watcher')
    } else if (!proc.watcherAlive) {
      try {
        spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', TUNNEL_SYNC_SCRIPT], {
          detached: true,
          stdio: 'ignore',
        }).unref()
        tunnelPending = true
        actions.push('no tunnel-sync watcher was running -- relaunched it (a fresh tunnel URL can take up to ~80s)')
      } catch (err) {
        actions.push(`FAILED to relaunch tunnel-sync watcher: ${err.message}`)
      }
    } else if (!proc.cloudflaredRunning) {
      tunnelPending = true
      actions.push('tunnel down, but the watcher is already mid-restart (no cloudflared process yet) -- left it to finish')
    } else if (proc.cloudflaredAgeSeconds >= 0 && proc.cloudflaredAgeSeconds < TUNNEL_CYCLE_GRACE_SECONDS) {
      tunnelPending = true
      actions.push(
        `a replacement tunnel is already coming up (cloudflared started ${proc.cloudflaredAgeSeconds}s ago) -- left alone, since killing it here is what used to restart the whole cycle`,
      )
    } else {
      // Watcher alive, cloudflared alive and past the grace window, public URL
      // still not routing: a genuine zombie. Killing cloudflared is what makes
      // the watcher cycle to a fresh tunnel through its own existing restart +
      // secrets-sync logic -- this adds no new path to the secrets, it just
      // gets there sooner than the watcher's own probe would.
      try {
        const killed = await killCloudflared()
        tunnelPending = true
        actions.push(
          killed > 0
            ? `tunnel zombied (cloudflared alive ${proc.cloudflaredAgeSeconds}s but not routing) -- killed it to force a fresh cycle (up to ~80s)`
            : 'tunnel down and cloudflared exited between checks -- leaving the watcher to restart it',
        )
      } catch (err) {
        actions.push(`FAILED to kill zombied cloudflared: ${err.message}`)
      }
    }
  }

  if (actions.length === 0) actions.push('nothing to fix')
  log(`heal: ${actions.join('; ')}`)

  const after = tunnelPending
    ? await pollUntilSettled({ attempts: 15, intervalMs: 3000, waitForTunnel: true })
    : await pollUntilSettled()

  return { actions, status: after, tunnelPending: tunnelPending && !after.tunnel.reachable }
}

// Poll rather than wait a single fixed delay: ai-service is ready almost
// immediately, n8n needs several seconds to answer its API again after a
// start/restart, and a fresh tunnel needs longer still (~18s typical, ~80s at
// worst). The old fixed delay returned in ~2s and so reported a tunnel cycle
// that had barely begun as "still unreachable" -- which is what made the panel
// look like the button hadn't worked, and made clicking it again, the one
// action that genuinely broke the recovery, the obvious thing to try next.
async function pollUntilSettled({ attempts = 5, intervalMs = 2000, waitForTunnel = false } = {}) {
  let status = await new Promise((resolve) => setTimeout(() => resolve(buildStatus()), intervalMs))
  for (let i = 1; i < attempts; i++) {
    const dockerOk = status.docker.Ex !== 'down' && status.docker['ansera-ai-service'] !== 'down'
    const n8nOk = !status.docker.daemonReachable || status.docker.Ex !== 'up' || (status.n8n.reachable && status.n8n.active !== false)
    const tunnelOk = !waitForTunnel || status.tunnel.reachable
    if (dockerOk && n8nOk && tunnelOk) break
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    status = await buildStatus()
  }
  return status
}

// ---- server -------------------------------------------------------------

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  try {
    if (req.method === 'GET' && req.url === '/status') {
      const status = await buildStatus()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(status))
      return
    }
    if (req.method === 'POST' && req.url === '/heal') {
      const result = await heal()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  } catch (err) {
    log(`ERROR handling ${req.method} ${req.url}: ${err?.stack || err}`)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: String(err?.message || err) }))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  log(`ops-service listening on http://127.0.0.1:${PORT}`)
})
