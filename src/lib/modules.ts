// Module registry — drives the topbar module switcher, the per-module tab
// row, and the login gate. One shell for everyone: Home is public, Inbox
// (real data) requires an account.
export type ModuleId = 'home' | 'inbox'

export const SUITE_MODULES: {
  id: ModuleId
  label: string
  to: string
  pill: 'live' | 'preview' | null
  requiresAuth: boolean
}[] = [
  { id: 'home', label: 'Home', to: '/', pill: null, requiresAuth: false },
  { id: 'inbox', label: 'Inbox', to: '/inbox', pill: 'live', requiresAuth: true },
]

// The Inbox routes stay top-level (/analytics, /settings, …), so any
// non-empty section belongs to Inbox.
export function moduleFromPathname(pathname: string): ModuleId {
  const section = pathname.split('/')[1] ?? ''
  if (section === '') return 'home'
  return 'inbox'
}
