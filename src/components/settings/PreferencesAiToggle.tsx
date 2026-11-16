import { useClient, useUpdatePreferencesAiEnabled } from '@/hooks/useClient'
import { Switch } from '@/components/ui/Switch'
import { Card } from '@/components/ui/Card'

export function PreferencesAiToggle() {
  const { data: client, isLoading } = useClient()
  const updateEnabled = useUpdatePreferencesAiEnabled()

  if (isLoading || !client) return null

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">Analyze corrections with AI</p>
          <p className="text-xs text-ink-muted">
            When off, corrections are still grouped by topic for free — Ansera just stops
            spending AI calls writing or updating standing rules from them. Turning this back
            on immediately writes rules for any group that's ready.
          </p>
        </div>
        <Switch
          checked={client.preferences_ai_enabled}
          disabled={updateEnabled.isPending}
          onChange={(next) => updateEnabled.mutate(next)}
        />
      </div>
    </Card>
  )
}
