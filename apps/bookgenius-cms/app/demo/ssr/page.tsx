import Link from "next/link";
import { FolderList } from "./FolderList";

// SSR + Client hydration demo
// The page shell renders on server, Convex data loads client-side
// For true SSR with Convex data, you'd need to use Convex HTTP client

export default function SSRDemo() {
  return (
    <main style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <Link href="/" style={{ color: "#888", marginBottom: "1rem", display: "block" }}>
        &larr; Back
      </Link>

      <h1 style={{ marginBottom: "1rem" }}>SSR + Hydration Demo</h1>
      <p style={{ marginBottom: "2rem", color: "#888" }}>
        Page shell is server-rendered (this text). Convex data hydrates client-side. For full SSR
        with data, you&apos;d use Convex HTTP client in a Server Component.
      </p>

      <div style={{ padding: "1rem", background: "#1a1a1a", borderRadius: "8px" }}>
        <FolderList />
      </div>

      <section
        style={{ marginTop: "2rem", padding: "1rem", background: "#111", borderRadius: "8px" }}
      >
        <h3 style={{ marginBottom: "0.5rem" }}>How this works:</h3>
        <ol style={{ marginLeft: "1.5rem", color: "#888", lineHeight: 1.8 }}>
          <li>Server renders the page shell (instant)</li>
          <li>Client hydrates, Convex websocket connects</li>
          <li>Data streams in, component updates</li>
          <li>Real-time updates work automatically</li>
        </ol>
      </section>
    </main>
  );
}
