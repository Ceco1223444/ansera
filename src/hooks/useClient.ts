import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/auth/useAuth'

export function useClient() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['clients', user?.email],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('email', user!.email!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!user?.email,
  })
}

export function useUpdateAutoSend() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (autoSend: boolean) => {
      const { error } = await supabase
        .from('clients')
        .update({ auto_send: autoSend })
        .eq('email', user!.email!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', user?.email] })
    },
  })
}

export function useUpdateLearnedPatternsEnabled() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('clients')
        .update({ learned_patterns_enabled: enabled })
        .eq('email', user!.email!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', user?.email] })
    },
  })
}

export function useUpdatePreferencesAiEnabled() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('clients')
        .update({ preferences_ai_enabled: enabled })
        .eq('email', user!.email!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', user?.email] })
    },
  })
}

// Live count of this client's logged corrections, for the learned-patterns
// recommendation hint. head:true fetches only the count, not the rows; RLS
// (reply_corrections_select_own) already scopes it to the caller's own rows.
export function useCorrectionCount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['reply_corrections_count', user?.email],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('reply_corrections')
        .select('*', { count: 'exact', head: true })
        .eq('client_email', user!.email!)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!user?.email,
  })
}
