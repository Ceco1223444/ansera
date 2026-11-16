import { useState } from 'react'
import {
  useDeleteCorrection,
  useReplyCorrectionsList,
  useUpdateCorrectionNote,
} from '@/hooks/useLearnedPatterns'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

function CorrectionRow({ correction }: { correction: { id: number; correction_note: string | null; source: string; created_at: string } }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(correction.correction_note ?? '')
  const updateNote = useUpdateCorrectionNote()
  const deleteCorrection = useDeleteCorrection()

  function save() {
    updateNote.mutate(
      { id: correction.id, correction_note: draft.trim() },
      { onSuccess: () => setEditing(false) },
    )
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border-light py-4 last:border-0">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>
          {correction.source === 'ai_refine' ? 'AI refine' : 'Manual edit'} ·{' '}
          {new Date(correction.created_at).toLocaleDateString()}
        </span>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-page p-3 text-sm text-ink outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <Button onClick={save} disabled={updateNote.isPending}>
              {updateNote.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(correction.correction_note ?? '')
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
            {correction.correction_note ?? <span className="italic text-ink-muted">(no note recorded)</span>}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteCorrection.mutate(correction.id)}
              disabled={deleteCorrection.isPending}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function CorrectionsTable() {
  const { data: corrections, isLoading, error } = useReplyCorrectionsList()

  if (isLoading) return <p className="text-sm text-ink-muted">Loading…</p>
  if (error) return <p className="text-sm text-cat-6-text">Failed to load corrections.</p>

  return (
    <Card>
      <p className="mb-1 text-sm font-medium text-ink">Reply Corrections</p>
      <p className="mb-3 text-xs text-ink-muted">
        The raw log of edits made to AI drafts. Deleting a correction here doesn't undo any rule
        already learned from it — it's just cleanup of the log itself.
      </p>
      {!corrections || corrections.length === 0 ? (
        <p className="text-sm text-ink-muted">No corrections logged yet.</p>
      ) : (
        <div className="flex flex-col">
          {corrections.map((correction) => (
            <CorrectionRow key={correction.id} correction={correction} />
          ))}
        </div>
      )}
    </Card>
  )
}
