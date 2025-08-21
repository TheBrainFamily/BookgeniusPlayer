# BookGenius Monorepo

Welcome to the **BookGenius** project!  
This monorepo contains the entire ecosystem for our interactive book platform, including frontend applications, backend services, and shared packages.

---

## Table of Contents

- [🚀 Project Overview](#-project-overview)
  - [Core Components](#core-components)
- [⚙️ Getting Started](#️-getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Install Dependencies](#2-install-dependencies)
  - [3. Configure Environment Variables](#3-configure-environment-variables)
- [💻 Local Development Workflow](#-local-development-workflow)
  - [Running the Full Stack](#running-the-full-stack)
    - [Build Book Assets](#build-book-assets-first-time-or-when-assets-change)
    - [Start the Docker Environment](#start-the-docker-environment)
    - [Service URLs](#service-urls)
  - [Hot-Reloading](#hot-reloading)
  - [Running a Single Service](#running-a-single-service)
- [📚 Building and Deploying Book Assets](#-building-and-deploying-book-assets)
  - [The `deploy-s3.ts` Script](#the-deploy-s3ts-script)
  - [Manual Deployment](#manual-deployment)
- [🤖 CI/CD Workflow (GitHub Actions)](#-cicd-workflow-github-actions)
  - [Process](#process)
  - [Optimization](#optimization)
- [✅ TODO / Next Steps](#-todo--next-steps)

---

## 🚀 Project Overview

BookGenius is an interactive platform for experiencing books in a new way.  
The system is built as a set of services that work together to deliver a rich, secure, and performant user experience.

### Core Components

- **apps/platform** – The main frontend application where users discover books, manage their library, and handle authentication/payments.
- **apps/player** – A dedicated frontend application that acts as the immersive book reader. It can be run standalone (for partners) or embedded within the platform.
- **apps/core-api** – The primary backend service. Handles user authentication, authorization, and acts as a secure proxy to our S3 asset storage.
- **apps/ai-api** – A specialized backend for AI-powered features like semantic search and deep research within book content.
- **packages/** – A collection of shared libraries, including:
  - `ui` – Shared UI components.
  - `config-typescript` – TypeScript configuration presets.
  - `types` – Shared TypeScript type definitions.

---

## ⚙️ Getting Started

Follow these steps to set up your local development environment.

### Prerequisites

- **Node.js** (v20+ recommended)
- **pnpm** (`npm install -g pnpm`)
- **Docker** and **Docker Compose**

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd bookgenius-monorepo
```

### 2. Install Dependencies

We use `pnpm` workspaces to manage the monorepo.  
Run from the root directory:

```bash
pnpm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root of the project:

```bash
cp .env.example .env
```

Then fill in the required values:

```env
# Clerk Authentication Keys (get from clerk.com dashboard)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# S3 Configuration (for local MinIO, these are the defaults)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET=bookgenius-assets

# Add any other required variables for your services
```

---

## 💻 Local Development Workflow

Our local environment runs entirely within Docker to ensure consistency with production.  
We use:

- `docker-compose.yml` – Base configuration.
- `docker-compose.local.yml` – Development overrides (hot-reloading enabled).

### Running the Full Stack

#### Build Book Assets (first time or when assets change)

```bash
pnpm build:docker
```

#### Start the Docker Environment

```bash
pnpm dev:docker
```

This runs:

```bash
docker-compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

#### Service URLs

- Platform app → http://localhost
- Player app → http://localhost/player/
- MinIO console → http://localhost:9090

### Hot-Reloading

- Changes to `apps/core-api` or `apps/ai-api` restart the Bun server instantly.
- Changes to `apps/player` or `apps/platform` are pushed to the browser by Vite.

### Running a Single Service

```bash
pnpm dev:docker core-api
```

---

## 📚 Building and Deploying Book Assets

Book assets (content, videos, audio) are **versioned** and stored in **S3-compatible** storage, separate from application code.

### The `deploy-s3.ts` Script

Located at: `tools/scripts/deploy-s3.ts`

**Features:**

1. Detects changed books in the current branch compared to `main`.
2. Generates a unique version tag (e.g., `v-my-branch-20250808T143000`).
3. Builds only changed books.
4. Uploads assets to versioned S3 paths.
5. Generates `versions.json` manifest, merging with production for unchanged books.

### Manual Deployment

```bash
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD) bun run ./tools/scripts/deploy-s3.ts
```

---

## 🤖 CI/CD Workflow (GitHub Actions)

Defined in `.github/workflows/deploy.yml`.

### Process

1. **Trigger** – Runs on `push` to `main` or `pull_request`.
2. **Change Detection**:
   - **Code changes** → Build & push new Docker images to GHCR.
   - **Asset changes** → Run `deploy-s3.ts` to upload new versioned assets.
3. **Deployment**:
   - SSH into target server (staging for PRs, production for `main`).
   - Run `deploy.sh` to pull new images & restart services.
   - Set `ASSET_CONTEXT` to load correct manifest.

### Optimization

CSS changes trigger only quick image rebuilds; book content changes only trigger S3 uploads.

---

## ✅ TODO / Next Steps

- [ ] **Database** – Add PostgreSQL service and use Prisma for user data, purchases, and permissions.
- [ ] **Refine CI/CD** – Create separate staging server on Hetzner for PR previews.
- [ ] **Monitoring & Logging** – Integrate UptimeRobot & log aggregator (e.g., Logtail).
- [ ] **Implement `ai-api`** – Build AI service & integrate into Docker setup.
- [ ] **Shared UI Library** – Move common React components to `packages/ui` for reuse.
