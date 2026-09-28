import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigForTests } from "../src/config";

const base = {
  APP_BASE_URL: "http://localhost:5173",
  DATABASE_URL: "postgres://u:p@localhost:5433/db",
  R2_ACCOUNT_ID: "local",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKETS: "bucket",
  AUTH_MODE: "password",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
};

afterEach(() => resetConfigForTests());

describe("AUTH_MODE validation (AUTH-03)", () => {
  it("boots in password mode with no extra auth settings", () => {
    expect(() => loadConfig(base)).not.toThrow();
  });

  it("points a leftover AUTH_MODE=basic at its replacement", () => {
    expect(() => loadConfig({ ...base, AUTH_MODE: "basic" })).toThrow(/AUTH_MODE.*"basic" was replaced by "password"/);
  });

  it("refuses to start without an auth mode", () => {
    expect(() => loadConfig({ ...base, AUTH_MODE: undefined })).toThrow(/AUTH_MODE/);
  });

  it("requires the Access settings when Access is on", () => {
    for (const AUTH_MODE of ["access", "both"]) {
      resetConfigForTests();
      expect(() => loadConfig({ ...base, AUTH_MODE })).toThrow(/ACCESS_TEAM_DOMAIN and ACCESS_AUD/);
    }
    resetConfigForTests();
    expect(() =>
      loadConfig({ ...base, AUTH_MODE: "both", ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "aud" }),
    ).not.toThrow();
  });

  it("refuses a setup token too short to resist guessing", () => {
    expect(() => loadConfig({ ...base, SETUP_TOKEN: "short" })).toThrow(/SETUP_TOKEN/);
  });
});

describe("general validation", () => {
  it("treats a blank optional value as unset", () => {
    expect(() => loadConfig({ ...base, R2_ENDPOINT: "", SETUP_TOKEN: "" })).not.toThrow();
  });

  it("requires HTTPS application and storage URLs in production", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).toThrow(/APP_BASE_URL.*https/);

    resetConfigForTests();
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: "production",
        APP_BASE_URL: "https://files.example.com",
        R2_ENDPOINT: "http://storage.internal",
      }),
    ).toThrow(/R2_ENDPOINT.*https/);
  });
});
