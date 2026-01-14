# Setting Up Cloudflare R2

This guide walks you through configuring Cloudflare R2 as a storage backend for the asset-manager component.

## Prerequisites

- A Cloudflare account
- A Convex project with the asset-manager component installed

## Step 1: Create an R2 Bucket

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **R2 Object Storage** in the sidebar
3. Click **Create bucket**
4. Choose a bucket name (e.g., `my-app-assets`)
5. Select a location (optional)
6. Click **Create bucket**

## Step 2: Create API Credentials

1. In the R2 dashboard, click **Manage R2 API Tokens**
2. Click **Create API token**
3. Configure the token:
   - **Token name**: e.g., `convex-asset-manager`
   - **Permissions**: Select **Object Read & Write**
   - **Specify bucket(s)**: Select your bucket
4. Click **Create API Token**
5. **Save these values** (shown only once):
   - Access Key ID
   - Secret Access Key

## Step 3: Configure CORS

CORS must be configured to allow uploads from your frontend.

1. In your bucket settings, go to **Settings** → **CORS Policy**
2. Click **Add CORS policy** and enter:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://your-app.com"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length",
      "Content-Type"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

**Important notes:**
- Include all origins where uploads will occur (localhost for dev, production domain)
- `PUT` is required for R2 uploads (not POST)
- `AllowedHeaders: ["*"]` is required for presigned URL uploads
- Add your production domain before deploying

## Step 4: Set Up a Custom Domain (Required for Public Access)

For public file access via CDN, you need a custom domain:

1. In your bucket settings, go to **Settings** → **Public access**
2. Click **Connect Domain**
3. Enter your subdomain (e.g., `assets.yourdomain.com`)
4. Follow the DNS configuration instructions
5. Wait for SSL certificate provisioning (usually a few minutes)

Your public URL will be: `https://assets.yourdomain.com`

## Step 5: Configure Environment Variables

Add these environment variables to your Convex project:

```bash
# In your Convex dashboard or .env.local
R2_BUCKET=your-bucket-name
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_PUBLIC_URL=https://assets.yourdomain.com
```

To find your account ID and endpoint:
1. Go to R2 dashboard
2. Click on your bucket
3. The endpoint is shown in the bucket details

## Step 6: Configure the Component

In your Convex backend, configure the storage backend:

```typescript
// convex/setup.ts (run once or in a migration)
import { mutation } from "./_generated/server";
import { components } from "./_generated/api";

export const configureR2 = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(
      components.assetManager.assetManager.configureStorageBackend,
      {
        backend: "r2",
        r2PublicUrl: process.env.R2_PUBLIC_URL!,
        // Optional: prefix to namespace files when sharing a bucket
        r2KeyPrefix: "my-app",
      }
    );
  },
});
```

## Step 7: Create R2 Config Helper

Create a helper to pass R2 credentials to the component:

```typescript
// convex/r2Config.ts
export function getR2Config() {
  const config = {
    R2_BUCKET: process.env.R2_BUCKET,
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  };

  // Validate all required env vars are present
  for (const [key, value] of Object.entries(config)) {
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return config as {
    R2_BUCKET: string;
    R2_ENDPOINT: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
  };
}
```

## Verifying Your Setup

Test the configuration by uploading a file:

```typescript
// In your app
const { intentId, uploadUrl, backend } = await ctx.runMutation(
  components.assetManager.assetManager.startUpload,
  {
    folderPath: "test",
    basename: "hello",
    filename: "hello.txt",
    r2Config: getR2Config(),
  }
);

console.log("Backend:", backend); // Should be "r2"
console.log("Upload URL:", uploadUrl); // Should be R2 presigned URL
```

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser console:

1. Verify `AllowedOrigins` includes your exact origin (including port)
2. Ensure `AllowedHeaders` is set to `["*"]`
3. Check that `PUT` is in `AllowedMethods`
4. CORS changes can take a few minutes to propagate

### 403 Forbidden on Upload

- Verify your API token has write permissions for the bucket
- Check that the token hasn't expired
- Ensure `R2_ENDPOINT` uses the correct account ID

### Files Not Accessible via Public URL

- Verify the custom domain is properly configured
- Check that the domain's SSL certificate is active
- Ensure `r2PublicUrl` in the component config matches your domain

## Next Steps

- [Public Files with CDN](./public-files.md) - Serve files through Cloudflare CDN
- [Private Files with Signed URLs](./private-files.md) - Auth-controlled file access
