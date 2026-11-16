import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LoginGate } from '@/components/auth/LoginGate'
import { AppShell } from '@/components/layout/AppShell'
import { SplashIntro } from '@/components/layout/SplashIntro'
import { HomePage } from '@/pages/home/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { SignupPage } from '@/pages/SignupPage'
import { InboxPage } from '@/pages/InboxPage'
import { InboxThreadPage } from '@/pages/InboxThreadPage'
import { InboxEmptyState } from '@/pages/InboxEmptyState'
import { RecommendationsPage } from '@/pages/RecommendationsPage'
import { KnowledgeBasePage } from '@/pages/KnowledgeBasePage'
import { LearnedPatternsPage } from '@/pages/LearnedPatternsPage'
import { SettingsPage } from '@/pages/SettingsPage'

// Analytics pulls in the charting library, so it loads only when opened.
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))

function App() {
  return (
    <BrowserRouter>
      <SplashIntro />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* One shell for everyone — gating happens inside the content area. */}
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />

          {/* Inbox module holds real account data: gated when logged out. */}
          <Route element={<LoginGate />}>
            <Route path="inbox" element={<InboxPage />}>
              <Route index element={<InboxEmptyState />} />
              <Route path=":id" element={<InboxThreadPage />} />
            </Route>
            <Route
              path="analytics"
              element={
                <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
                  <AnalyticsPage />
                </Suspense>
              }
            />
            <Route path="recommendations" element={<RecommendationsPage />} />
            <Route path="knowledge-base" element={<KnowledgeBasePage />} />
            <Route path="learned-patterns" element={<LearnedPatternsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
