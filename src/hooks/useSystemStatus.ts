import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// Talks to scripts/ops-service.mjs, a local-only (127.0.0.1) helper that
// checks/restarts the Docker containers, n8n, and tunnel-sync watcher this
// app depends on locally. Not a Supabase-backed hook -- deliberately plain
// fetch, since this is machine state, not customer data.
const OPS_SERVICE_URL = 'http://localhost:5679'

export interface DockerState {
  daemonReachable: boolean
  Ex: 'up' | 'down' | 'missing' | 'unknown'
  'ansera-ai-service': 'up' | 'down' | 'missing' | 'unknown'
}

export interface SystemStatus {
  checkedAt: string
  docker: DockerState
  n8n: {
    reachable: boolean
    active?: boolean
    lastExecution?: { mode: string; startedAt: string } | null
    error?: string
  }
  aiService: { reachable: boolean; error?: string }
  supabase: { reachable: boolean; error?: string }
  edgeFunctions: {
    approveReply: { reachable: boolean; error?: string }
    refineReply: { reachable: boolean; error?: string }
  }
  tunnel: { reachable: boolean; error?: string }
}

export interface HealResult {
  actions: string[]
  status: SystemStatus
  /** A tunnel cycle was triggered but hadn't finished by the time /heal returned. */
  tunnelPending?: boolean
}

export function useSystemStatus() {
  return useQuery({
    queryKey: ['system_status'],
    queryFn: async (): Promise<SystemStatus> => {
      const res = await fetch(`${OPS_SERVICE_URL}/status`)
      if (!res.ok) throw new Error(`status check failed: HTTP ${res.status}`)
      return res.json()
    },
    retry: false,
    refetchOnWindowFocus: false,
  })
}

export function useHealSystem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<HealResult> => {
      const res = await fetch(`${OPS_SERVICE_URL}/heal`, { method: 'POST' })
      if (!res.ok) throw new Error(`heal failed: HTTP ${res.status}`)
      return res.json()
    },
    onSuccess: (data) => {
      // /heal already returns fresh post-heal status -- write it straight
      // into cache instead of an extra invalidate+refetch round trip.
      queryClient.setQueryData(['system_status'], data.status)

      // A forced tunnel cycle can still be finishing when /heal returns; it
      // waits ~45s but a fresh quick-tunnel URL can take ~80s end to end.
      // Keep refreshing on our own so the panel flips to healthy by itself,
      // rather than sitting on a stale "unreachable" that invites a re-click
      // -- re-clicking used to kill the replacement tunnel mid-startup and
      // start the whole cycle over.
      if (data.tunnelPending) {
        for (const delay of [10_000, 20_000, 35_000, 50_000]) {
          setTimeout(() => queryClient.invalidateQueries({ queryKey: ['system_status'] }), delay)
        }
      }
    },
  })
}
