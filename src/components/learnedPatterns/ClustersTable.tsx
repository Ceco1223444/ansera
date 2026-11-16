import { useState } from 'react'
import {
  useCorrectionClusters,
  useRetireCluster,
  useSetClusterLock,
  useUpdateClusterRule,
} from '@/hooks/useLearnedPatterns'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

const RULE_THRESHOLD = 5

function ClusterRow({ cluster }: { cluster: { id: number; rule: string | null; member_count: number; rule_locked: boolean } }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(cluster.rule ?? '')
  const updateRule = useUpdateClusterRule()
  const retire = useRetireCluster()
  const setLock = useSetClusterLock()

  function save() {
    if (!draft.trim()) return
    updateRule.mutate({ id: cluster.id, rule: draft.trim() }, { onSuccess: () => setEditing(false) })
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border-light py-4 last:border-0">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>
          {cluster.member_count} correction{cluster.member_count === 1 ? '' : 's'} in this group
          {cluster.member_count < RULE_THRESHOLD && ` — needs ${RULE_THRESHOLD} before Ansera writes a rule automatically`}
        </span>
        {cluster.rule_locked && (
          <span className="font-medium text-accent">Frozen — Ansera won't auto-update this</span>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Write the standing rule for this group…"
            className="w-full rounded-lg border border-border bg-page p-3 text-sm text-ink placeholder:text-ink-muted outline-none focus:border-accent"
          />
          <p className="text-xs text-ink-muted">
            Saving doesn't freeze this — future corrections can still add to it automatically, unless
            you freeze it below.
          </p>
          <div className="flex gap-2">
            <Button onClick={save} disabled={updateRule.isPending || !draft.trim()}>
              {updateRule.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(cluster.rule ?? '')
                setEditing(false)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-ink-secondary">
            {cluster.rule ?? <span className="italic text-ink-muted">No rule written yet.</span>}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="secondary"
              onClick={() => setLock.mutate({ id: cluster.id, locked: !cluster.rule_locked })}
              disabled={setLock.isPending}
            >
              {cluster.rule_locked ? 'Unfreeze' : 'Freeze'}
            </Button>
            <Button
              variant="danger"
              onClick={() => retire.mutate(cluster.id)}
              disabled={retire.isPending}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ClustersTable() {
  const { data: clusters, isLoading, error } = useCorrectionClusters()

  if (isLoading) return <p className="text-sm text-ink-muted">Loading…</p>
  if (error) return <p className="text-sm text-cat-6-text">Failed to load learned patterns.</p>

  const active = (clusters ?? []).filter((c) => c.status === 'active')

  return (
    <Card>
      <p className="mb-1 text-sm font-medium text-ink">Learned Patterns</p>
      <p className="mb-3 text-xs text-ink-muted">
        Corrections are automatically grouped by the lesson they teach. Once a group has enough
        corrections, Ansera writes a standing rule from them and keeps it updated as new corrections
        arrive — you can edit, freeze, or delete any of them below.
      </p>
      {active.length === 0 ? (
        <p className="text-sm text-ink-muted">No correction groups yet.</p>
      ) : (
        <div className="flex flex-col">
          {active.map((cluster) => (
            <ClusterRow key={cluster.id} cluster={cluster} />
          ))}
        </div>
      )}
    </Card>
  )
}
