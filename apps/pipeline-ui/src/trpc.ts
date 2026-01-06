import type { AppRouter } from "~pipeline/src/server/router";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: "http://localhost:4000/trpc" })],
});
