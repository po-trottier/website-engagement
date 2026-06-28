# Admin RSVP Party Field Design

**Date:** 2026-06-27
**Status:** Approved

## Goal

Add a Party assignment to every RSVP so admins can classify attending guests as Athena's or P-O's side and see each side's attending headcount.

## Data model

- Store `party` as exactly `""`, `"Athena"`, or `"P-O"`.
- Display the empty value as `---`.
- Existing records without `party` are treated as empty; no data migration is needed.
- Public RSVPs and admin-created rows default to empty. The public endpoint ignores any submitted Party value.
- Admin create/update rejects any other Party value with HTTP 400.

## Admin UI

- Add a sortable Party column next to Name using a native select with `---`, `Athena`, and `P-O`.
- Reuse the existing write-mode behavior: the select is disabled for read-only sessions and editable for write sessions.
- Include Party in CSV export and expanded mobile cards.
- Add `Athena Guests` and `P-O Guests` summary cards. Each card sums `1 + plusOnes` only for attending RSVPs assigned to that Party. Declined and unassigned RSVPs contribute zero.
- Once every attending RSVP is assigned, the two Party cards equal Total Guests.

## Authorization

The existing server-authoritative gate remains the sole write boundary: only `ADMIN_WRITE_PASSWORD` can call create or update. `ADMIN_PASSWORD` receives HTTP 403 before field validation or storage access. No Party-specific endpoint or permission layer is added.

## Verification

- Extend the dependency-free handler tests to prove invalid Party values receive HTTP 400 and read-only Party updates receive HTTP 403.
- Run all Node tests and syntax checks.
- After deployment, verify in a real browser that read-only Party selects are disabled, write Party selects are enabled, defaults show `---`, and the summary cards use attending headcount including +1s without changing RSVP data.
