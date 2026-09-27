import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { HonoEnv } from "../types";

export interface AccessIdentity {
  email: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let jwksTeamDomain: string | undefined;

function getJwks(teamDomain: string) {
  if (!jwks || jwksTeamDomain !== teamDomain) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksTeamDomain = teamDomain;
  }
  return jwks;
}

/**
 * AUTH-01: validates the Cloudflare Access assertion (Cf-Access-Jwt-Assertion
 * header), checking signature, issuer, audience, and expiry.
 * Sets c.set("accessIdentity", ...) on success; does not itself deny requests
 * so auth-gate.ts can combine this with Basic Auth mode (AUTH-03).
 */
export const accessJwt = (): MiddlewareHandler<HonoEnv & { Variables: { accessIdentity?: AccessIdentity } }> => async (c, next) => {
  const { env } = c.get("config");
  const token = c.req.header("cf-access-jwt-assertion");

  if (token && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    try {
      const { payload } = await jwtVerify(token, getJwks(env.ACCESS_TEAM_DOMAIN), {
        issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
        audience: env.ACCESS_AUD,
      });
      const email = typeof payload.email === "string" ? payload.email : undefined;
      if (email) {
        c.set("accessIdentity", { email });
      }
    } catch {
      // Leave accessIdentity unset; auth-gate treats this as unauthenticated for Access mode.
    }
  }

  await next();
};
