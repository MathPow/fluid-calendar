/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

import { issueStepUp, requireStepUp } from "@/lib/auth/step-up";
import { allowedTailnetLogin, fromTailnetProxy } from "@/lib/auth/tailnet";

const env = { ...process.env };

beforeEach(() => {
  process.env = {
    ...env,
    NEXTAUTH_SECRET: "test-secret",
    TAILNET_PROXY_SECRET: "proxy-secret",
    STEPUP_PIN_HASH: "$2a$10$hash",
    TAILNET_ALLOWED_LOGINS: "me@example.com, other@example.com",
  };
});
afterAll(() => {
  process.env = env;
});

describe("fromTailnetProxy", () => {
  it("accepts the Caddy secret only", () => {
    expect(
      fromTailnetProxy(new Headers({ "x-dreamdash-proxy": "proxy-secret" }))
    ).toBe(true);
    expect(
      fromTailnetProxy(new Headers({ "x-dreamdash-proxy": "proxy-secre" }))
    ).toBe(false);
    expect(fromTailnetProxy(new Headers())).toBe(false);
  });

  it("is off unless the step-up PIN is also configured", () => {
    delete process.env.STEPUP_PIN_HASH;
    expect(
      fromTailnetProxy(new Headers({ "x-dreamdash-proxy": "proxy-secret" }))
    ).toBe(false);
  });
});

describe("allowedTailnetLogin", () => {
  it("matches the allow-list, case-insensitively", () => {
    expect(
      allowedTailnetLogin(new Headers({ "x-tailscale-user": "Me@Example.com" }))
    ).toBe("me@example.com");
    expect(
      allowedTailnetLogin(
        new Headers({ "x-tailscale-user": "intruder@example.com" })
      )
    ).toBeNull();
    expect(allowedTailnetLogin(new Headers())).toBeNull();
  });
});

describe("requireStepUp", () => {
  const req = (cookie?: string) =>
    new NextRequest("http://localhost/api/machines/x/commands", {
      headers: cookie ? { cookie: `dd_stepup=${cookie}` } : {},
    });

  it("wants the PIN without a cookie", () => {
    expect(requireStepUp(req(), "u1")?.status).toBe(403);
  });

  it("accepts a cookie issued for the same user", () => {
    expect(requireStepUp(req(issueStepUp("u1")), "u1")).toBeNull();
  });

  it("rejects another user's or a tampered cookie", () => {
    expect(requireStepUp(req(issueStepUp("u2")), "u1")?.status).toBe(403);
    const [exp, mac] = issueStepUp("u1").split(".");
    expect(
      requireStepUp(req(`${Number(exp) + 999}.${mac}`), "u1")?.status
    ).toBe(403);
  });

  it("is a no-op when no PIN is configured", () => {
    delete process.env.STEPUP_PIN_HASH;
    expect(requireStepUp(req(), "u1")).toBeNull();
  });
});
