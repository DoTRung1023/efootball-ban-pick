# Decisions

The Phase 0 and Phase 1 artifacts from `.claude/skills/project-bootstrap`, written
after the fact. The project was built without them, so this records what was actually
decided (by the code, if not deliberately) rather than what an ideal day one would
have chosen. Where a decision was never made, it says so instead of inventing one.

`DESIGN.md` owns how it looks. `.claude/CLAUDE.md` owns how to work in it. This file
owns why it is shaped the way it is, and what is still open.

---

## The brief

The user is one of two people who play eFootball against each other regularly, own
large card collections, and have stopped enjoying their matches because both sides
simply field their strongest eleven and the game is decided before kickoff. They want
the squad-building itself to be the contest: each side bans players out of the
*opponent's* collection, then builds a 23-player squad from whatever survived, under
constraints the host sets. What they walk away with is a settled, agreed pair of
squads, revealed side by side at the same moment, that they then go and play the real
match with in eFootball. The app is not the game. It is the negotiation before it, and
its whole job is to make that negotiation fair, simultaneous, and impossible to cheat
by peeking.

## The single hardest thing

**Keeping two browsers in agreement about one draft that exists only in server memory,
over polling, with no WebSocket layer.**

Everything else in the product is CRUD with a good interface: the player catalog, the
squad, the saved game plans, the admin console. They are work, but they are not hard.

The draft is hard because every part of it fights the others. Room state lives in a
process-memory `Map` and does not survive a restart. Liveness is inferred from a 500 ms
presence heartbeat, so "connected", "tabbed away", "reconnecting" and "gone" are
guesses made from timestamps rather than facts from a socket. Both sides may be acting
at the same instant in simultaneous mode, and strictly alternately in the other. And
the reveal modes mean the two clients are deliberately shown *different* views of the
same state, so "just send both clients everything" is not available as an escape hatch.

This is why the server owns every status transition and the client only ever compares
against what it is told, and why the turn schedule is computed server-side and
published on the snapshot instead of being derived twice. The five heaviest rule files
in `.claude/rules/room/` are all about this one problem.

---

## Phase 1 decisions

### 1. Identity and ownership — **DECIDED AND ENFORCED**

There are real accounts: `users` in MySQL, bcrypt password hashes, and email
confirmation through the `mail` feature.

**Authorisation used to be missing entirely**, and that is worth keeping in the record
because it shaped the code that is here. `userId` arrived in a query string or a request
body and was trusted — `requireUserIdQuery` checked that an id was *present*, never that
it was *yours* — so changing one number in a URL read and wrote anybody's squad, game
plans and profile, and sending the other seat's id read a concealed draft board.

It is now a signed httpOnly cookie, minted by `src/features/auth/session.js` and
installed app-wide as `attachIdentity` in the composition root. Three rules:

  1. **Every route takes the caller from `req.userId` / `req.identityId`.** A `userId`
     in a query string or a body is ignored wherever it still arrives.
  2. **A room seat belongs to a cookie**, account or not. A signed-out player gets a
     server-minted `efb_visitor` id rather than choosing one in localStorage, because a
     snapshot carries both seats' ids and a self-asserted id is a seat anybody can take.
  3. **`/api/my-players` serves your squad only.** The ban phase needs the *opponent's*,
     which is a room's question: `GET /api/rooms/:code/opponent-squad` answers it for
     whoever holds the other chair.

Stateless, like the console token beside it: no sessions table, survives a restart, and
cannot be revoked before `SESSION_TTL_MS`. `SESSION_SECRET` is what keeps sign-ins alive
across a deploy.

What is **not** closed: nothing rate-limits or audits an authenticated user, and the
console's shared-password mode still has no identity of its own beyond the account it is
opened for.

### 2. Persistence and hosting — **UNRESOLVED**

MySQL 8 via `mysql2`, running locally. There is no host, no deploy configuration and
no deployed environment. The app has never run anywhere but a developer machine.

The skill would have deployed an empty app on day one and preferred managed Postgres,
so dev and prod share a dialect. Neither happened. The dialect risk is real but not yet
paid: nothing in the schema is MySQL-only in an interesting way, so a move is still
cheap. It gets more expensive every month.

CI runs the static gate only. There is no deploy step because there is nothing to
deploy to.

### 3. External paid dependencies — **PARTIALLY DECIDED**

| Dependency | Key is server-side | Cost per interaction | What stops abuse |
| --- | --- | --- | --- |
| pesdb.net scrape | n/a, public site | none, but it is someone else's bandwidth | run by hand or from the console; never on a user path |
| Cloudflare R2 (`@aws-sdk/client-s3`) | yes | storage + egress per card image | cached by player id; falls back to redirecting at pesdb when unconfigured |
| SMTP (`nodemailer`) | yes | per message | resend endpoint is throttled; unset `SMTP_HOST` prints to the log instead |

Every external call already goes through our own route handler and caches into our own
storage, which is the shape the skill asks for.

**The gap was rate limiting**, which the skill calls out specifically: a metered API
behind a public endpoint with no limit is a liability. `/api/signin` and `/api/signup`
had nothing in front of them, and neither did the catalog queries. This is now closed
by `src/lib/rateLimit.js`; see `.claude/rules/backend.md`.

The presence heartbeat is the awkward case and is deliberately exempted rather than
tuned: it is a 500 ms poll by design, so any limit low enough to be meaningful would
break the draft.

### 4. Where the hard thing lives — **DECIDED, AND IT HELD**

The draft core is close to pure already, which is the main reason it can be reasoned
about at all:

- `features/rooms/store.js` is the in-memory state and its helpers. No database.
- `features/rooms/schedule.js` derives the turn schedule from config. Pure.
- `features/rooms/turns.js` moves a room through that schedule. Pure.
- `features/rooms/squads.js` is the **only** place a room touches the database.

That last line is the interface the skill asks for, enforced by convention and now by
the `boundaries` check. There is no fake implementation of it, which is the one piece
missing: a fake squad source would let the draft be exercised without a populated
catalog.

### 5. The output artifact — **DECIDED**

Two artifacts, and neither is a file.

The first is the **invite link / room code**, which is what one player hands the other
to start. The second, and the real one, is the **Start Match screen**: both squads
revealed side by side, on two pitches, at the same instant. That simultaneity is the
product. It is why the reveal modes exist and why the handshake is a server-owned
status transition rather than a client saying "ready".

There is deliberately no export. A CSV export existed and was removed: the artifact is
a shared moment between two people who are about to play a match, not a file either of
them keeps.

### 6. Design direction — **DECIDED**

`DESIGN.md` is the source of truth and is unusually complete: palette with a single
volt-green accent used once per screen, a neutral ladder with measured contrast, type
scale, radius and spacing ladders, motion policy, and an explicit list of what the
re-skin removed so a leftover reads as a leftover.

The direction, stated as a direction rather than an adjective: **a broadcast graphics
package for a match, not a dashboard.** Flat near-black, one accent, no gradients,
glows, shadows or backdrop blur.

Icons are a sprite (`public/icons/sprite.svg`) and no emoji or typographic mark stands
in for one. See `DESIGN.md` §5a.

---

## Copy rules

The skill bans em-dashes and en-dashes in copy. That is applied to **product copy** —
the sentences a user reads in the interface. It is not applied to:

- **numeric ranges** (`5–900 seconds`), where the en dash is the correct character
- **empty-state placeholders** (`—` standing in for a value not yet known)
- **source comments and these documents**, which are written for developers

Errors say what happened, then what to do about it, in that order.

---

## Still open, in the order to do them

Phase 4 of the skill asks for sprints that each end in something a real person can use.
The project is past a greenfield roadmap, so this is the remaining work ordered the same
way rather than an invented plan.

**The ordering is not arbitrary, and one dependency in it matters more than the rest:
authorisation has to be closed *before* the app is deployed, not after.** Today the
`userId` hole is reachable only by someone already on the developer's machine. A deploy
turns it into a hole any stranger can reach, and the accounts it exposes have real
password hashes and email addresses behind them. Deploying first would be the single
most damaging order to do these in.

1. ~~**Close authorisation** (§1).~~ Done — signed session cookie, identity from the
   cookie on every route, room seats included.
   An opaque token in an httpOnly cookie, checked by middleware, with the user id read
   from the token and never from the request. The accounts already exist to hang it on.
2. **Deploy** (§2). Ships: *the product*. This is not hardening or polish. The whole
   premise is two people drafting against each other, and today they have to share a
   machine to do it. Nothing else on this list changes what the app is worth as much.
   Do the Postgres question here, while the schema is still small.
3. **Survive a restart** (§4 note). Ships: a deploy that does not end everyone's draft.
   Once step 2 exists, shipping a change mid-session kills live rooms. In-memory state
   was a fair trade on localhost; it stops being one the day a deploy is a real event.
4. **A fake squad source** (§4). Ships: the draft, exercisable without a populated
   catalog, which is what makes the hard part testable.

Steps 1 and 2 are the two that change whether this is a project or a product. Steps 3
and 4 are what make it survivable to work on.
