/**
 * Outgoing mail — one SMTP transport, or the server log.
 *
 * Two things send mail: the address-confirmation link at sign-up, and the
 * password a master admin resets from the console. Both are useless if they
 * silently go nowhere, so this module has exactly one rule: **`sendMail` either
 * delivers or throws.** A caller that has not yet written anything to the
 * database can then send first and commit afterwards, which is why a failed
 * reset leaves the old password working rather than a user locked out with a
 * password nobody can read.
 *
 * `SMTP_HOST` decides which mode this is:
 *
 *   - **set** → a real nodemailer transport, created once and reused. Port 465
 *     is implicitly TLS-on-connect; anything else (587, 25) starts plain and
 *     upgrades with STARTTLS, which is what `secure: false` means in nodemailer
 *     and is not the same thing as "unencrypted".
 *   - **unset** → the message is printed to the server log and reported as
 *     `delivered: false`. This is a real mode, not a stub: it is how the whole
 *     flow is exercised on a dev machine with no mail account, and every caller
 *     tells the user which of the two happened rather than claiming an email is
 *     on its way.
 *
 * Bodies are plain text. Nothing here needs a layout, and text survives every
 * client, filter and terminal that an HTML mail has to be re-tested against.
 */

import nodemailer from "nodemailer";
import { describeError } from "#lib/http.js";

/* Built on first use and kept — a transport pools connections, and rebuilding
   it per message reopens the SMTP handshake every time. */
let transport;

const TLS_ONLY_PORT = 465;
/* Nodemailer waits two minutes for a TCP connection by default, and a blocked
   port is exactly the case that runs it out: Render blocks outbound 25, 465 and
   587 on free web services, so the socket is never refused, it just never
   answers. Two minutes of that is a sign-up form that appears to have hung
   before it reports the failure. Ten seconds is far longer than a reachable
   relay needs and short enough that the error arrives while somebody is still
   looking at the page. */
const CONNECT_TIMEOUT_MS = 10_000;

/** Whether real mail is configured. The console and the sign-in page both say
    so out loud when it is not, rather than reporting a delivery that was a
    `console.log`. */
export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

/** What the recipient sees in the From line. Falls back to the SMTP account,
    because most providers reject a From they do not own anyway. */
function fromAddress() {
  return process.env.MAIL_FROM || process.env.SMTP_USER || "no-reply@localhost";
}

function getTransport() {
  if (transport) return transport;

  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === TLS_ONLY_PORT,
    /* An open relay on a LAN has no credentials to send, and passing empty
       strings makes nodemailer attempt AUTH with them and get refused. */
    auth: user || pass ? { user, pass } : undefined,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
  });
  return transport;
}

/**
 * Sends one message, or throws with a reason the caller can show.
 *
 * Returns `{ delivered }` — `false` means the message went to the log because
 * no SMTP host is configured. It never means "sent, probably".
 */
export async function sendMail({ to, subject, text }) {
  if (!mailConfigured()) {
    console.log(
      [
        "",
        "──────── EMAIL (not sent — SMTP_HOST is unset) ────────",
        `to:      ${to}`,
        `subject: ${subject}`,
        "",
        text,
        "───────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return { delivered: false };
  }

  try {
    await getTransport().sendMail({ from: fromAddress(), to, subject, text });
    return { delivered: true };
  } catch (err) {
    console.error("mail send failed:", describeError(err));
    throw new Error("Could not send the email. Check the server's SMTP settings.");
  }
}
