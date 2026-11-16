import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Inbox,
  Lock,
  Minus,
  ScrollText,
  UserCheck,
  Users,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { PreviewWidget } from '@/components/ui/PreviewWidget'
import { AskAnseraShowcase } from '@/components/askAnsera/AskAnseraShowcase'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { WaitlistForm } from '@/components/landing/WaitlistForm'
import {
  ControlScene,
  HeroScene,
} from '@/components/landing/scenes'

/* ---------------------------------------------------------------- content */

const ANCHOR_NAV = [
  { label: 'Modules', href: '#modules' },
  { label: 'Ask Ansera', href: '#ask-ansera' },
  { label: 'Security', href: '#security' },
]

const USE_CASE_CHIPS = [
  'Dropshippers',
  'Solo founders',
  'E-commerce brands',
  'Agencies',
]

const MODULES = [
  {
    id: 'inbox',
    name: 'Ansera Inbox',
    live: true,
    icon: Inbox,
    tagline: 'AI Customer Support',
    appPath: '/inbox',
    card: 'AI drafts every customer reply from your knowledge base and your own past corrections. You review and approve, and it learns from every edit.',
    detail:
      'Every reply drafted from your store’s policies and your own past corrections. Review each draft, or switch on auto-send once you trust it.',
    preview: ['Draft ready', '“Re: Order #4127 shipping delay”', 'Needs review', 'Sent'],
  },
]

const COMPARISON_ROWS = [
  {
    feature: 'Learns from your corrections',
    detail: 'Every edit you make trains the system, it doesn’t repeat the same mistake twice.',
    ansera: 'Adaptive',
    others: 'Static',
  },
  {
    feature: 'Built for operators, not just enterprises',
    detail: 'Designed for solo founders and small teams, not procurement committees.',
    ansera: 'Everyone',
    others: 'Enterprise-only',
  },
]

const DIFFERENT_POINTS = [
  {
    title: 'A calm, focused interface',
    body: 'Designed for clarity, not clutter. Every screen shows exactly what needs your attention, nothing else.',
  },
  {
    title: 'You’re always one edit away from control',
    body: 'Every AI action is reviewable and reversible. Automation with a human still in the loop when it matters.',
  },
]

const INTEGRATIONS = [
  { name: 'Gmail', live: true },
  { name: 'Shopify', live: false },
  { name: 'WooCommerce', live: false },
  { name: 'Slack', live: false },
]

const TRUST_BADGES = [
  {
    icon: Lock,
    title: 'Encrypted in transit and at rest',
    body: 'All traffic uses TLS and the database is encrypted at rest. API keys stay on the server and never reach the browser.',
  },
  {
    icon: Users,
    title: 'Isolated per store',
    body: 'Postgres row-level security keeps every store’s emails, corrections and knowledge base separate from every other store.',
  },
  {
    icon: UserCheck,
    title: 'Human-in-the-loop by default',
    body: 'AI drafts, you approve. Auto-send stays off until you switch it on for your inbox.',
  },
  {
    icon: ScrollText,
    title: 'Draft and send history',
    body: 'Every AI draft is stored next to the reply that was actually sent, so you can always see what changed.',
  },
]

/* ------------------------------------------------------------- primitives */

/** Anchor styled like the Button component, for in-page CTAs. */
function CtaLink({
  href,
  className = '',
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-all duration-150 ease-out hover:bg-accent-hover hover:shadow-card active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-page ${className}`}
    >
      {children}
    </a>
  )
}

function SectionHeading({
  eyebrow,
  title,
  intro,
}: {
  eyebrow?: string
  title: string
  intro?: string
}) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      {eyebrow && (
        <p className="mb-3 text-sm font-medium uppercase tracking-wide text-accent">{eyebrow}</p>
      )}
      <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h2>
      {intro && <p className="mt-4 text-base leading-relaxed text-ink-secondary">{intro}</p>}
    </div>
  )
}

function StatusBadgePill({ live }: { live: boolean }) {
  return <StatusPill tone={live ? 'live' : 'muted'}>{live ? 'Live' : 'Coming soon'}</StatusPill>
}

/* ------------------------------------------------------------------ page */

export function HomePage() {
  const location = useLocation()

  // Router navigations like "/#waitlist" (topbar Join Waitlist from another
  // tab) don't trigger native anchor scrolling — do it after render. Plain
  // in-page anchor clicks scroll natively and never reach this effect.
  useEffect(() => {
    if (!location.hash) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView()
  }, [location])

  return (
    <div>
      {/* slim in-page anchor nav — sticks under the topbar (main is the scroll container) */}
      <div className="sticky top-0 z-30 border-b border-border-light bg-page/85 backdrop-blur">
        <nav
          aria-label="Home sections"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-6 py-2.5"
        >
          {ANCHOR_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-ink-secondary transition-colors duration-150 hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <main>
        {/* 1 — hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-wide text-accent">
              The AI operating system for your online business
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
              Run your online business the way you do — with AI doing the work.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-secondary">
              Every customer reply drafted from your own past responses — reviewed by you, or
              sent automatically once you switch on auto-send.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <CtaLink href="#waitlist">Join Waitlist</CtaLink>
              <Link
                to="/inbox"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors duration-150 hover:text-accent-hover"
              >
                See what's live
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
          <div className="aspect-video overflow-hidden rounded-2xl shadow-raised">
            <HeroScene />
          </div>
        </section>

        {/* use-case chips strip */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-6 pb-20">
          <span className="mr-1 text-sm text-ink-muted">Built for</span>
          {USE_CASE_CHIPS.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-surface px-4 py-1.5 text-sm text-ink-secondary shadow-soft"
            >
              {chip}
            </span>
          ))}
        </div>

        {/* 2 — what Ansera Inbox does */}
        <section id="modules" className="scroll-mt-16 bg-surface py-20">
          <div className="mx-auto max-w-3xl px-6">
            <SectionHeading eyebrow="The product" title="A closer look." />
            <div className="grid gap-6">
              {MODULES.map((module) => (
                <Card key={module.id} id={module.id} className="scroll-mt-20 flex flex-col">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-ink">
                      {module.name}
                      <span className="font-normal text-ink-muted"> — {module.tagline}</span>
                    </h3>
                    <StatusBadgePill live={module.live} />
                  </div>
                  <p className="flex-1 text-sm leading-relaxed text-ink-secondary">{module.detail}</p>
                  <div className="mt-5">
                    <PreviewWidget parts={module.preview} live={module.live} />
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <Link
                      to={module.appPath}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors duration-150 hover:text-accent-hover"
                    >
                      {module.live ? 'Open Ansera Inbox' : 'Open in app'}
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                    {!module.live && (
                      <a
                        href="#waitlist"
                        className="text-sm text-ink-muted transition-colors duration-150 hover:text-ink"
                      >
                        Join the waitlist for early access
                      </a>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* 3 — comparison table */}
        <section id="compare" className="scroll-mt-16 py-20">
          <div className="mx-auto max-w-5xl px-6">
            <SectionHeading title="Not another point solution" />
            <div className="overflow-x-auto">
              <div className="min-w-[640px] overflow-hidden rounded-2xl bg-page shadow-card">
                <div className="grid grid-cols-[1.6fr_1fr_1fr] border-b border-border-light">
                  <div className="px-6 py-4" />
                  <div className="px-6 py-4 text-sm font-semibold text-ink">Ansera</div>
                  <div className="px-6 py-4 text-sm font-semibold text-ink-muted">Others</div>
                </div>
                {COMPARISON_ROWS.map((row, i) => (
                  <div
                    key={row.feature}
                    className={`grid grid-cols-[1.6fr_1fr_1fr] items-center ${
                      i > 0 ? 'border-t border-border-light' : ''
                    }`}
                  >
                    <div className="px-6 py-5">
                      <p className="text-sm font-semibold text-ink">{row.feature}</p>
                      <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{row.detail}</p>
                    </div>
                    <div className="flex items-center gap-2 px-6 py-5">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-tint">
                        <Check className="size-3.5 text-accent" aria-hidden />
                      </span>
                      <span className="text-sm font-medium text-ink">{row.ansera}</span>
                    </div>
                    <div className="flex items-center gap-2 px-6 py-5">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-hover">
                        <Minus className="size-3.5 text-ink-muted" aria-hidden />
                      </span>
                      <span className="text-sm text-ink-muted">{row.others}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 4 — support that feels different */}
        <section id="different" className="scroll-mt-16 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHeading
              title="Support that feels different"
              intro="Built with the same care as the tools you already trust with your business."
            />
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div className="aspect-[16/10] overflow-hidden rounded-2xl shadow-raised">
                <ControlScene />
              </div>
              <div className="flex flex-col gap-8">
                {DIFFERENT_POINTS.map((point) => (
                  <div key={point.title}>
                    <h3 className="text-base font-semibold text-ink">{point.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{point.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 5 — ask ansera */}
        <section id="ask-ansera" className="scroll-mt-16 bg-surface py-20">
          <div className="mx-auto max-w-4xl px-6">
            <SectionHeading
              eyebrow="Ask Ansera"
              title="Signals in. Next steps out."
              intro="Ansera reads the signals across your support tickets — then turns them into clear next steps."
            />
            <AskAnseraShowcase on="surface" />
          </div>
        </section>

        {/* 6 — integrations */}
        <section className="bg-surface py-16">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <h2 className="text-xl font-semibold text-ink">Works with the tools you already use.</h2>
            <p className="mt-2 text-sm text-ink-muted">Gmail today. More integrations are on the way.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {INTEGRATIONS.map(({ name, live }) => (
                <span
                  key={name}
                  className={`flex items-center gap-2 rounded-full bg-page px-5 py-2 text-sm font-medium shadow-soft ${
                    live ? 'text-ink-secondary' : 'text-ink-muted'
                  }`}
                >
                  {name}
                  {!live && (
                    <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                      Coming soon
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* 7 — trust & security */}
        <section id="security" className="scroll-mt-16 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHeading title="Built on trust" />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {TRUST_BADGES.map((badge) => (
                <div key={badge.title} className="rounded-2xl bg-surface p-6 shadow-soft">
                  <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-accent-tint">
                    <badge.icon className="size-5 text-accent" aria-hidden />
                  </div>
                  <h3 className="text-base font-semibold text-ink">{badge.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{badge.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 8 — waitlist */}
        <section id="waitlist" className="scroll-mt-16 bg-surface py-20">
          <div className="mx-auto max-w-3xl px-6">
            <SectionHeading
              title="The future of running your business starts here."
              intro="Ansera Inbox is live today. Join the waitlist for early access."
            />
            <WaitlistForm />
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
