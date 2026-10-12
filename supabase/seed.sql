-- Arjun's 10 assumed accounts: Indian mid-market / enterprise companies with large
-- frontline or distributed workforces. The manual columns (stage, notes, last
-- contact, relationship read) are illustrative — Arjun edits them from the dashboard.

insert into public.accounts (name, domain, news_query, stage, owner_notes, last_contact_date, relationship_read) values
('Zepto',             'zeptonow.com',         'Zepto',       'pilot',     'Pilot live in 12 Bengaluru dark stores. Ops head wants shift-swap analytics before expanding.', current_date - 9,  'Warm — champion in ops, procurement is slow.'),
('Delhivery',         'delhivery.com',        'Delhivery',                  'customer',  'Signed for sortation hubs in North. Expansion target: last-mile riders in South.',             current_date - 21, 'Strong. Renewal in Q1; upsell rider attendance module.'),
('Lenskart',          'lenskart.com',         'Lenskart',                   'discovery', 'Two discovery calls with HR ops. They run rosters on Excel across 2,000+ stores.',             current_date - 14, 'Interested but no budget owner identified yet.'),
('Urban Company',     'urbancompany.com',     '"Urban Company"',            'outreach',  'Cold. Sent intro email to VP Ops in August, no reply.',                                          current_date - 50, 'Unknown — need a trigger to re-open.'),
('Shadowfax',         'shadowfax.in',         'Shadowfax logistics',        'pilot',     'Pilot with 800 riders in Pune. Attendance accuracy up 18%. Waiting on CFO sign-off.',          current_date - 6,  'Good momentum; CFO is the blocker.'),
('Apollo Hospitals',  'apollohospitals.com',  '"Apollo Hospitals"',         'discovery', 'Nursing shift rostering is the pain. Met deputy GM HR at a conference.',                       current_date - 30, 'Long sales cycle. Patience.'),
('Max Healthcare',    'maxhealthcare.in',     '"Max Healthcare"',           'outreach',  'Referral possible via Apollo contact. Not yet approached.',                                     null,              'No relationship yet.'),
('Rapido',            'rapido.bike',          'Rapido bike taxi',           'outreach',  'Captain onboarding is huge but gig model may not fit. Explore ops staff instead.',               current_date - 40, 'Lukewarm.'),
('Licious',           'licious.in',           'Licious',                    'customer',  'Live in processing centres. Asked about leave + compliance module for new states.',             current_date - 12, 'Happy customer. Good reference.'),
('Wow! Momo',         'wowmomo.com',          '"Wow Momo"',                 'discovery', 'QSR chain, 600+ outlets. Store-manager turnover is their stated problem.',                       current_date - 18, 'Founder-led, decides fast if the timing is right.')
on conflict (name) do nothing;
