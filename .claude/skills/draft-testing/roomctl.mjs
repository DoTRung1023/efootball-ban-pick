#!/usr/bin/env node
/* ============================================================
   roomctl — drive a room to a draft phase over the HTTP API

   Room state is in-memory and there is no create-room endpoint: a room exists
   as soon as somebody posts presence for its code. So the whole draft can be
   driven with fetch, which beats clicking two browsers through a ban phase
   every time you need to look at the pick board.

     node .claude/skills/draft-testing/roomctl.mjs pick
     node .claude/skills/draft-testing/roomctl.mjs ready --code ABC234 --picks 11
     node .claude/skills/draft-testing/roomctl.mjs status --code ABC234

   Phases, in order: lobby → ban → pick → ready → done.
   `status` prints an existing room instead of driving one.
   ============================================================ */

const PHASES = ["lobby", "ban", "pick", "ready", "done"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const argv = process.argv.slice(2);
const target = (argv[0] || "pick").toLowerCase();

function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const flag = (name) => argv.includes(`--${name}`);

const BASE     = opt("base", "http://localhost:3000").replace(/\/$/, "");
const CODE     = (opt("code", Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * 32)]).join(""))).toUpperCase();
/* A seat belongs to whoever's cookie claimed it — the server reads identity
   from `efb_visitor` (or a signed-in `efb_session`) and ignores any id in the
   body, which is what stops one player acting as the other. So the harness
   holds two cookies rather than sending two ids, and they are fixed strings so
   a browser can adopt one: see the handover printed at the end.

   They must look like a server-minted visitor id (`anon-` + 6–64 of
   [A-Za-z0-9_-]) or `attachIdentity` discards them and mints its own. */
const HOST_ID  = opt("host-id", "anon-harness-host");
const GUEST_ID = opt("guest-id", "anon-harness-guest");
const BANS     = Number(opt("bans", 3));
const PICKS    = Number(opt("picks", 11));
const BAN_CAP  = opt("ban-count", null);

/** `as` is the identity cookie to send — one of HOST_ID / GUEST_ID, or none
    for the reads that do not need a seat. */
async function api(path, body, as) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (as) headers.Cookie = `efb_visitor=${as}`;
  const res = await fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    throw new Error(`${res.status} ${path} — ${json?.error ?? "(no body)"}`);
  }
  return json;
}

/** Real catalog rows make the boards render like the real thing; synthetic ids
    keep the harness working when MySQL is down. */
async function fetchPlayers(n) {
  try {
    const data = await api(`/api/players?limit=${n}&sortBy=overall_desc`);
    const rows = data?.players ?? [];
    if (rows.length >= n) {
      return rows.map((p) => ({
        id: String(p.pesdb_id ?? p.id),
        name: p.name,
        position: p.position,
        club: p.club,
        overall: p.overall,
        overall_max: p.overall_max,
        card_type: p.card_type,
      }));
    }
    console.warn(`  ! catalog returned ${rows.length}/${n} rows — padding with synthetic players`);
    return [
      ...rows.map((p) => ({ id: String(p.pesdb_id ?? p.id), name: p.name, position: p.position, overall: p.overall })),
      ...Array.from({ length: n - rows.length }, (_, i) => ({ id: `synthetic-${i}`, name: `Test Player ${i + 1}`, position: "CF", overall: 80 })),
    ];
  } catch (err) {
    console.warn(`  ! /api/players failed (${err.message}) — using synthetic players`);
    return Array.from({ length: n }, (_, i) => ({ id: `synthetic-${i}`, name: `Test Player ${i + 1}`, position: "CF", overall: 80 }));
  }
}

const step = (msg) => console.log(`  · ${msg}`);

function printRoom(room) {
  /* Mirrors roomPhase() in src/features/rooms/store.js — "await-ready" is the
     status, "ready" is what the client and the rules call that phase. */
  const phase = room?.status === "drafting"
    ? (Number(room.turnIndex) === 1 ? "pick" : "ban")
    : room?.status === "await-ready" ? "ready" : room?.status;
  console.log(`\n  status=${room?.status}  turnIndex=${room?.turnIndex ?? "-"}  → phase: ${phase}`);
  console.log(`  host=${room?.host?.username ?? "-"}(${room?.host?.id ?? "-"})  guest=${room?.guest?.username ?? "-"}(${room?.guest?.id ?? "-"})`);
  console.log(`  bans: host=${room?.bans?.host?.length ?? 0} guest=${room?.bans?.guest?.length ?? 0}` +
              `   picks: host=${room?.picks?.host?.filter(Boolean).length ?? 0} guest=${room?.picks?.guest?.filter(Boolean).length ?? 0}` +
              `   matchReady: host=${!!room?.matchReady?.host} guest=${!!room?.matchReady?.guest}`);
}

async function presence(role, id, username, hidden = false) {
  return api(`/api/rooms/${CODE}/presence`, { role, username, hidden }, id);
}

async function main() {
  if (target === "status") {
    const room = await api(`/api/rooms/${CODE}`);
    printRoom(room.room ?? room);
    return;
  }

  const goal = PHASES.indexOf(target);
  if (goal < 0) {
    console.error(`unknown phase "${target}" — expected one of: ${PHASES.join(", ")}, status`);
    process.exit(2);
  }

  console.log(`\n▶ Driving room ${CODE} to "${target}" via ${BASE}\n`);

  step("host presence");
  await presence("host", HOST_ID, "HarnessHost");
  step("guest presence");
  await presence("guest", GUEST_ID, "HarnessGuest");

  if (BAN_CAP != null) {
    step(`config banCountPerSide=${BAN_CAP}`);
    await api(`/api/rooms/${CODE}/config`, { banCountPerSide: Number(BAN_CAP) }, HOST_ID);
  }

  let room = null;
  if (goal >= PHASES.indexOf("ban")) {
    step("guest ready");
    await api(`/api/rooms/${CODE}/ready`, { ready: true }, GUEST_ID);
    step("host starts draft");
    room = await api(`/api/rooms/${CODE}/start`, {}, HOST_ID);
  }

  if (goal >= PHASES.indexOf("pick")) {
    const pool = await fetchPlayers(Math.max(BANS, 1));
    step(`${BANS} bans per side`);
    for (const side of [[HOST_ID, "host"], [GUEST_ID, "guest"]]) {
      for (let i = 0; i < BANS; i++) {
        await api(`/api/rooms/${CODE}/ban`, { player: pool[i % pool.length] }, side[0]);
      }
    }
    step("both sides confirm bans → pick phase");
    await api(`/api/rooms/${CODE}/ban-confirm`, { confirmed: true }, HOST_ID);
    room = await api(`/api/rooms/${CODE}/ban-confirm`, { confirmed: true }, GUEST_ID);
  }

  if (goal >= PHASES.indexOf("ready")) {
    const squad = await fetchPlayers(PICKS);
    step(`${PICKS} picks per side (slot-addressed)`);
    await api(`/api/rooms/${CODE}/picks`, { players: squad }, HOST_ID);
    await api(`/api/rooms/${CODE}/picks`, { players: squad }, GUEST_ID);
    step("both sides confirm picks → await-ready");
    await api(`/api/rooms/${CODE}/picks-confirm`, { confirmed: true, formation: "4-3-3" }, HOST_ID);
    room = await api(`/api/rooms/${CODE}/picks-confirm`, { confirmed: true, formation: "4-3-3" }, GUEST_ID);
  }

  if (goal >= PHASES.indexOf("done")) {
    /* Three handshakes, not one, and each is only answerable in its own status:
       await-ready →(ready)→ await-start →(start)→ live →(finish)→ done. This
       used to post a single `/match-ready`, which stopped existing when the
       sequence replaced it — the route 404'd and `done` never reached done. */
    for (const name of ["ready", "start", "finish"]) {
      step(`both sides ${name}`);
      await api(`/api/rooms/${CODE}/match-step`, { step: name, value: true }, HOST_ID);
      room = await api(`/api/rooms/${CODE}/match-step`, { step: name, value: true }, GUEST_ID);
    }
  }

  printRoom((room ?? await api(`/api/rooms/${CODE}`))?.room ?? room);

  if (!flag("quiet")) {
    console.log(`\n  Open as HOST:   ${BASE}/room/${CODE}`);
    console.log(`  Open as GUEST:  ${BASE}/room/${CODE}?mode=join`);
    console.log(`\n  A seat belongs to a cookie now. Sign out first (a session cookie wins over`);
    console.log(`  this one), then run in that tab's console BEFORE loading the room:`);
    console.log(`    document.cookie = "efb_visitor=${HOST_ID}; path=/"    // host`);
    console.log(`    document.cookie = "efb_visitor=${GUEST_ID}; path=/"   // guest`);
    console.log(`  To play a seat as your own account instead, just sign in and open the room —`);
    console.log(`  claim that side yourself and let the harness drive the other one.`);
    console.log(`\n  Re-inspect:  node .claude/skills/draft-testing/roomctl.mjs status --code ${CODE}\n`);
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}\n`);
  process.exit(1);
});
