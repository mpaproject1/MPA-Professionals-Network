# Workstream 4 — Current screen tours and contextual help

## Reconciliation with Ask MPA support
The floating Ask MPA assistant remains the conversational help and human-follow-up channel. The screen tour is a separate, short visual orientation. The Guide launcher is positioned on the opposite side of the viewport from the support assistant; the tour layer sits above the assistant, and starting a tour closes an open assistant panel without disabling the assistant.

The tour is deliberately non-modal. Its overlay does not intercept page clicks, so forms, navigation and other critical controls remain usable. The spotlight is a visual outline only. The tour card itself remains interactive.

## Current guide inventory
Migration `20261030160000_workstream_4_contextual_screen_tours.sql` disables older tours whose route/selector combinations have not been validated against the current interface. It upserts four audited guides:
- Global navigation: brand, visible navigation and guide restart control.
- `/members`: current workspace summary, progress, shortcuts and help area.
- `/membership`: membership status, application/plan area and restart control.
- `/membership/payment`: payment overview, application selection and configured submission control.

Targets use stable `data-guide-target` attributes rather than generated IDs, old labels or layout positions. Desktop and mobile navigation share a semantic target; the tour selects the visible instance.

## Interaction and accessibility
- Progress is announced as “Step N of M”.
- Back, Next, Skip, Finish and Close tour are keyboard-operable buttons.
- Escape closes the tour; focus returns to the Guide launcher.
- The tour uses a non-modal dialog because it must not trap focus or block the underlying form.
- The target is scrolled into view before the outline is positioned.
- If a selector is missing or hidden in the current responsive state, the guide displays an accessible explanatory message instead of an empty spotlight.
- The workspace footer offers “Show me around”; membership and payment screens expose contextual guide actions.
- The Guide launcher is separated from Ask MPA on desktop and mobile. Opening a tour closes the currently open support panel; the support assistant remains available afterward.

## Validation added
- `test/platform/ui-guide.test.js` checks accessible controls, non-blocking layering, current semantic targets and the guide migration.
- `e2e/ui-guide-tour.spec.js` checks progress, Back/Next/Skip/Finish, restart, navigation while a tour is open, support assistant reconciliation, and the mobile missing-target explanation.

The migration is additive and changes only guide records. It does not alter membership, payment, authorization, form submission or support conversation data.
