# pbuddy — Road to Application

**The bar:** InPost-level *experience*, startup-level *scale*, on one corridor.
Nothing a shopkeeper, sender, traveller, or Envestors assessor touches feels
like a prototype. Product work is built here (Muniba directs/reviews/owns);
founders own the business track. Apply only when BOTH tracks are green and
the pilot has produced `[measured]` numbers in BUSINESS.md.

## Product track (built in this repo)

### Phase 1 — Real identity & trust (start: 2026-07)
- [x] Phone-number auth replaces anonymous (2026-07-12; test number works
      end-to-end — real-device SMS needs APNs → F2)
- [x] ID verification (2026-07-12: Stripe Identity hosted document check,
      webhook-confirmed, verify-then-delete — pbuddy never sees documents;
      enforced: unverified travellers cannot be assigned parcels; sender
      enforcement flag deferred to ops dashboard)
- [x] Codes: UserDefaults → Keychain (2026-07-12, with legacy migration)
- [~] Recipient experience (2026-07-12): capture recipient name/phone at
      creation; public tracking page (track.html) via unguessable share
      token — live custody progress + pickup code shown only when ARRIVED;
      ShareLink in-app to send it. Remaining: auto-SMS the link on ARRIVED
      (needs SMS provider — Twilio, a founder signup) so the sender doesn't
      have to relay manually

### Phase 2 — The money loop, closed
- [x] Stripe webhook automated (2026-07-12: endpoint created via API, real
      signing secret, signed-event e2e verified on production)
- [x] In-app checkout (2026-07-12: server-priced Checkout Session, opens in
      in-app SFSafariViewController; native PaymentSheet later — needs
      pk_test publishable key)
- [x] Refund-on-cancel (2026-07-12: full at CREATED, minus £1 handling at
      DEPOSITED, via payment_intent refund)
- [x] Stripe Connect Express (2026-07-12): traveller onboarding from Carry
      tab; on DELIVERED, transfers fire per corridor splits (£2.20 traveller,
      £0.50/shop on the £4.99 pilot price); un-onboarded payees recorded as
      pending for ops retry. Shop onboarding lands with the ops dashboard.

### Phase 3 — Feels like a real company
- [x] FCM push at every custody event (2026-07-12: APNs key uploaded,
      sender pushed on all 4 transitions, traveller on assign + delivery)
- [~] Brand pass: **ParcelBuddy** naming (ADR 0007) → palette v2 enterprise
      grade (ADR 0008: navy anchor + signal orange, founder feedback);
      app icon (navy/parcel/chevrons, programmatic — designer pass optional);
      typography hierarchy pass; design-review fixes (2026-07-12: branded
      full-bleed sign-in, boarding-pass code sheet, prominent pay CTA,
      unified journey/progress language, de-emoji'd web). Remaining:
      dark-mode audit (hardcoded ink/paper tokens need adaptive variants)
- [~] Shop side v2: daily reconciliation LIVE (2026-07-12: "Today at your
      shop" — scans, parcels handled, ~£ earned, refreshes per scan).
      2026-07-13: printable counter card LIVE (counter-qr.html — shop QR +
      staff steps, print-ready, "counter card" button per shop in ops).
      2026-07-13: shop self-onboarding LIVE — public application form
      (shop-apply.html: name/contact/phone/address/corridor, validated,
      one pending application per phone), pending-applications queue in
      ops with approve (auto-creates shop + scan link, copied for texting
      to the shopkeeper) / reject. Remaining: deploy + verify on production
- [x] TestFlight (2026-07-13): App Store Connect record "Pbuddy"
      (ParcelBuddy was name-squatted — trademark check now a real F-task);
      Release archive uploaded, distribution signing automated. Testers
      added via ASC → TestFlight → Internal Testing.

### Phase 4 — Operational credibility
- [~] Ops dashboard LIVE at /ops.html (2026-07-12): parcel board with state/
      paid/stale pills, traveller assignment, verified-traveller roster,
      shop creation with scan links, shop Stripe payout onboarding links.
      Phone-auth gated (adminPhones/ collection). 2026-07-13: dispute + refund
      actions (opsResolve — cancel+refund any non-terminal parcel, dispute-
      refund a DELIVERED one; reason required, audit-trailed on the
      shipment), state/paid/stale/search filters, friendly no-access state,
      setup-ops.mjs seeding script. Remaining: deploy + verify on production
- [ ] Automated corridor+date matching (simple beats manual; ML is post-visa)
- [~] Firestore PITR + delete protection ENABLED (2026-07-12).
      Remaining: error alerting policy on function failures
- [x] Load evidence (2026-07-12): 1,000 shipments × full custody chain,
      100 concurrent — 1000/1000 DELIVERED, 0 failed scans, 4,000
      transitions in 24.4s (~164 scans/sec), p50 311ms / p95 763ms —
      on emulator hardware; proves protocol correctness under concurrency
      (no code collisions, transaction contention handled). Rerun against
      production before application. Script: functions/scripts/loadtest.mjs

### Phase 5 — Scale proof (the InPost answer)
- [x] Corridor #2 live (2026-07-13): London↔Manchester (296km, £6.99)
      seeded + 2 demo shops; app now has a corridor picker (no hardcoded
      route); verified end-to-end on production — 0.684kg CO₂e vs 0.498kg
      on lon-bhm, distinct pricing/splits. Playbook proven repeatable.
- [ ] Android decision point (build vs. roadmap-only — decide on pilot data)
- [ ] Locker-integration design doc (InPost/Quadient APIs) — "deposit points
      are pluggable" is the scalability answer
- [ ] Security review / basic pen-test

## Founder track (only you can do these)

- ~~**F1** Stripe webhook secret~~ ✅ done 2026-07-12 (test key provided;
      rotate before live mode, never share sk_live_)
- **F2** Apple Developer Program ✅ account connected — REMAINING: create an
      APNs auth key (.p8) at developer.apple.com → Keys, upload to Firebase
      console → Project settings → Cloud Messaging (unblocks real-SMS auth
      + push). Also paste pk_test publishable key for native PaymentSheet.
- **F3** Incorporate pbuddy Ltd + founders' agreement + IP assignment of this
      repo (COMPLIANCE §6); brother-funding structure decided → ADR
- **F4** Corridor decision (where the UK founder physically is)
- ~~**F5** Brand~~ ✅ 2026-07-12: **ParcelBuddy (Pbuddy)**, coral-orange
      (ADR 0007). Remaining: trademark/name availability check, logo design,
      pbuddy Ltd vs ParcelBuddy Ltd naming at incorporation (F3)
- **F6** Compliance execution: ICO registration, DPIA, insurance quotes,
      solicitor pass on ToS/carriage/worker-status (COMPLIANCE.md sequencing)
- **F7** GTM: shop pipeline (intent-to-partner letters count), Vinted/eBay
      seller waitlist, student-corridor outreach
- **F8** Pilot: 50–100 real parcels, independent users → converts BUSINESS.md
      `[assumed]` → `[measured]`
- **F9** English evidence for Muniba (Ecctis check / SELT booking)
- **F10** Envestors application drafted FROM BUSINESS.md once F8 reports

## Sequencing logic

Product Phases 1–3 ≈ 6–8 weeks · Phase 4 ≈ 3–4 weeks · Phase 5 ≈ 3 weeks —
roughly 3–4 months to the bar. F1–F5 are quick and unblock product work —
front-load them. F6–F8 run parallel to Phases 3–5. Pilot (F8) runs on the
*polished* product, not the skeleton. Application follows pilot data.
