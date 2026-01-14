"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

export function FolderList() {
  const folders = useQuery(api.cli.listFolders, { parentPath: "" });

  if (folders === undefined) {
    return (
      <div style={{ color: "#666" }}>
        <p>Connecting to Convex...</p>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: "40px",
              background: "#252525",
              borderRadius: "4px",
              marginTop: "0.5rem",
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <ul style={{ listStyle: "none" }}>
      {folders.map((folder) => (
        <li
          key={folder.path}
          style={{
            padding: "0.75rem",
            marginBottom: "0.5rem",
            background: "#252525",
            borderRadius: "4px",
          }}
        >
          {folder.path || "(root)"}
        </li>
      ))}
    </ul>
  );
}
