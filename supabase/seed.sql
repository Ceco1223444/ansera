-- Demo data for local development (`supabase db reset` loads this file).
--
-- Creates one demo store owner and a small, realistic support inbox so the
-- dashboard can be explored without Gmail, n8n or any API keys.
--
--   login:    demo@ansera.dev
--   password: ansera-demo
--
-- Every customer address uses the reserved example.com domain.

-- ---------------------------------------------------------------------------
-- demo account (the on_auth_user_created trigger creates its clients row)
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000',
  'd3a0c0de-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'demo@ansera.dev',
  extensions.crypt('ansera-demo', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(),
  'd3a0c0de-0000-4000-8000-000000000001',
  'd3a0c0de-0000-4000-8000-000000000001',
  jsonb_build_object('sub', 'd3a0c0de-0000-4000-8000-000000000001', 'email', 'demo@ansera.dev', 'email_verified', true),
  'email', now(), now(), now()
);

-- ---------------------------------------------------------------------------
-- knowledge base (embeddings are filled by n8n in production; the dashboard
-- only shows the text)
-- ---------------------------------------------------------------------------
insert into public.documents (content, metadata, client_email) values
  ('Shipping policy. Orders ship within 2 business days from our warehouse. Standard delivery takes 3-5 business days inside the EU; express takes 1-2. Every order gets a tracking link by email as soon as the parcel leaves the warehouse.',
   '{"source":"shipping-policy.md"}', 'demo@ansera.dev'),
  ('Returns and refunds. Unused items can be returned within 30 days of delivery for a full refund. Items damaged in transit are replaced or refunded at no cost; ask the customer for a photo of the damage and the order number.',
   '{"source":"returns-policy.md"}', 'demo@ansera.dev'),
  ('Warranty. Ceramic and glass products carry a 12-month warranty against manufacturing defects. The warranty does not cover accidental damage or wear from dishwashers on hand-wash-only items.',
   '{"source":"warranty.md"}', 'demo@ansera.dev'),
  ('Product care. Planters are frost-resistant down to -5 °C. Linen aprons are machine-washable at 40 °C; tumble drying shrinks them by up to 3 %.',
   '{"source":"product-care.md"}', 'demo@ansera.dev');

-- ---------------------------------------------------------------------------
-- inbox: two weeks of tickets across every status and category
-- ---------------------------------------------------------------------------
insert into public.email_logs
  (client_email, sender_email, subject, incoming_message, ai_response, final_response, label, status, thread_id, message_id, created_at)
values
  ('demo@ansera.dev', 'maria.k@example.com', 'Order #4127 still not shipped',
   'Hi, I ordered a ceramic planter five days ago (order #4127) and I still have no tracking number. Can you check what is going on?',
   'Hi Maria,

Thanks for reaching out about order #4127. Orders normally leave our warehouse within 2 business days, so yours should have shipped by now. I have asked the warehouse team to check it and will send you the tracking link as soon as it is available, today at the latest.

Sorry for the wait,
The Fernwood Home team',
   null, 'Shipping', 'pending_review', 'thr-4127', 'msg-4127-1', now() - interval '2 hours'),

  ('demo@ansera.dev', 'tom.becker@example.com', 'Planter arrived cracked',
   'The large planter from order #4098 arrived with a crack along the rim. Photo attached. What can you do?',
   'Hi Tom,

I am sorry the planter from order #4098 arrived damaged. Thank you for the photo, that is all we need. We will send a free replacement within 2 business days, or a full refund if you prefer. Just reply with your choice.

Best regards,
The Fernwood Home team',
   null, 'Reclamation', 'pending_review', 'thr-4098', 'msg-4098-1', now() - interval '5 hours'),

  ('demo@ansera.dev', 'li.wei@example.com', 'Do you ship to Norway?',
   'Hello, do you deliver to Norway and how long does it take?',
   'Hi,

Yes, we ship to Norway. Orders leave our warehouse within 2 business days and you will get a tracking link by email as soon as your parcel is on its way.

Best regards,
The Fernwood Home team',
   null, 'Shipping', 'pending_review', 'thr-no-1', 'msg-no-1', now() - interval '20 minutes'),

  ('demo@ansera.dev', 'sara.n@example.com', 'Apron shrank after washing',
   'My linen apron shrank after the first wash. Is that normal?',
   'Hi Sara, linen can shrink slightly. Our aprons are machine-washable at 40 °C, but tumble drying can shrink them by up to 3 %. Air drying keeps the original size.',
   'Hi Sara,

Thanks for letting us know. Linen aprons are machine-washable at 40 °C, but tumble drying can shrink them by up to 3 %, which is likely what happened. Air drying keeps the original size. If yours shrank more than that, reply with your order number and we will replace it.

Best regards,
The Fernwood Home team',
   'Technical', 'sent', 'thr-apron-1', 'msg-apron-1', now() - interval '1 day'),

  ('demo@ansera.dev', 'j.morales@example.com', 'Discount code not working',
   'The code SPRING10 says it is invalid at checkout.',
   'Hi, SPRING10 ended on 31 March. I have created a new 10 % code for you: WELCOME10. It works on any order this month.',
   'Hi,

Sorry about that. SPRING10 ended on 31 March. Here is a new 10 % code instead: WELCOME10. It works on any order placed this month.

Best regards,
The Fernwood Home team',
   'Pricing', 'sent', 'thr-code-1', 'msg-code-1', now() - interval '2 days'),

  ('demo@ansera.dev', 'anna.p@example.com', 'When is the small pot back in stock?',
   'The small ceramic pot in sage green has been sold out for weeks. Any idea when it comes back?',
   'Hi Anna,

The small sage-green pot is expected back in stock in about two weeks. Reply to this email and we will let you know the day it is available.

Best regards,
The Fernwood Home team',
   'Hi Anna,

The small sage-green pot is expected back in stock in about two weeks. Reply to this email and we will let you know the day it is available.

Best regards,
The Fernwood Home team',
   'Inventory', 'auto_sent', 'thr-stock-1', 'msg-stock-1', now() - interval '3 days'),

  ('demo@ansera.dev', 'p.okafor@example.com', 'Wrong colour delivered (order #4055)',
   'I ordered the terracotta planter but received the white one. Order #4055.',
   'Hi, sorry for the mix-up. We will send the terracotta planter today.',
   'Hi,

Sorry for the mix-up with order #4055. We are sending the terracotta planter today with express delivery, and you can keep the white one, no need to send it back.

Best regards,
The Fernwood Home team',
   'Reclamation', 'sent', 'thr-4055', 'msg-4055-1', now() - interval '4 days'),

  ('demo@ansera.dev', 'e.lindqvist@example.com', 'URGENT: double charged',
   'I was charged twice for order #4012!! Please fix this immediately.',
   'Hi, I can see two charges for order #4012. The duplicate has been refunded and will appear on your statement within 3-5 business days. Sorry for the trouble.',
   'Hi,

You are right, order #4012 was charged twice. The duplicate charge has been refunded today and will appear on your statement within 3-5 business days. I am sorry for the worry this caused.

Best regards,
The Fernwood Home team',
   'Urgent', 'sent', 'thr-4012', 'msg-4012-1', now() - interval '6 days'),

  ('demo@ansera.dev', 'k.huber@example.com', 'Are your planters frost-proof?',
   'Can I leave the large planter outside in winter?',
   'Hi,

Our planters are frost-resistant down to -5 °C. Below that we recommend bringing them inside or wrapping them, because water in the soil can expand and crack the ceramic.

Best regards,
The Fernwood Home team',
   'Hi,

Our planters are frost-resistant down to -5 °C. Below that we recommend bringing them inside or wrapping them, because water in the soil can expand and crack the ceramic.

Best regards,
The Fernwood Home team',
   'Technical', 'auto_sent', 'thr-frost-1', 'msg-frost-1', now() - interval '8 days'),

  ('demo@ansera.dev', 'r.silva@example.com', 'Collaboration request',
   'Hi! I run a home-decor Instagram account and would love to collaborate.',
   'Hi, thanks for thinking of us! I have forwarded your message to our marketing team, who will get back to you within a week.',
   'Hi,

Thanks for thinking of us! I have forwarded your message to our marketing team, who will get back to you within a week.

Best regards,
The Fernwood Home team',
   'Other', 'sent', 'thr-collab-1', 'msg-collab-1', now() - interval '11 days');

-- ---------------------------------------------------------------------------
-- correction learning: one mature cluster with a written rule, one young one
-- (centroids are placeholders; the ai-service computes real ones)
-- ---------------------------------------------------------------------------
insert into public.correction_clusters (id, client_email, centroid, member_count, rule, status, rule_written_at, updated_at)
overriding system value
values
  (1, 'demo@ansera.dev', array_fill(0.01::real, array[1536])::public.vector, 5,
   'Always repeat the customer''s order number in the reply, and close with "Best regards, The Fernwood Home team".',
   'active', now() - interval '3 days', now() - interval '3 days'),
  (2, 'demo@ansera.dev', array_fill(0.02::real, array[1536])::public.vector, 1,
   null, 'active', null, now() - interval '1 day');

select setval(pg_get_serial_sequence('public.correction_clusters', 'id'), 2);

insert into public.reply_corrections (client_email, ai_draft, final_sent, correction_note, source, cluster_id, created_at)
values
  ('demo@ansera.dev', 'Hi, sorry for the mix-up. We will send the terracotta planter today.',
   'Sorry for the mix-up with order #4055. We are sending the terracotta planter today with express delivery...',
   'Mention the order number and offer express delivery when we made the mistake.', 'human_edit', 1, now() - interval '4 days'),
  ('demo@ansera.dev', 'Hi, I can see two charges. The duplicate has been refunded.',
   'You are right, order #4012 was charged twice. The duplicate charge has been refunded today...',
   'Repeat the order number so the customer knows we looked at the right order.', 'human_edit', 1, now() - interval '6 days'),
  ('demo@ansera.dev', 'Thanks for your message. We will look into it.',
   'Thanks for your message about order #3990. We will look into it today. Best regards, The Fernwood Home team',
   'Always include the order number and sign off with the team name.', 'human_edit', 1, now() - interval '9 days'),
  ('demo@ansera.dev', 'Your parcel is on its way.',
   'Your parcel for order #3975 is on its way. Best regards, The Fernwood Home team',
   'Include the order number in shipping updates.', 'ai_refine', 1, now() - interval '10 days'),
  ('demo@ansera.dev', 'Cheers!',
   'Best regards, The Fernwood Home team',
   'Use the standard sign-off, not casual ones like "Cheers".', 'human_edit', 1, now() - interval '12 days'),
  ('demo@ansera.dev', 'Hi, linen can shrink slightly.',
   'Linen aprons are machine-washable at 40 °C, but tumble drying can shrink them by up to 3 %...',
   'Quote the exact care instructions from the knowledge base instead of being vague.', 'human_edit', 2, now() - interval '1 day');

insert into public.learned_patterns (client_email, rules, source_count, created_at)
values ('demo@ansera.dev',
        '- Repeat the customer''s order number.
- Sign off with "Best regards, The Fernwood Home team".
- Quote exact policy numbers (days, temperatures, percentages) from the knowledge base.',
        6, now() - interval '3 days');

-- ---------------------------------------------------------------------------
-- recommendations and policy requests
-- ---------------------------------------------------------------------------
insert into public.ai_recommendations (email, suggestions)
values ('demo@ansera.dev',
        'Two of this week''s ten tickets are about damaged or wrong items. Consider adding a short packing checklist for planters.

Shipping questions are the largest category. A delivery-times table on the product pages would answer most of them before they reach the inbox.

Three customers asked about stock dates. A "notify me" button on sold-out products would turn these tickets into sign-ups.');

insert into public.policy_requests (user_email, request_details, status, created_at)
values
  ('demo@ansera.dev', 'Add our holiday shipping cut-off dates (order by 18 December for Christmas delivery) to the knowledge base.', 'In Progress', now() - interval '2 days'),
  ('demo@ansera.dev', 'Allow returns of sale items for store credit only.', 'Pending', now() - interval '5 hours');
