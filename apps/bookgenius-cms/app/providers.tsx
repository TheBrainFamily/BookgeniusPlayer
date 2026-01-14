"use client";

import { type ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";

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
    <ClerkProvider>
      <ConvexProviderWithClerk client={clients.convexQueryClient.convexClient} useAuth={useAuth}>
        <QueryClientProvider client={clients.queryClient}>{children}</QueryClientProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
