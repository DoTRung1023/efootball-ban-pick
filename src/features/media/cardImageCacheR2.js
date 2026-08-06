import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

const UPSTREAM_BASE = "https://pesdb.net/assets/img/card";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "KHTML, like Gecko Chrome/124.0.0.0 Safari/537.36";

function trimTrailingSlash(s) {
  return String(s ?? "").replace(/\/+$/, "");
}

function makeR2ClientFromEnv() {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) return { ok: false, reason: "R2_BUCKET not set" };

  const region = process.env.R2_REGION || "auto";
  const endpoint = process.env.R2_ENDPOINT || undefined; // required for R2

  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    return { ok: false, reason: "R2 credentials not set (R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY)" };
  }

  const forcePathStyle = String(process.env.R2_FORCE_PATH_STYLE ?? "")
    .toLowerCase() === "true";

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { ok: true, client, bucket };
}

function isNotFound(err) {
  const code = err?.name || err?.Code || err?.code;
  const meta = err?.$metadata?.httpStatusCode;
  return code === "NotFound" || code === "NoSuchKey" || meta === 404;
}

async function fetchUpstreamPngBuffer(pesdbId) {
  const url = `${UPSTREAM_BASE}/f${pesdbId}.png`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function streamBodyToRes(body, res) {
  if (body == null) return res.status(404).end();
  if (Buffer.isBuffer(body)) return res.end(body);
  if (body instanceof Readable) return body.pipe(res);
  if (typeof body.transformToWebStream === "function") {
    return Readable.fromWeb(body.transformToWebStream()).pipe(res);
  }
  return res.end(body);
}

/**
 * Express handler: caches pesdb card images into Cloudflare R2 (S3-compatible).
 *
 * Env:
 * - R2_BUCKET (required)
 * - R2_REGION (default "auto")
 * - R2_ENDPOINT (required for R2)
 * - R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY (required)
 * - R2_PUBLIC_BASE_URL (optional): if set, redirect to `${base}/${key}` once cached
 * - R2_FORCE_PATH_STYLE=true (optional)
 */
export async function handleCardImage(req, res) {
  const id = String(req.params.id ?? "").trim();
  if (!/^\d{5,20}$/.test(id)) return res.status(400).send("Invalid id");

  const r2 = makeR2ClientFromEnv();
  const upstreamUrl = `${UPSTREAM_BASE}/f${id}.png`;
  if (!r2.ok) return res.redirect(302, upstreamUrl);

  const key = `cards/f${id}.png`;
  const publicBase = process.env.R2_PUBLIC_BASE_URL
    ? trimTrailingSlash(process.env.R2_PUBLIC_BASE_URL)
    : null;

  try {
    try {
      await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }));
      if (publicBase) return res.redirect(302, `${publicBase}/${key}`);

      const obj = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
      res.setHeader("Content-Type", obj.ContentType || "image/png");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return streamBodyToRes(obj.Body, res);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }

    const buf = await fetchUpstreamPngBuffer(id);
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: buf,
        ContentType: "image/png",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    if (publicBase) return res.redirect(302, `${publicBase}/${key}`);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.end(buf);
  } catch (err) {
    console.error("card image cache error:", err?.message || err);
    return res.redirect(302, upstreamUrl);
  }
}

