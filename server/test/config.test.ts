import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigForTests } from "../src/config";

const base = {
  APP_BASE_URL: "http://localhost:5173",
  DATABASE_URL: "postgres://u:p@localhost:5433/db",
  R2_ACCOUNT_ID: "local",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKETS: "bucket",
  AUTH_MODE: "basic",
  BASIC_AUTH_USERNAME: "admin",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
};

afterEach(() => resetConfigForTests());

describe("BASIC_AUTH_PASSWORD_HASH validation", () => {
  it("refuses to start with a plain password instead of a hash", () => {
    expect(() =>
      loadConfig({ ...base, BASIC_AUTH_PASSWORD_HASH: "hunter2" }),
    ).toThrow(/BASIC_AUTH_PASSWORD_HASH.*hash-password/);
  });

  it("accepts a scrypt hash from the hash-password script", () => {
    expect(() =>
      loadConfig({ ...base, BASIC_AUTH_PASSWORD_HASH: "scrypt:00ff:abcd1234" }),
    ).not.toThrow();
  });

  it("refuses the username reserved for signing out", () => {
    expect(() =>
      loadConfig({
        ...base,
        BASIC_AUTH_USERNAME: "signed-out",
        BASIC_AUTH_PASSWORD_HASH: "scrypt:00ff:abcd1234",
      }),
    ).toThrow(/BASIC_AUTH_USERNAME.*reserved/);
  });

  it("treats a blank optional value as unset", () => {
    expect(() =>
      loadConfig({
        ...base,
        BASIC_AUTH_PASSWORD_HASH: "scrypt:00ff:abcd1234",
        R2_ENDPOINT: "",
      }),
    ).not.toThrow();
  });

  it("requires HTTPS application and storage URLs in production", () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: "production",
        BASIC_AUTH_PASSWORD_HASH: "scrypt:00ff:abcd1234",
      }),
    ).toThrow(/APP_BASE_URL.*https/);

    resetConfigForTests();
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: "production",
        APP_BASE_URL: "https://files.example.com",
        R2_ENDPOINT: "http://storage.internal",
        BASIC_AUTH_PASSWORD_HASH: "scrypt:00ff:abcd1234",
      }),
    ).toThrow(/R2_ENDPOINT.*https/);
  });
});
