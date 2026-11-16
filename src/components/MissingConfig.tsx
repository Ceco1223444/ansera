/** Shown instead of a blank page when the Supabase env vars are missing. */
export function MissingConfig() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-page p-6">
      <div className="max-w-md rounded-2xl bg-surface p-6 shadow-soft">
        <h1 className="text-lg font-semibold text-ink">Supabase is not configured</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (for the local stack,
          from <code>npx supabase status</code>), then restart <code>npm run dev</code>.
        </p>
      </div>
    </main>
  )
}
