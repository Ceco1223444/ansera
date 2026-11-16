import { RefreshCw } from 'lucide-react'
import { useHealSystem, useSystemStatus } from '@/hooks/useSystemStatus'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${ok ? 'bg-cat-2' : 'bg-cat-6'}`} />
        <span className="text-ink">{label}</span>
      </div>
      <span className={ok ? 'text-ink-muted' : 'text-cat-6-text'}>{detail}</span>
    </div>
  )
}

export function SystemStatusPanel() {
  const { data: status, isLoading, isError, refetch, isFetching } = useSystemStatus()
  const heal = useHealSystem()

  if (isLoading) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">Checking local services…</p>
      </Card>
    )
  }

  if (isError || !status) {
    return (
      <Card>
        <p className="text-sm font-medium text-ink">System status</p>
        <p className="mt-1.5 text-xs text-cat-6-text">
          Status service isn't reachable at localhost:5679. Start it with{' '}
          <code className="rounded bg-page px-1 py-0.5 text-ink-secondary">node scripts/ops-service.mjs</code>.
        </p>
      </Card>
    )
  }

  const dockerExOk = status.docker.Ex === 'up'
  const dockerAiOk = status.docker['ansera-ai-service'] === 'up'

  const rows = [
    {
      label: 'n8n (Ex)',
      ok: dockerExOk && status.n8n.reachable && status.n8n.active !== false,
      detail: !dockerExOk
        ? `container ${status.docker.Ex}`
        : !status.n8n.reachable
          ? 'API unreachable'
          : status.n8n.active === false
            ? 'workflow inactive'
            : 'active',
    },
    {
      label: 'ai-service',
      ok: dockerAiOk && status.aiService.reachable,
      detail: !dockerAiOk ? `container ${status.docker['ansera-ai-service']}` : status.aiService.reachable ? 'healthy' : 'unreachable',
    },
    {
      label: 'Supabase',
      ok: status.supabase.reachable,
      detail: status.supabase.reachable ? 'reachable' : 'unreachable',
    },
    {
      label: 'Edge functions',
      ok: status.edgeFunctions.approveReply.reachable && status.edgeFunctions.refineReply.reachable,
      detail:
        status.edgeFunctions.approveReply.reachable && status.edgeFunctions.refineReply.reachable
          ? 'deployed'
          : `${[
              !status.edgeFunctions.approveReply.reachable && 'approve-reply',
              !status.edgeFunctions.refineReply.reachable && 'refine-reply',
            ]
              .filter(Boolean)
              .join(', ')} unreachable`,
    },
    {
      label: 'Tunnel',
      ok: status.tunnel.reachable,
      detail: status.tunnel.reachable ? 'reachable' : 'unreachable',
    },
  ]

  const allHealthy = rows.every((row) => row.ok)

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-ink">System status</p>
          <p className="text-xs text-ink-muted">Local services Send &amp; Refine depend on.</p>
        </div>
        <Button variant="ghost" onClick={() => refetch()} disabled={isFetching} className="gap-1.5 !px-2 !py-1 text-xs">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} strokeWidth={2} />
          Refresh
        </Button>
      </div>

      <div className="mt-3 divide-y divide-border-light">
        {rows.map((row) => (
          <StatusRow key={row.label} label={row.label} ok={row.ok} detail={row.detail} />
        ))}
      </div>

      {status.n8n.lastExecution && (
        <p className="mt-2 text-xs text-ink-muted">
          Last inbound activity: {timeAgo(status.n8n.lastExecution.startedAt)} ({status.n8n.lastExecution.mode})
        </p>
      )}

      {!allHealthy && (
        <Button onClick={() => heal.mutate()} disabled={heal.isPending} className="mt-3 w-full">
          {heal.isPending ? 'Fixing…' : 'Fix Now'}
        </Button>
      )}

      {heal.data && <p className="mt-2 text-xs text-ink-muted">{heal.data.actions.join(' · ')}</p>}

      {heal.data?.tunnelPending && (
        <p className="mt-1 text-xs text-ink-muted">
          The tunnel is still coming up — a fresh URL can take up to ~80s. This panel refreshes itself, so there's no
          need to press Fix Now again.
        </p>
      )}

      <p className="mt-3 text-xs text-ink-muted">
        Not covered here: Gmail / OpenRouter / OpenAI credential validity aren't live-probed — a real Send or
        Refine failure is still the fastest signal for those.
      </p>
    </Card>
  )
}
