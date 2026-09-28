import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { HonoEnv } from "../types";
import { users } from "../db/schema";
import type { AccessIdentity } from "./access-jwt";
import { BASIC_AUTH_CHALLENGE } from "./basic-auth";

type Vars = { accessIdentity?: AccessIdentity; basicAuthOk?: boolean };

/**
 * AUTH-03: combines Access and Basic Auth modes per configuration. Both must
 * pass when AUTH_MODE is "both"; an unconfigured mode always denies (config.ts
 * refuses to boot without at least one mode set up).
 * Resolves the authenticated identity to a users row and sets c.set("user").
 */
export const authGate = (): MiddlewareHandler<HonoEnv & { Variables: Vars }> => async (c, next) => {
  const { env } = c.get("config");
  const mode = env.AUTH_MODE;

  let identity: string | undefined;

  if (mode === "access") {
    identity = c.get("accessIdentity")?.email;
  } else if (mode === "basic") {
    identity = c.get("basicAuthOk") ? (env.BASIC_AUTH_USERNAME ?? undefined) : undefined;
  } else {
    // both: require Access identity AND a passing Basic Auth check
    const accessOk = !!c.get("accessIdentity");
    const basicOk = !!c.get("basicAuthOk");
    identity = accessOk && basicOk ? c.get("accessIdentity")!.email : undefined;
  }

  if (!identity) {
    if (mode === "basic" || mode === "both") {
      c.header("WWW-Authenticate", BASIC_AUTH_CHALLENGE);
    }
    throw new HTTPException(401, { message: "Authentication required" });
  }

  const db = c.get("db");
  const record = await db.query.users.findFirst({ where: eq(users.identity, identity) });

  if (!record || record.status !== "active") {
    throw new HTTPException(403, { message: "No active account for this identity" });
  }

  c.set("user", {
    id: record.id,
    identity: record.identity,
    displayName: record.displayName,
    role: record.role,
  });

  await next();
};
