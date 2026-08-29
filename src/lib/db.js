import mysql from "mysql2/promise";

/**
 * TLS to the database.
 *
 * A local socket has none to offer and needs none. Every managed MySQL
 * requires it, so a pool without this option cannot connect to one at all —
 * which is what stood between this app and any hosted database.
 *
 * `DB_SSL` is an explicit switch rather than something inferred from the host,
 * because "the host is not localhost" is a different question and answers this
 * one wrongly on a LAN. `DB_CA` carries the provider's own root where there is
 * one — Aiven ships a `ca.pem`, paste it in whole; TiDB Cloud and most others
 * present a publicly-signed certificate and need nothing here.
 *
 * What is deliberately absent is `rejectUnauthorized: false`. It is the first
 * thing suggested for a certificate error and it keeps the handshake while
 * throwing away the only thing the handshake proves, so an intercepted
 * connection then looks exactly like a working one.
 */
function sslOptions() {
  if (!process.env.DB_SSL) return undefined;
  const ca = process.env.DB_CA;
  return { minVersion: "TLSv1.2", rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}

const pool = mysql.createPool({
  host:     process.env.DB_HOST     ?? "localhost",
  port:     Number(process.env.DB_PORT ?? 3306),
  user:     process.env.DB_USER     ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME     ?? "ban_pick_efb",
  ssl:      sslOptions(),
  waitForConnections: true,
  connectionLimit:    10,
  decimalNumbers:     true,
});

export default pool;
