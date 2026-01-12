# Example Apps Plan for Asset Manager Component

## Goal

Build a suite of focused example apps that demonstrate different patterns for using the asset-manager component. Each app teaches one or two concepts clearly, making it easy to understand, test, and record videos for.

---

## Project Structure

```
convex-asset-manager/              # New repo or folder
├── packages/
│   └── asset-manager/             # The component (moved from current location)
│       └── convex/components/asset-manager/
│
├── examples/
│   ├── 01-basic-upload/           # Vite - simplest possible upload
│   ├── 02-public-gallery/         # Vite - public files with CDN URLs
│   ├── 03-versioned-text/         # Vite - version history with text files
│   ├── 04-reactive-updates/       # Vite - real-time version changes
│   ├── 05-private-files/          # Vite - signed URLs with auth
│   ├── 06-private-video/          # Vite - video streaming with long TTL
│   ├── 07-team-permissions/       # Vite - team-based access control
│   ├── 08-static-marketing/       # Next.js - SSG with build-time URLs
│   ├── 09-hybrid-static/          # Next.js - SSG + client reactivity
│   ├── 10-prefetch-nextjs/        # Next.js - RSC + prefetching patterns
│   ├── 11-prefetch-tanstack/      # TanStack Start - loader prefetching
│   ├── 12-r2-storage/             # Vite - R2 backend (identical frontend)
│   └── admin-panel/               # Shared admin UI (extracted)
│
└── docs/                          # Already created documentation
```

---

## Example Apps Detail

### 01-basic-upload (Vite)

**Concepts**: Upload flow, startUpload → finishUpload
**Complexity**: Minimal
**Storage**: Convex

Single page with:

- File input
- Upload button
- Progress indicator
- Display uploaded file URL

```tsx
// The simplest possible upload
const { uploadUrl } = await startUpload({
  folderPath: "uploads",
  basename: "myfile",
  filename: file.name,
});
await fetch(uploadUrl, { method: "POST", body: file });
await finishUpload({ intentId });
```

**Testing**: Upload a text file, verify URL works, check metadata in dashboard.

---

### 02-public-gallery (Vite)

**Concepts**: Public files, CDN URLs, listPublishedFilesInFolder
**Complexity**: Low
**Storage**: Convex

Image gallery that:

- Lists all published images in a folder
- Displays them using direct URLs
- Shows how URLs are stable (can be bookmarked)
- Demonstrates browser caching (same URL = cached)

```tsx
const files = useQuery(api.gallery.listImages, { folder: "gallery" });
return files.map((f) => <img src={f.url} key={f.versionId} />);
```

**Testing**: Upload images, refresh page, check Network tab shows cached responses.

---

### 03-versioned-text (Vite)

**Concepts**: Version history, published/archived states, restoreVersion
**Complexity**: Medium
**Storage**: Convex

Text editor with:

- Textarea to edit content
- "Save" button
- Version history sidebar
- Ability to restore old versions
- Display shows which version is published

Uses **text files** so content is easily verifiable:

```
Version 1: "Hello World"
Version 2: "Hello World - Updated"
Version 3: "Hello World - Final"
```

**Testing**: Create versions, verify correct content loads, restore old version, verify new version created.

---

### 04-reactive-updates (Vite)

**Concepts**: Convex reactivity, real-time updates across windows
**Complexity**: Medium
**Storage**: Convex

Two-panel demo:

- Left panel: "Editor" with upload controls
- Right panel: "Viewer" showing current published version
- Open in two browser windows

When you upload a new version in Window A, Window B updates instantly without refresh.

```tsx
// Viewer just subscribes
const file = useQuery(api.files.getPublished, { path: "demo/content" });
return <div>{file?.url && <img src={file.url} />}</div>;
```

**Testing**: Open two windows, upload in one, watch other update. Record timestamp of updates.

---

### 05-private-files (Vite)

**Concepts**: Signed URLs, HTTP endpoint, auth headers, versionId in URL
**Complexity**: Medium-High
**Storage**: Convex

User dashboard with:

- Login using Convex Auth
- Upload private files
- View own files via signed URLs
- Files inaccessible without auth

HTTP endpoint pattern:

```
GET /private/v/{versionId}/path/to/file
→ Verify auth
→ Generate signed URL
→ 302 Redirect
```

**Testing**: Upload file, logout, try URL (should fail), login, URL works.

---

### 06-private-video (Vite)

**Concepts**: Long TTL for video, Range requests, seeking behavior
**Complexity**: Medium
**Storage**: Convex (or R2 for larger files)

Video player demo:

- Upload a video file
- Play with seeking enabled
- Show why short TTL breaks (signed URL expires mid-seek)
- Configure longer TTL (1-4 hours)

```tsx
// HTTP endpoint uses longer expiration for video
const signedUrl = await getSignedUrl({
  versionId,
  expiresIn: 14400, // 4 hours
});
```

**Testing**: Upload short video, seek around, watch network requests, verify no 403 errors.

---

### 07-team-permissions (Vite)

**Concepts**: Team-based access, permission checks in app layer
**Complexity**: High
**Storage**: Convex

Multi-user app with:

- Users belong to teams
- Files belong to teams
- Only team members can access team files
- Component stays "dumb" - app checks permissions

```tsx
// App layer checks team membership
export const getTeamFile = query({
  handler: async (ctx, { teamId, fileId }) => {
    const user = await getUser(ctx);
    const membership = await ctx.db.query("teamMembers")
      .filter(q => q.eq(q.field("teamId"), teamId))
      .filter(q => q.eq(q.field("userId"), user._id))
      .first();

    if (!membership) throw new Error("Not a team member");

    // Now safe to get signed URL
    return await ctx.runAction(components.assetManager.signedUrl.getSignedUrl, { ... });
  }
});
```

**Testing**: Create two teams, two users, verify cross-team access denied.

---

### 08-static-marketing (Next.js)

**Concepts**: SSG, build-time URLs, no client-side Convex
**Complexity**: Medium
**Storage**: Convex (or R2 for production scale)

Marketing site with:

- Images/assets fetched at build time
- Static HTML output
- No WebSocket connection to Convex
- URLs embedded in HTML

```tsx
// app/page.tsx
export async function generateStaticParams() {
  // Runs at build time only
}

export default async function Page() {
  const heroImage = await fetchQuery(api.marketing.getHeroImage);
  return <img src={heroImage.url} />; // URL baked into HTML
}
```

**Testing**: Build site, verify no Convex connection in browser, images load from static URLs.

---

### 09-hybrid-static (Next.js)

**Concepts**: SSG + client hydration, static build with live updates
**Complexity**: Medium-High
**Storage**: Convex

Marketing site that:

- Builds statically (fast initial load)
- Hydrates with Convex client
- Shows stale content briefly, then live content
- Useful for "mostly static but occasionally updated" sites

```tsx
// Static generation
export async function generateStaticParams() { ... }

// Client hydration
"use client"
const file = useQuery(api.marketing.getHero); // Reactive after hydration
```

**Testing**: Build, deploy, update content in Convex, refresh page, see update without rebuild.

---

### 10-prefetch-nextjs (Next.js)

**Concepts**: RSC data fetching, client cache, streaming
**Complexity**: High
**Storage**: Convex

Admin panel showing:

- Server Components fetch initial data
- Client Components subscribe to updates
- Prefetching on hover
- Comparison with client-only approach

Based on existing `next-app/admin/` but cleaned up and documented.

---

### 11-prefetch-tanstack (TanStack Start)

**Concepts**: Loader pattern, route prefetching, stale-while-revalidate
**Complexity**: High
**Storage**: Convex

Admin panel showing:

- Route loaders prefetch data
- `router.preloadRoute()` on hover
- React Query caching
- Comparison with Next.js RSC approach

Based on existing `src/routes/admin.tsx` but cleaned up and documented.

---

### 12-r2-storage (Vite)

**Concepts**: R2 backend, identical frontend code, configuration only
**Complexity**: Low (if 02-public-gallery exists)
**Storage**: R2

**Identical to 02-public-gallery** except:

- Different `convex/` folder with R2 configuration
- Environment variables for R2 credentials
- Run `configureStorageBackend({ backend: "r2", ... })` once

Demonstrates that frontend code doesn't change between backends.

**Testing**: Upload same images as 02, verify URLs point to R2 domain, CDN caching works.

---

## Implementation Order

### Phase 1: Foundation (Start Here)

1. **01-basic-upload** - Simplest possible, proves component works
2. **02-public-gallery** - Public files, CDN pattern
3. **03-versioned-text** - Version management with verifiable content

### Phase 2: Reactivity

4. **04-reactive-updates** - Cross-window reactivity demo
5. **12-r2-storage** - Prove backend abstraction (copy of 02 with R2)

### Phase 3: Private Access

6. **05-private-files** - Auth + signed URLs
7. **06-private-video** - Long TTL for streaming

### Phase 4: Advanced Patterns

8. **07-team-permissions** - Multi-tenant access control
9. **08-static-marketing** - Pure SSG
10. **09-hybrid-static** - SSG + hydration

### Phase 5: Framework Comparison

11. **10-prefetch-nextjs** - Clean up existing next-app/admin
12. **11-prefetch-tanstack** - Clean up existing src/admin

---

## Shared Code Strategy

Each example has its own `convex/` folder with the component at `convex/components/asset-manager/`.

Linking and syncing handled separately (not part of this plan). When building examples, assume component is already in place.

---

## Testing Checklist Per Example

Each example should verify:

- [ ] Upload works (file appears in storage)
- [ ] Correct URL returned (public or signed)
- [ ] Metadata accurate (size, contentType)
- [ ] Version history correct
- [ ] Browser caching behavior as expected
- [ ] Auth works (if applicable)
- [ ] Reactivity works (if applicable)
- [ ] Framework-specific patterns documented

---

## Component Gaps to Fill

As we build examples, we may discover missing pieces:

| Gap                        | Example That Needs It | Priority |
| -------------------------- | --------------------- | -------- |
| `getFileByVersionId` query | 05-private-files      | High     |
| Batch upload support       | 02-public-gallery     | Medium   |
| Upload progress events     | 01-basic-upload       | Medium   |
| File deletion              | 07-team-permissions   | Medium   |
| Folder deletion            | Admin panels          | Low      |
| Search/filter queries      | Admin panels          | Low      |

---

## Video Recording Plan

Each example gets a short video (2-5 min):

1. **01-basic-upload**: "Upload your first file in 2 minutes"
2. **02-public-gallery**: "Building a CDN-backed image gallery"
3. **03-versioned-text**: "Version control for your assets"
4. **04-reactive-updates**: "Real-time updates across browser windows"
5. **05-private-files**: "Secure file access with signed URLs"
6. **06-private-video**: "Streaming private video content"
7. **07-team-permissions**: "Team-based file permissions"
8. **08-static-marketing**: "Static sites with Convex assets"
9. **09-hybrid-static**: "Best of both: Static + Live updates"
10. **10 & 11**: "Prefetching patterns: Next.js vs TanStack"
11. **12-r2-storage**: "Switching to R2 without changing frontend"

---

## Decisions Made

- **Auth**: Use Convex Auth for examples 05-07 (Clerk will be shown in a separate large app)
- **Structure**: Separate folders per demo-app, each with its own `convex/` folder containing the component at `convex/components/asset-manager/`
- **Workflow**: Build all examples first, polish, then record videos from scratch
- **Admin Panel**: Show integration as a route in Next.js/TanStack/Vite (could become a package later)

---

## Notes

- Component linking handled separately - assume component exists at `convex/components/asset-manager/`
- Later: Replace local component with npm package + update imports via AST tooling
- Later: Prepare prompts + AGENT.md for automated building of these examples
