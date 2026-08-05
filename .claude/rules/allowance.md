---
paths:
  - "public/js/room/allowance.js"
  - "src/rooms/config.js"
  - "src/routes/rooms.js"
---

# Allowance system

The room config holds `allowanceEnabled` (which categories are active), `allowance`
(the filter values per category), and `allowanceCaps` (per-category per-value player
count caps).

The server normalizes cap values on write; the client enforces caps in
`getAllowanceCapViolation()` during pick selection.

**Both sides share the same normalization logic, duplicated between `src/rooms/config.js`
and `public/js/room/allowance.js`.** A change to one must be mirrored in the other.