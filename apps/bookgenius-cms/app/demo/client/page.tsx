"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";

// Client-side data fetching - shows skeleton then fills in
// This is similar to your current TanStack Router approach

export default function ClientDemo() {
  const folders = useQuery(api.cli.listFolders, { parentPath: "" });

  return (
    <main style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <Link href="/" style={{ color: "#888", marginBottom: "1rem", display: "block" }}>
        &larr; Back
      </Link>

      <h1 style={{ marginBottom: "1rem" }}>Client-Side Demo</h1>
      <p style={{ marginBottom: "2rem", color: "#888" }}>Data fetched client-side via Convex websocket. Shows loading state then fills in.</p>

      <div style={{ padding: "1rem", background: "#1a1a1a", borderRadius: "8px", minHeight: "200px" }}>
        {folders === undefined ? (
          <div style={{ color: "#666" }}>
            <p>Loading folders...</p>
            {/* Skeleton placeholder */}
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: "40px", background: "#252525", borderRadius: "4px", marginTop: "0.5rem", animation: "pulse 1.5s infinite" }} />
            ))}
          </div>
        ) : (
          <ul style={{ listStyle: "none" }}>
            {folders.map((folder) => (
              <li key={folder.path} style={{ padding: "0.75rem", marginBottom: "0.5rem", background: "#252525", borderRadius: "4px" }}>
                {folder.path || "(root)"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
