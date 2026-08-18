---
paths:
  - "public/signin.html"
  - "public/js/pages/signin.js"
  - "public/js/features/auth/**/*.js"
  - "public/js/shared/lib/session.js"
  - "src/features/auth/**/*.js"
---

# Auth

## The session is one localStorage key

`efb_user` holds the whole signed-in identity. `signInForm.js` writes it, every other
page reads it back through `@/shared/lib/session.js` (`getUser`, `requireAuth`), and
`userMenu.js` removes it on sign out. There is no cookie, no token and no server-side
session — an API call that needs the caller's identity takes a `userId` in the body or
the query string.

`requireAuth()` redirects to `/signin` and returns `null`; callers must bail on `null`
rather than continuing with an undefined user.

The stored object carries `isAdmin`, which `initUserMenu` uses to reveal the **Admin
Console** link in the account dropdown. Nothing is signed here, so that flag is a
display hint and never an authorisation: `/console` re-checks `users.is_admin` and the
password server-side before it issues a session. See `admin-dashboard.md`. Anything
that rewrites `efb_user` must merge rather than replace — `editProfile.js` spreads the
old object precisely so the flag survives a profile save.

## Frontend (`public/js/features/auth/`)

| Module | Role |
| --- | --- |
| `signInForm.js` | `/api/signin`, field validation, writes `efb_user` |
| `signUpModal.js` | `/api/signup`. Creating an account does **not** sign you in |
| `signInBackdrop.js` | Floating card art + particles. Purely decorative |
| `passwordToggle.js` | `bindPasswordToggle(btnId, inputId)` — the eye-icon swap, used by both forms |
| `editProfile.js` | `/api/profile` (PUT). An empty password field means "leave it alone" |
| `userMenu.js` | Nav account dropdown: identity, sign out, opens edit-profile, reveals the console link for an admin |
| `index.js` | Barrel — exports **only** `initUserMenu` + the edit-profile functions |

The barrel deliberately does not re-export the sign-in page's own modules. There is no
bundler, so every name a barrel re-exports is a module the browser fetches on every page
that imports it; the home page has no use for the sign-up modal.

`public/js/pages/signin.js` is the page entry and is `type="module"`. It was a classic script
until the feature restructure — the conversion is safe because the page's only inline
handler (`onerror` on the logo) touches `this` and never a global from the script.
Module scripts are deferred, so the `DOMContentLoaded` listener is registered before the
event fires.

## Server-side field errors

`/api/profile` and `/api/signup` answer a rejected field with `{ field, error }`. The
client maps `field` to `ep<Field>Err` / the matching input id and renders the message
inline; anything without a `field` falls back to a toast. Keep the server's `field`
values matching the input id suffixes or the message silently becomes a toast.
