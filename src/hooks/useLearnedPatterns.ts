import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

// Learned Patterns: one row per bucket of similar corrections. RLS
// (correction_clusters_select_own) already scopes rows to the caller's own
// client_email, matching the pattern used by useEmailLogs.
export function useCorrectionClusters() {
  return useQuery({
    queryKey: ['correction_clusters'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('correction_clusters')
        .select('*')
        .order('member_count', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// Editing a rule does NOT lock it — the background refresh merges future
// corrections into it the same as an AI-written rule (preserving your wording
// unless a new correction genuinely contradicts it; see
// ai-service/preferences.py _update_rule). Bumping rule_written_at to now
// tells the next refresh "everything up to this edit is already accounted
// for" — only corrections that arrive AFTER get folded in, not the whole
// history you already had in mind while writing it.
export function useUpdateClusterRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, rule }: { id: number; rule: string }) => {
      const { error } = await supabase
        .from('correction_clusters')
        .update({ rule, rule_written_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correction_clusters'] })
    },
  })
}

// Explicit, separate hard-freeze: stop the background refresh from EVER
// touching this rule again (not even to merge in a genuinely new, non-
// contradicting correction) until unlocked. Distinct from a plain edit, which
// stays open to future merges.
export function useSetClusterLock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, locked }: { id: number; locked: boolean }) => {
      const { error } = await supabase
        .from('correction_clusters')
        .update({ rule_locked: locked })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correction_clusters'] })
    },
  })
}

// "Delete" a learned pattern: retires the bucket (rule cleared, lock released)
// rather than a real SQL delete — a later similar correction can still
// reactivate it instead of orphaning history or starting from zero.
export function useRetireCluster() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('correction_clusters')
        .update({ status: 'retired', rule: null, rule_locked: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correction_clusters'] })
    },
  })
}

// Reply Corrections: the raw per-edit log. RLS (reply_corrections_select_own)
// scopes rows to the caller's own client_email.
export function useReplyCorrectionsList() {
  return useQuery({
    queryKey: ['reply_corrections_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reply_corrections')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useUpdateCorrectionNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, correction_note }: { id: number; correction_note: string }) => {
      const { error } = await supabase
        .from('reply_corrections')
        .update({ correction_note })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reply_corrections_list'] })
    },
  })
}

export function useDeleteCorrection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('reply_corrections').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reply_corrections_list'] })
    },
  })
}
