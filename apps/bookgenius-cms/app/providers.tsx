"use client";

import { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { ConvexProvider } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";

export function Providers({ children }: { children: ReactNode }) {
  const [clients] = useState(() => {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;
    if (!convexUrl) {
      throw new Error("Missing NEXT_PUBLIC_CONVEX_URL environment variable");
    }

    const convexQueryClient = new ConvexQueryClient(convexUrl);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          queryKeyHashFn: convexQueryClient.hashFn(),
          queryFn: convexQueryClient.queryFn(),
        },
      },
    });
    convexQueryClient.connect(queryClient);

    return { convexQueryClient, queryClient };
  });

  return (
    <ConvexAuthProvider client={clients.convexQueryClient.convexClient}>
      <ConvexProvider client={clients.convexQueryClient.convexClient}>
        <QueryClientProvider client={clients.queryClient}>{children}</QueryClientProvider>
      </ConvexProvider>
    </ConvexAuthProvider>
  );
}
