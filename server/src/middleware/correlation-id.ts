import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "../types";

export const correlationId = (): MiddlewareHandler<HonoEnv> => async (c, next) => {
  const incoming = c.req.header("x-correlation-id");
  const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  c.set("correlationId", id);
  c.header("x-correlation-id", id);
  await next();
};
