import { ClustersTable } from '@/components/learnedPatterns/ClustersTable'
import { CorrectionsTable } from '@/components/learnedPatterns/CorrectionsTable'

export function LearnedPatternsPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Learned Patterns</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Review, fix, or remove what Ansera has learned from your corrections.
        </p>
      </div>
      <ClustersTable />
      <CorrectionsTable />
    </div>
  )
}
