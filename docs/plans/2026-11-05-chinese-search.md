# Chinese Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify every existing search entry point around predictable Chinese text, pinyin and multi-field keyword matching.

**Architecture:** Keep filtering in the browser over data already returned by authorized APIs. Extend `CrewNameSearch` for matching and composition-safe input binding; reuse it in management lists and schedule pickers. Preserve the Bootstrap layout, fonts and existing color tokens; change only search guidance and behavior.

**Tech Stack:** Vanilla JavaScript, pinyin-pro 3.29.5, Bootstrap, Node assertions and Playwright.

---

### Task 1: Shared search contract

**Files:** `public/js/name-search.js`, `tests/test_name_search.js`, `package.json`.

1. Add a `test:search` command with assertions for Chinese substrings, full-width/case/whitespace normalization, full and abbreviated pinyin, mixed text, polyphonic surnames, ü/v and accented pinyin.
2. Assert cross-field AND semantics for space-separated keywords and reject non-contiguous initials and matches inside pinyin syllables. Preserve literal email/project-code punctuation.
3. Run `npm run test:search` before implementation and confirm failures for missing behavior.
4. Implement the common matcher using the installed pinyin-pro match API with explicit continuous syllable-prefix matching. Bound cached indexes and preserve lazy loading/plain-text fallback.
5. Add a reusable input binding that suppresses filtering during IME composition and commits on composition end; use it for all current search controls.

### Task 2: Management searches

**Files:** `public/js/manage.js`, `public/js/i18n.js`.

1. Search authorized personnel by name/team/position/email/phone; search clients by name/notes; retain name/client/code matching for projects and apply the same fields to archived entries.
2. Preserve the focused personnel input and caret during rendering. Bind inputs once using the shared helper.
3. Add translated search guidance, useful empty-state recovery text and accessible result feedback, using existing styling.

### Task 3: Schedule picker searches

**Files:** `public/js/schedule/05-modal.js`, `public/js/core.js`.

1. Include team and role in personnel searches for both bookings and leave; remove redundant precomputed pinyin labels from searchable text.
2. Use shared input binding for personnel and project pickers. Keep selected values unchanged by filtering and prevent composition keys from selecting options.
3. Retain group visibility, filtered select-all, keyboard navigation and empty results. Ensure clicking/focusing an input opens its options predictably.

### Task 4: Browser verification and delivery

**Files:** `e2e/pinyin-search.spec.js`.

1. Exercise multi-field queries, tabs/archive, booking/leave pickers, clear-to-reset and IME composition through real browser events.
2. Check lazy-load delay/failure/retry with browser routes and confirm existing Chinese matching works without the library.
3. Run `npm run test:search`, `npm test`, `npm run bundle:schedule`, `npm run build`, `npm run test:e2e`, and `git diff --check` sequentially where tests share ports.
4. Inspect the final diff and exclude temporary databases, reports and unrelated changes. Report validation and any remaining limitations.

## Completion

- Implemented the shared matcher, IME binding, management fields and booking/leave pickers; added native clear affordance to management searches and retained existing styling.
- `npm run test:search`: 34 name cases plus cross-field, plain-text fallback and input lifecycle assertions passed.
- `npm test`: search checks and 205 security/regression/email assertions passed.
- `npm run bundle:schedule`, `npm run build`, syntax checks and `git diff --check` passed.
- Full Playwright run: 40/40 passed, including 8 search scenarios and mobile layout verification.
- The first full run exposed repeated test logins exceeding the existing per-account limit. Search and resource-archive UI tests now restore the seeded real session; dedicated login tests still use the login form. No production authentication or rate-limit behavior changed.
