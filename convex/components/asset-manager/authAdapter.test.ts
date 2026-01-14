// convex/authAdapter.test.ts
import { describe, it, expect } from "vitest";
import { getActor, requireActor } from "./authAdapter";

describe("authAdapter", () => {
  it("getActor returns anonymous when there is no identity", async () => {
    const ctx = { auth: { getUserIdentity: async () => null } } as any;

    const actor = await getActor(ctx);

    expect(actor).toEqual({ kind: "anonymous", tokenIdentifier: null });
  });

  it("getActor returns user when identity exists", async () => {
    const ctx = { auth: { getUserIdentity: async () => ({ tokenIdentifier: "user-123" }) } } as any;

    const actor = await getActor(ctx);

    expect(actor).toEqual({ kind: "user", tokenIdentifier: "user-123" });
  });

  it("requireActor throws when unauthenticated", async () => {
    const ctx = { auth: { getUserIdentity: async () => null } } as any;

    await expect(requireActor(ctx)).rejects.toThrow(/unauthenticated/i);
  });

  it("requireActor returns user when authenticated", async () => {
    const ctx = { auth: { getUserIdentity: async () => ({ tokenIdentifier: "user-123" }) } } as any;

    const actor = await requireActor(ctx);

    expect(actor).toEqual({ kind: "user", tokenIdentifier: "user-123" });
  });
});
