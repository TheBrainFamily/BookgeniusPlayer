import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
// import type { AppRouter } from "@pipeline/src/server/router";

// should set to AppRouter but that causes type issues. we will move the data fetching to convex anyway soon.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const standardEbooksTrpc = createTRPCProxyClient<any>({
  links: [httpBatchLink({ url: "http://localhost:4000/trpc" })],
});
