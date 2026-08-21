---
paths:
  - "public/signin.html"
  - "src/features/mail/**/*.js"
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

## An account is unusable until its address is confirmed

Sign-up creates the user with `users.email_verified = 0` and mails a link;
`/api/signin` answers **403 `{ needsVerification: true }`** to a correct password on an
unconfirmed account. The reason is the console: a master's password reset generates a
password and emails it to `users.email`, so an address nobody proved is a way to have
somebody else's reset delivered to you.

| Route | What it does |
| --- | --- |
| `POST /api/signup` | creates the account, then mails the link. **201 either way** — the account exists before the mail is attempted, so a send that fails leaves something to resend to rather than a live token pointing at no user |
| `GET /verify-email?token=…` | spends the token and **redirects to `/signin?verified=<status>`**. Registered on `app` in `server.js`, not under `/api`, because a person clicks it in a mail client |
| `POST /api/verify-email/resend` | **always 200**, whatever it finds. It is public and takes a bare username-or-email, so a truthful answer would be an oracle for which addresses are registered. This is the only caller that throttles (60 s) |
| `PUT /api/profile` | a changed email sets `email_verified = 0` and mails a new link. The account keeps working until the next sign-in, which is where the block bites |

`verification.js` owns the table and the rules; the five statuses it returns
(`ok · already · expired · stale · invalid`) are the `?verified=` values, and
`verifyNotice.js` maps every one of them to a message. **Adding a status means adding it
in both places** — the client falls back to the `error` wording for anything it does not
know.

Three properties worth not breaking: only the SHA-256 of the token is stored (the token
lives in the email and nowhere else); a spent row is marked `consumed_at` rather than
deleted, so a second click reads as "already confirmed" instead of as a broken link; and
a token is dead once the account's email changes, or an old link would confirm an
address its owner never agreed to.

**Accounts that predate the feature are backfilled as verified**, once, in the same boot
that adds the column — and the `.env` admin is seeded verified on every boot, because
`admin@localhost` has no inbox to click a link in.

## Frontend (`public/js/features/auth/`)

| Module | Role |
| --- | --- |
| `signInForm.js` | `/api/signin`, field validation, writes `efb_user`. A 403 with `needsVerification` raises the strip below instead of only toasting |
| `signUpModal.js` | `/api/signup`. Creating an account does **not** sign you in — and now cannot until the link is clicked |
| `verifyNotice.js` | the "confirm your email" strip under the form: `showVerifyNotice`, `applyVerifyStatus` (the `?verified=` verdict) and the RESEND button. It remembers whichever identifier got you there and falls back to whatever is typed in `#username` |
| `signInBackdrop.js` | Floating card art + particles. Purely decorative |
| `passwordToggle.js` | `bindPasswordToggle(btnId, inputId)` — the eye-icon swap, used by both forms |
| `editProfile.js` | `/api/profile` (PUT). An empty password field means "leave it alone" |
| `userMenu.js` | Nav account dropdown: identity, sign out, opens edit-profile, reveals the console link for an admin |
| `index.js` | Barrel — exports **only** `initUserMenu` + the edit-profile functions |

The **server** barrel (`#features/auth/index.js`) additionally exports `PASSWORD_MIN`,
so the admin seeder enforces the same minimum as sign-up instead of keeping its own copy;
`ensureAuthSchema` and `verifyEmailPage`, both wired in `server.js`; and
`generatePassword`, which the seeder and the console's password reset share — its
alphabet has no `0/O/1/I/l` because both of them are read off a screen and typed back in.

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
