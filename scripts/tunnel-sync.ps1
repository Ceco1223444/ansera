# Ansera self-healing Cloudflare quick-tunnel manager.
# ------------------------------------------------------------------
# Keeps a public URL pointed at local n8n (http://localhost:5678) and,
# every time the tunnel (re)starts, syncs the fresh URL into:
#   - the project .env  (N8N_BASE_URL, N8N_WEBHOOK_URL)
#   - public.service_config (read by approve-reply at call time, so
#     "Approve & Send" always reaches n8n even though the URL changes)
# Then it supervises cloudflared and restarts+resyncs if it either dies OR
# stops actually routing traffic (see the zombie note down in the supervise
# loop -- those are two genuinely different failures).
# Runs at logon via scripts\tunnel-launcher.vbs (a shortcut to it in
# shell:startup). Needs cloudflared on PATH or in its default install folder.
# ------------------------------------------------------------------

$ErrorActionPreference = 'Continue'
$Project     = Split-Path -Parent $PSScriptRoot
$EnvFile     = Join-Path $Project '.env'
$Cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $Cloudflared) { $Cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe' }
$LogDir      = Join-Path $Project 'scripts\logs'
$CfLog       = Join-Path $LogDir 'cloudflared.log'
$RunLog      = Join-Path $LogDir 'tunnel-sync.log'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log($m) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'), $m
  Add-Content -Path $RunLog -Value $line
}

function Set-EnvVar([string[]]$lines, [string]$key, [string]$val) {
  $pattern = "^$([regex]::Escape($key))="
  $found = $false
  $out = foreach ($l in $lines) {
    if ($l -match $pattern) { $found = $true; "$key=$val" } else { $l }
  }
  if (-not $found) { $out = @($out) + "$key=$val" }
  return $out
}

# Read one value straight out of .env. Only the first match counts, and the
# value is returned verbatim after the first "=" so keys whose values contain
# "=" (JWTs routinely do) survive intact.
function Get-EnvVal([string]$path, [string]$key) {
  if (-not (Test-Path $path)) { return $null }
  foreach ($l in (Get-Content -Path $path)) {
    if ($l -match "^$([regex]::Escape($key))=(.*)$") { return $Matches[1].Trim() }
  }
  return $null
}

# Reachability probes shell out to curl.exe rather than using
# Invoke-WebRequest: IWR throws on any non-2xx, so a perfectly-routed 404 from
# n8n would read as "tunnel down", and it is markedly slower to first byte.
# curl always prints a status, using 000 for "never got an HTTP response".
function Get-HttpCode([string]$u, [int]$timeoutSec) {
  try {
    $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time $timeoutSec $u
    return "$code".Trim()
  } catch {
    return '000'
  }
}

function Test-TunnelUp([string]$u) {
  $code = Get-HttpCode $u 10
  # 000 = DNS/connect failure -- the deregistered-hostname case we actually hit.
  # 530 = Cloudflare error 1033: the name still resolves but no tunnel is
  #       attached to it. Same failure, one layer further along.
  # Anything else (200/401/404/...) proves traffic reached Cloudflare's edge AND
  # the edge had a live tunnel to hand it to. Whether n8n itself is healthy is a
  # separate question that ops-service.mjs checks directly on localhost.
  return ($code -ne '000' -and $code -ne '530')
}

function Test-InternetUp() {
  return (Get-HttpCode 'https://www.cloudflare.com/cdn-cgi/trace' 8) -ne '000'
}

Log "=== tunnel-sync starting ==="

$backoff = 5   # seconds; grows on rapid failures so we never hammer Cloudflare's quick-tunnel rate limit (error 1015)

while ($true) {
  # one tunnel at a time — kill any strays before starting fresh
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  if (Test-Path $CfLog) { Remove-Item $CfLog -Force -ErrorAction SilentlyContinue }

  Log "starting cloudflared quick tunnel -> http://localhost:5678"
  $proc = Start-Process -FilePath $Cloudflared `
    -ArgumentList @('tunnel', '--url', 'http://localhost:5678', '--logfile', $CfLog) `
    -WindowStyle Hidden -PassThru
  $startedAt = Get-Date

  # wait up to ~80s for the URL to appear in the log
  $url = $null
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $CfLog) {
      $hit = Select-String -Path $CfLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($hit) { $url = $hit.Matches[0].Value; break }
    }
    if ($proc.HasExited) { break }
  }

  if (-not $url) {
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    Log "ERROR: no tunnel URL captured (possibly rate-limited); backing off ${backoff}s"
    Start-Sleep -Seconds $backoff
    $backoff = [Math]::Min($backoff * 2, 600)
    continue
  }

  $webhook = "$url/webhook/send-approved-reply"
  Log "tunnel URL: $url"

  # --- sync .env (BOM-free so dotenv parses line 1 cleanly) ---
  try {
    $lines = @(Get-Content -Path $EnvFile -ErrorAction Stop)
    $lines = Set-EnvVar $lines 'N8N_BASE_URL' $url
    $lines = Set-EnvVar $lines 'N8N_WEBHOOK_URL' $webhook
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($EnvFile, $lines, $utf8NoBom)
    Log ".env synced"
  } catch {
    Log "ERROR syncing .env: $_"
  }

  # --- publish the URL to the cloud -------------------------------------
  # PRIMARY PATH: write it into public.service_config over the REST API using
  # the service-role key we already read from .env. This needs no Supabase CLI
  # token, no login, and no interactive step -- which matters, because the CLI
  # path below silently stopped working and took "Approve & Send" down with it
  # for an unknown number of days (see migration 20260909140000).
  $configOk = $false
  try {
    $sbUrl = (Get-EnvVal $EnvFile 'SUPABASE_URL')
    $sbKey = (Get-EnvVal $EnvFile 'SUPABASE_SERVICE_ROLE_KEY')
    if (-not $sbUrl -or -not $sbKey) { throw "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env" }

    $body = (@{ key = 'n8n_webhook_url'; value = $webhook; updated_at = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress)
    $tmp  = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmp, $body, (New-Object System.Text.UTF8Encoding($false)))

    # curl.exe, not Invoke-WebRequest: PowerShell 5.1's client mangles UTF-8
    # bodies and its non-2xx handling is a terminating error, which is awkward
    # to distinguish from a network failure here.
    $resp = & curl.exe -s -o NUL -w "%{http_code}" -X POST `
      "$sbUrl/rest/v1/service_config?on_conflict=key" `
      -H "apikey: $sbKey" -H "Authorization: Bearer $sbKey" `
      -H "Content-Type: application/json" `
      -H "Prefer: resolution=merge-duplicates" `
      --data-binary "@$tmp" 2>&1
    Remove-Item $tmp -ErrorAction SilentlyContinue

    if ($resp -match '^2\d\d$') {
      $configOk = $true
      Log "service_config.n8n_webhook_url published (HTTP $resp)"
    } else {
      Log "ERROR publishing service_config.n8n_webhook_url -> HTTP $resp"
    }
  } catch {
    Log "ERROR publishing service_config.n8n_webhook_url: $_"
  }

  # SECONDARY PATH: keep the old secret in step when a CLI token happens to be
  # available. Best-effort by design -- it is no longer what Send depends on.
  try {
    Push-Location $Project
    $out = & npx --yes supabase secrets set "N8N_WEBHOOK_URL=$webhook" "N8N_BASE_URL=$url" 2>&1
    Pop-Location
    $joined = ($out -join ' | ')
    if ($joined -match 'Unauthorized') {
      Log "note: supabase secrets set unauthorized (no CLI token) -- fine, service_config is the source of truth now"
    } else {
      Log "supabase secrets set -> $joined"
    }
  } catch {
    Log "note: supabase secrets set failed: $_"
    try { Pop-Location } catch {}
  }

  # FAIL LOUDLY. If the primary path failed there is no working way for the
  # cloud to reach this tunnel, and every approval will 502. The previous
  # version logged the failure mid-stream and carried on printing
  # "tunnel live; supervising..." -- which read as success.
  if (-not $configOk) {
    Log "*** APPROVE & SEND IS BROKEN: the cloud has no route to this tunnel."
    Log "*** Fix public.service_config.n8n_webhook_url, or check SUPABASE_SERVICE_ROLE_KEY in .env."
  }

  Log "tunnel live (pid $($proc.Id)); supervising..."

  # --- supervise ---------------------------------------------------------
  # Deliberately NOT a bare Wait-Process. That only ever catches cloudflared
  # *exiting*, and the failure that actually bites in practice is a zombied
  # quick tunnel: the control stream to Cloudflare's edge breaks, the edge
  # deregisters the hostname (public URL starts NXDOMAINing), and cloudflared
  # settles into a permanent "Retrying connection in up to 1m4s" loop. The
  # process stays alive and Responding:True, so Wait-Process blocks forever
  # and Send stays silently broken until a human happens to notice.
  # Confirmed live 2026-07-26/27: tunnel stopped routing ~1h in, process still
  # perfectly healthy 66 min later, nothing in any log flagging it.
  # A quick tunnel's hostname is bound to its original registration, so that
  # retry loop can never recover the name -- only a fresh cloudflared process
  # gets a working URL. Hence: probe the public URL ourselves and force the
  # cycle.
  $checkEvery   = 5   # seconds between process-liveness checks
  $probeEvery   = 4   # ...and one HTTP probe per N of those (= every 20s)
  $graceProbes  = 1   # skip the first probe; a brand-new hostname needs a moment
  $failsToCycle = 3   # consecutive failed probes before declaring it zombied

  $tick    = 0
  $fails   = 0
  $zombied = $false

  while ($true) {
    Start-Sleep -Seconds $checkEvery
    if ($proc.HasExited) { break }

    $tick++
    if ($tick % $probeEvery -ne 0) { continue }
    if ($graceProbes -gt 0) { $graceProbes--; continue }

    if (Test-TunnelUp $url) {
      if ($fails -gt 0) { Log "tunnel probe recovered after $fails failed probe(s)" }
      $fails = 0
      continue
    }

    # Don't cycle just because *this machine's* connection dropped (laptop
    # asleep, wifi flapping, hotel captive portal). Tearing down and recreating
    # quick tunnels in that state fixes nothing and walks straight into
    # Cloudflare's rate limit (error 1015), which then blocks the recovery that
    # would otherwise have worked the moment the connection came back.
    if (-not (Test-InternetUp)) {
      Log "tunnel probe failed but this machine has no internet either -- waiting, not cycling"
      $fails = 0
      continue
    }

    $fails++
    Log "tunnel probe failed ($fails/$failsToCycle): $url"
    if ($fails -ge $failsToCycle) { $zombied = $true; break }
  }

  $ranSeconds = ((Get-Date) - $startedAt).TotalSeconds

  if ($zombied) {
    Log ("ZOMBIE: {0} stopped routing after {1:N0}s while cloudflared (pid {2}) stayed alive -- killing it to force a fresh tunnel" -f $url, $ranSeconds, $proc.Id)
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    # A zombie isn't a crash loop -- the process was never unhealthy, the edge
    # dropped it. Backing off here would just extend the outage for no reason.
    $backoff = 5
  } else {
    # a long-lived tunnel that just died -> retry promptly; one that died fast -> back off (avoids rate-limit thrash)
    if ($ranSeconds -ge 120) { $backoff = 5 } else { $backoff = [Math]::Min($backoff * 2, 600) }
    Log ("cloudflared exited after {0:N0}s; restarting in {1}s" -f $ranSeconds, $backoff)
  }
  Start-Sleep -Seconds $backoff
}
