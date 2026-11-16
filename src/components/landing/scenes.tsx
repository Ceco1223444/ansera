/**
 * Editorial scene illustrations for the suite landing page.
 *
 * These stand in for the photo prompts in the build brief: warm-neutral,
 * no readable text or logos, light-blue screens against ivory/sand tones so
 * the single #1a73e8 accent and the wordmark stay the only saturated color
 * moments on the page. All scenes share one vocabulary (wall wash, window
 * light, desk band, soft warm shadows) so they read as one shoot.
 */

import type { ReactNode } from 'react'

const INK_SHADOW = '#3e3726'

function SceneFrame({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <svg
      viewBox="0 0 960 540"
      role="img"
      aria-label={label}
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbf9f3" />
          <stop offset="1" stopColor="#f2ecdf" />
        </linearGradient>
        <linearGradient id={`${id}-desk`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8ddc6" />
          <stop offset="1" stopColor="#d9cbae" />
        </linearGradient>
      </defs>
      <rect width="960" height="540" fill={`url(#${id}-wall)`} />
      {/* window light falling across the wall */}
      <polygon points="40,0 330,0 210,540 0,540 0,120" fill="#fffdf4" opacity="0.4" />
      <polygon points="380,0 470,0 330,540 250,540" fill="#fffdf4" opacity="0.22" />
      {/* desk */}
      <rect y="396" width="960" height="144" fill={`url(#${id}-desk)`} />
      <rect y="396" width="960" height="4" fill="#f0e6d0" />
      {children}
    </svg>
  )
}

/** Hero: sunlit desk, laptop showing a calm dashboard, notebook, coffee. */
export function HeroScene() {
  return (
    <SceneFrame
      id="hs"
      label="A calm, sunlit desk with a laptop showing a minimal dashboard, a notebook, and a cup of coffee"
    >
      {/* laptop */}
      <ellipse cx="545" cy="472" rx="250" ry="18" fill={INK_SHADOW} opacity="0.1" />
      <rect x="375" y="140" width="340" height="228" rx="14" fill="#47433a" />
      <rect x="387" y="152" width="316" height="204" rx="6" fill="#ffffff" />
      {/* dashboard: sidebar */}
      <rect x="387" y="152" width="64" height="204" rx="6" fill="#f4f7fd" />
      <rect x="401" y="174" width="36" height="6" rx="3" fill="#1a73e8" opacity="0.85" />
      <rect x="401" y="196" width="36" height="6" rx="3" fill="#d7e3f8" />
      <rect x="401" y="218" width="36" height="6" rx="3" fill="#d7e3f8" />
      <rect x="401" y="240" width="36" height="6" rx="3" fill="#d7e3f8" />
      {/* dashboard: header + stat tiles */}
      <rect x="463" y="166" width="90" height="8" rx="4" fill="#dfe6f2" />
      {[463, 543, 623].map((x) => (
        <g key={x}>
          <rect x={x} y="186" width="68" height="40" rx="6" fill="#f3f6fc" />
          <rect x={x + 10} y="196" width="32" height="5" rx="2.5" fill="#c4d7f7" />
          <rect x={x + 10} y="208" width="20" height="8" rx="3" fill="#8fb4f0" />
        </g>
      ))}
      {/* dashboard: line chart */}
      <rect x="463" y="238" width="228" height="74" rx="6" fill="#f7fafe" />
      <path
        d="M470,300 L500,282 L530,290 L565,266 L600,272 L640,252 L680,258 L680,306 L470,306 Z"
        fill="#dce9fc"
        opacity="0.9"
      />
      <polyline
        points="470,300 500,282 530,290 565,266 600,272 640,252 680,258"
        fill="none"
        stroke="#1a73e8"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="640" cy="252" r="3.5" fill="#1a73e8" />
      {/* dashboard: rows */}
      <rect x="463" y="322" width="228" height="8" rx="4" fill="#eef1f7" />
      <rect x="463" y="338" width="176" height="8" rx="4" fill="#eef1f7" />
      {/* hinge + base */}
      <rect x="373" y="366" width="344" height="6" rx="3" fill="#b9b19e" />
      <path d="M330,372 L760,372 L790,404 L300,404 Z" fill="#e2dbc9" />
      <rect x="505" y="380" width="80" height="14" rx="5" fill="#d5cdb7" />
      {/* notebook + pen */}
      <ellipse cx="205" cy="522" rx="98" ry="9" fill={INK_SHADOW} opacity="0.08" />
      <g transform="rotate(-5 205 470)">
        <rect x="120" y="418" width="170" height="104" rx="8" fill="#fffdf6" stroke="#ece2cb" />
        {[444, 462, 480, 498].map((y) => (
          <rect key={y} x="152" y={y} width="112" height="3" rx="1.5" fill="#ece4d0" />
        ))}
        {[434, 450, 466, 482, 498].map((y) => (
          <circle key={y} cx="134" cy={y} r="3.5" fill="none" stroke="#cfc4a9" strokeWidth="1.5" />
        ))}
      </g>
      <g transform="rotate(14 330 500)">
        <rect x="286" y="496" width="88" height="7" rx="3.5" fill="#8b8578" />
        <polygon points="374,496 388,499.5 374,503" fill="#6e6a5f" />
      </g>
      {/* coffee */}
      <ellipse cx="818" cy="506" rx="46" ry="8" fill={INK_SHADOW} opacity="0.1" />
      <circle cx="858" cy="464" r="16" fill="none" stroke="#f1e7d1" strokeWidth="10" />
      <rect x="778" y="428" width="76" height="74" rx="11" fill="#fffdf6" />
      <ellipse cx="816" cy="432" rx="37" ry="9" fill="#fbf6ea" />
      <ellipse cx="816" cy="432" rx="29" ry="6.5" fill="#ac7c4c" />
      <path
        d="M801,412 C796,400 807,394 802,382"
        fill="none"
        stroke="#e2d5b8"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M829,410 C824,398 835,392 830,380"
        fill="none"
        stroke="#e2d5b8"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />
    </SceneFrame>
  )
}

/** Pain 1: too many tools — window-cluttered laptop, sticky notes, chat phone. */
export function ControlScene() {
  return (
    <svg
      viewBox="0 0 960 540"
      role="img"
      aria-label="A hand adjusting a toggle on a tablet showing a minimal settings screen"
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="ts-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#faf7f0" />
          <stop offset="1" stopColor="#f0e9d9" />
        </linearGradient>
        <filter id="ts-blur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <rect width="960" height="540" fill="url(#ts-wall)" />
      <g filter="url(#ts-blur)">
        <circle cx="130" cy="90" r="90" fill="#fffdf2" opacity="0.9" />
        <rect x="700" y="60" width="220" height="160" rx="12" fill="#eee5cf" opacity="0.8" />
        <rect x="0" y="440" width="960" height="100" fill="#e4d9bf" />
      </g>
      {/* tablet */}
      <g transform="rotate(-2 480 280)">
        <rect x="196" y="88" width="568" height="388" rx="26" fill="#46423a" />
        <rect x="212" y="104" width="536" height="356" rx="14" fill="#fdfdfa" />
        <rect x="248" y="136" width="128" height="12" rx="6" fill="#e8e4d8" />
        {[
          { y: 196, on: false, touched: false },
          { y: 262, on: true, touched: false },
          { y: 328, on: true, touched: true },
          { y: 394, on: false, touched: false },
        ].map(({ y, on, touched }) => (
          <g key={y}>
            <circle cx="272" cy={y} r="15" fill="#eef2f9" />
            <rect x="304" y={y - 10} width="164" height="10" rx="5" fill="#e6e2d6" />
            <rect x="304" y={y + 4} width="104" height="7" rx="3.5" fill="#efece4" />
            {touched && <circle cx="668" cy={y} r="30" fill="#1a73e8" opacity="0.14" />}
            <rect
              x="640"
              y={y - 16}
              width="56"
              height="32"
              rx="16"
              fill={on ? '#1a73e8' : '#dcd8ca'}
            />
            <circle cx={on ? 680 : 656} cy={y} r="12" fill="#ffffff" />
          </g>
        ))}
      </g>
      {/* hand reaching in from the lower right, finger on the third toggle */}
      <path
        d="M666,338 C660,320 672,306 688,312 C700,317 706,330 702,344 C716,384 736,452 754,540 L620,540 C632,462 650,392 666,338 Z"
        fill="#ecd0ae"
      />
      <path
        d="M712,420 C726,408 744,412 750,428 C756,444 748,458 736,464 L748,540 L700,540 Z"
        fill="#e7c9a4"
      />
      <ellipse cx="686" cy="326" rx="15" ry="19" fill="#f2d9b8" />
    </svg>
  )
}
