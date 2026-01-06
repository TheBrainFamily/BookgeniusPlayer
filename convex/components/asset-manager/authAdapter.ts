import type { QueryCtx, MutationCtx } from "./_generated/server";

export type Actor =
  | { kind: "anonymous"; tokenIdentifier: null }
  | { kind: "user"; tokenIdentifier: string };

// soft version: returns anonymous when no auth
export async function getActor(ctx: QueryCtx | MutationCtx): Promise<Actor> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return { kind: "anonymous", tokenIdentifier: null };
  }

  // tokenIdentifier is guaranteed and unique across issuers
  const { tokenIdentifier } = identity;
  return { kind: "user", tokenIdentifier };
}

// strict version: throw if unauthenticated.
// Use this if certain mutations *must* be authed.
export async function requireActor(ctx: QueryCtx | MutationCtx) {
  const actor = await getActor(ctx);
  if (actor.kind === "anonymous") {
    throw new Error("Unauthenticated");
  }
  return actor;
}

// Returns actor fields that can be spread into insert/patch operations
export async function getActorFields(
  ctx: QueryCtx | MutationCtx,
): Promise<{ createdBy?: string; updatedBy?: string }> {
  const actor = await getActor(ctx);
  const tokenIdentifier = actor.kind === "user" ? actor.tokenIdentifier : undefined;
  return { createdBy: tokenIdentifier, updatedBy: tokenIdentifier };
}
