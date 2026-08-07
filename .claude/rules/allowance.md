---
paths:
  - "public/js/features/draft/allowance.js"
  - "src/features/rooms/config.js"
  - "src/features/rooms/routes.js"
---

# Allowance system

The room config holds `allowanceEnabled` (which categories are active), `allowance`
(the filter values per category), and `allowanceCaps` (per-category per-value player
count caps).

The server normalizes cap values on write; the client enforces caps in
`getAllowanceCapViolation()` during pick selection.

**Both sides share the same normalization logic, duplicated between `src/features/rooms/config.js`
and `public/js/features/draft/allowance.js`.** A change to one must be mirrored in the other.