import { Hono } from "hono";
import { generateSignedCookie, getSignedCookie } from "hono/cookie";
import { baseName } from "@r2-manager/shared";
import type { HonoEnv } from "../types";
import { checkShareAccess, reserveDownload } from "../services/shares";
import { checkRateLimit, isRateLimited } from "../middleware/rate-limit";
import { renderPasswordPage, renderErrorPage } from "./password-page";
import {
  applyUntrustedContentHeaders,
  contentDisposition,
} from "../services/content-disposition";
import { clientIpFromForwardedFor } from "../services/client-ip";
import { readTextBodyWithLimit } from "../services/request-body";

const app = new Hono<HonoEnv>();
const TRANSFER_COOKIE = "r2_share_transfer";
const TRANSFER_TTL_SECONDS = 15 * 60;
const PASSWORD_FORM_MAX_BYTES = 1024;

// SHARE-06: no indexing, no caching, isolated from the management SPA.
app.use("*", async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Cache-Control", "no-store");
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:;",
  );
  c.header("X-Frame-Options", "DENY");
});

async function rangeFromHeader(
  header: string | undefined,
): Promise<{ start: number; end?: number } | undefined> {
  if (!header) return undefined;
  const match = /bytes=(\d+)-(\d*)/.exec(header);
  if (!match) return undefined;
  return {
    start: Number(match[1]),
    end: match[2] ? Number(match[2]) : undefined,
  };
}

function parseTransfer(
  value: string | undefined | false,
  shareId: string,
): boolean {
  if (!value) return false;
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  const [cookieShareId, transferId, expiresRaw] = parts;
  const expiresAt = Number(expiresRaw);
  return (
    cookieShareId === shareId &&
    !!transferId &&
    Number.isSafeInteger(expiresAt) &&
    expiresAt > Date.now()
  );
}

async function handleShareRequest(
  c: any,
  token: string,
  password: string | undefined,
) {
  const db = c.get("db");
  const storage = c.get("storage");
  const config = c.get("config");

  const ip = clientIpFromForwardedFor(
    c.req.header("x-forwarded-for"),
    config.env.TRUST_PROXY_HOPS,
  );
  const rl = await checkRateLimit(db, `share:${ip}`, {
    max: 30,
    windowSeconds: 60,
  });
  if (!rl.allowed)
    return c.html(
      renderErrorPage("Too many attempts. Please try again later."),
      429,
    );

  if (
    password !== undefined &&
    (await isRateLimited(db, `share-pw:${ip}`, {
      max: 10,
      windowSeconds: 300,
    }))
  ) {
    return c.html(
      renderErrorPage("Too many incorrect attempts. Please try again later."),
      429,
    );
  }

  const range = await rangeFromHeader(c.req.header("range"));
  const check = await checkShareAccess(db, token, password);
  const checkedShare = check.share;
  const signedTransfer = checkedShare
    ? await getSignedCookie(c, config.env.SESSION_SECRET, TRANSFER_COOKIE)
    : undefined;
  const continuingRange =
    !!range && !!checkedShare && parseTransfer(signedTransfer, checkedShare.id);
  if (!check.ok) {
    if (
      continuingRange &&
      (check.reason === "password_required" || check.reason === "exhausted")
    ) {
      // A valid signed cookie proves this range belongs to an already-authorized, already-reserved transfer.
    } else {
      if (check.reason === "password_required")
        return c.html(renderPasswordPage(token, false));
      if (check.reason === "invalid_password") {
        const pwRl = await checkRateLimit(db, `share-pw:${ip}`, {
          max: 10,
          windowSeconds: 300,
        });
        if (!pwRl.allowed)
          return c.html(
            renderErrorPage(
              "Too many incorrect attempts. Please try again later.",
            ),
            429,
          );
        return c.html(renderPasswordPage(token, true));
      }
      return c.html(renderErrorPage("This link is no longer available."), 404);
    }
  }

  const share = checkedShare!;

  if (share.deliveryMode === "redirect") {
    const transferId = await reserveDownload(db, share.id);
    if (!transferId)
      return c.html(
        renderErrorPage("This link has reached its download limit."),
        410,
      );
    const disposition = share.inlinePreview
      ? contentDisposition(baseName(share.key), "inline")
      : contentDisposition(baseName(share.key));
    const url = await storage.signGetUrl(share.bucket, share.key, 60, {
      responseContentDisposition: disposition,
    });
    return c.redirect(url, 302);
  }

  // Every new stream reserves a slot, including a first request that already carries Range.
  // Only a signed cookie from that reservation allows subsequent byte ranges to reuse it.
  let transferCookie: string | undefined;
  if (!continuingRange) {
    const transferId = await reserveDownload(db, share.id);
    if (!transferId)
      return c.html(
        renderErrorPage("This link has reached its download limit."),
        410,
      );
    const expiresAt = Date.now() + TRANSFER_TTL_SECONDS * 1000;
    transferCookie = await generateSignedCookie(
      TRANSFER_COOKIE,
      `${share.id}:${transferId}:${expiresAt}`,
      config.env.SESSION_SECRET,
      {
        httpOnly: true,
        secure: config.env.NODE_ENV === "production",
        sameSite: "Strict",
        path: `/s/${token}`,
        maxAge: TRANSFER_TTL_SECONDS,
      },
    );
  }

  const result = await storage.get(share.bucket, share.key, { range });
  if (!result)
    return c.html(renderErrorPage("This file is no longer available."), 404);

  const headers = new Headers();
  headers.set("content-type", result.contentType ?? "application/octet-stream");
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "no-store");
  headers.set(
    "content-disposition",
    contentDisposition(
      baseName(share.key),
      share.inlinePreview ? "inline" : "attachment",
    ),
  );
  applyUntrustedContentHeaders(headers);
  if (transferCookie) headers.append("set-cookie", transferCookie);
  if (result.range) {
    headers.set(
      "content-range",
      `bytes ${result.range.start}-${result.range.end}/${result.range.total}`,
    );
    headers.set(
      "content-length",
      String(result.range.end - result.range.start + 1),
    );
    return new Response(result.body, { status: 206, headers });
  }
  headers.set("content-length", String(result.size));
  return new Response(result.body, { status: 200, headers });
}

app.get("/:token", async (c) => {
  return handleShareRequest(c, c.req.param("token"), undefined);
});

app.post("/:token", async (c) => {
  const mediaType = c.req.header("content-type")?.split(";", 1)[0]?.trim();
  if (mediaType !== "application/x-www-form-urlencoded") {
    return c.html(renderErrorPage("Unsupported form submission."), 415);
  }
  const rawForm = await readTextBodyWithLimit(c.req.raw, PASSWORD_FORM_MAX_BYTES);
  const password = new URLSearchParams(rawForm).get("password") ?? undefined;
  if (password && password.length > 200) {
    return c.html(renderErrorPage("Invalid password."), 400);
  }
  return handleShareRequest(c, c.req.param("token"), password);
});

export default app;
