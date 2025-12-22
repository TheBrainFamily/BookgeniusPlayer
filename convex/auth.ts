import { convexAuth } from "@convex-dev/auth/server";
// @ts-ignore - Module exists but types not installed in this workspace
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
