"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";

export default function Home() {
  // This demonstrates Convex working in Next.js
  const folders = useQuery(api.cli.listFolders, { parentPath: "" });

  return (
    <main style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "1rem" }}>Next.js + Convex Demo</h1>

      <p style={{ marginBottom: "2rem", color: "#888" }}>
        This page fetches data from Convex using the same API as the TanStack Router app.
      </p>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ marginBottom: "1rem" }}>Folders from Convex:</h2>
        {folders === undefined ? (
          <p style={{ color: "#666" }}>Loading...</p>
        ) : folders.length === 0 ? (
          <p style={{ color: "#666" }}>No folders found</p>
        ) : (
          <ul style={{ listStyle: "none" }}>
            {folders.map((folder) => (
              <li
                key={folder.path}
                style={{
                  padding: "0.75rem 1rem",
                  marginBottom: "0.5rem",
                  background: "#1a1a1a",
                  borderRadius: "4px",
                }}
              >
                {folder.path || "(root)"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        style={{ marginTop: "3rem", padding: "1.5rem", background: "#111", borderRadius: "8px" }}
      >
        <h2 style={{ marginBottom: "1rem" }}>Navigation Experiments</h2>
        <p style={{ marginBottom: "1rem", color: "#888", fontSize: "0.9rem" }}>
          Test Next.js prefetching behavior:
        </p>
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link
            href="/demo/ssr"
            style={{ padding: "0.5rem 1rem", background: "#333", borderRadius: "4px" }}
          >
            SSR Demo
          </Link>
          <Link
            href="/demo/client"
            style={{ padding: "0.5rem 1rem", background: "#333", borderRadius: "4px" }}
          >
            Client Demo
          </Link>
        </nav>
      </section>
    </main>
  );
}
