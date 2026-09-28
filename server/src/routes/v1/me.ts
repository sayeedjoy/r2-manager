import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { HonoEnv } from "../../types";
import { users } from "../../db/schema";
import { isTwoFactorEnabled } from "../../services/auth";

const app = new Hono<HonoEnv>();

/**
 * AUTH-04: the signed-in user as authGate resolved it. The UI uses the role to
 * decide which navigation to show; every route still enforces its own
 * capability check, so this is presentation only. authMode tells the UI how to
 * sign out and whether to offer password and 2FA settings.
 */
app.get("/", async (c) => {
  const { id, identity, displayName, role } = c.get("user");
  const record = await c.var.db.query.users.findFirst({ where: eq(users.id, id) });
  return c.json({
    id,
    identity,
    displayName,
    role,
    authMode: c.get("config").env.AUTH_MODE,
    hasPassword: !!record?.passwordHash,
    twoFactorEnabled: record ? isTwoFactorEnabled(record) : false,
    recoveryCodesRemaining: record?.recoveryCodeHashes.length ?? 0,
  });
});

export default app;
