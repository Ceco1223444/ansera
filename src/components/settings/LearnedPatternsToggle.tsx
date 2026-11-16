import { useClient, useCorrectionCount, useUpdateLearnedPatternsEnabled } from '@/hooks/useClient'
import { Switch } from '@/components/ui/Switch'
import { Card } from '@/components/ui/Card'

// Live recommendation hint (spec 4.6). The 5-per-cluster floor already prevents
// premature rules, so ON is safe from day one -- the "~20" line is about when the
// feature becomes USEFUL, not a safety gate.
function recommendation(count: number): string {
  if (count >= 20) return `You have ${count} corrections — recommended on. ✅`
  return `You have ${count} correction${count === 1 ? '' : 's'}. Recommended once you reach ~20.`
}

export function LearnedPatternsToggle() {
  const { data: client, isLoading } = useClient()
  const { data: correctionCount } = useCorrectionCount()
  const updateEnabled = useUpdateLearnedPatternsEnabled()

  if (isLoading || !client) return null

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">Apply learned standing rules</p>
          <p className="text-xs text-ink-muted">
            When on, Ansera adds the recurring house-style rules it has learned from your
            corrections to every draft. Per-ticket suggestions from similar past corrections
            still apply either way.
          </p>
          {correctionCount !== undefined && (
            <p className="mt-1.5 text-xs text-ink-muted">{recommendation(correctionCount)}</p>
          )}
        </div>
        <Switch
          checked={client.learned_patterns_enabled}
          disabled={updateEnabled.isPending}
          onChange={(next) => updateEnabled.mutate(next)}
        />
      </div>
    </Card>
  )
}
