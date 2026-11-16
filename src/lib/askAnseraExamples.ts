// Example Ask Ansera Q&A cards, shared between the landing page section and
// the in-app Ask Ansera panel. These are marketing examples — the copy makes
// that explicit wherever they render.
export const ASK_EXAMPLES = [
  {
    prompt: 'Why did refund requests spike this week?',
    intelligence:
      '12 of 14 refund tickets this week reference the same product: “Ceramic Plant Pot — Small.” Common theme: packaging damage in transit.',
    nextStep:
      'Flag this SKU for packaging review, and add a damaged-in-transit policy to your knowledge base so every draft offers the same fix.',
    sources: 'Support tickets · Order data · Shipping carrier logs',
  },
  {
    prompt: 'What’s my average first-response time?',
    intelligence:
      'Your average first response this month is 42 seconds. 96% of replies were drafted by Ansera Inbox, and 71% were approved without edits.',
    nextStep:
      'Nothing needs fixing here. Shipping questions are almost always approved as drafted, so they are a good first candidate for auto-send.',
    sources: 'Support tickets · Send logs',
  },
]
