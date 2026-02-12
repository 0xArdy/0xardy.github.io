---
layout: post
title: "Quick set up for decentralized frontends"
---

Centralized infrastructure still controls most "decentralized" apps at the frontend layer. Your smart contracts can be censorship-resistant, but if your UI lives on a single Web2 host, users can lose access overnight.

This post is a quick guide to ship your frontend to IPFS automatically on every `main` push.

## What Is IPFS (And Why It Matters)

[IPFS](https://ipfs.tech/) (InterPlanetary File System) is a content-addressed network. Instead of fetching files from a server location, the users fetch content by hash (CID). That means:

- Content is identified by what it is, not where it is hosted.
- Any node pinning the same CID can serve that content.
- You get stronger integrity guarantees, because the hash must match.

For decentralized products, this matters because hosting is often the weakest link.

## Why Decentralized Frontends Are Critical

There are many moments where frontend decentralization is not optional:

- **Provider outage concentration:** In Nov 2025, a major [Cloudflare incident](https://coincentral.com/cloudflare-outage-disrupts-20-of-internet-takes-down-major-crypto-platforms/) reportedly impacted a large share of internet traffic and disrupted access to multiple crypto frontends while chains kept producing blocks.
- **Cloud DNS/control-plane failures:** In Oct 2025, an [AWS outage](https://es.euronews.com/next/2025/10/20/una-caida-global-de-aws-provoca-fallos-en-redes-sociales-juegos-online-y-aplicaciones) tied to DNS resolution issues disrupted global apps (including crypto interfaces) without halting underlying protocols.
- **Regulatory frontend takedowns:** [OFAC's 2022 Tornado Cash sanctions](https://home.treasury.gov/news/press-releases/jy0916) targeted its web/domain access layer; even before [2025 delisting](https://www.reuters.com/business/finance/us-scraps-sanctions-tornado-cash-crypto-mixer-accused-laundering-north-korea-2025-03-21/), contract code existing onchain did not guarantee practical user access.

If users cannot access the interface, protocol-level decentralization is not enough in practice.

## Important Tradeoff Up Front: Pinata Is Step 1, Not the End State

In this guide i propose **Pinata** as a bootstrap layer because it is simple and fast to integrate into CI.

But keep in mind that single-provider pinning creates a single failure domain for availability, policy decisions, and billing.

If that provider degrades, delists content, or shuts down, your users will lose the interface.

Treat this guide as phase one: baseline automation. Phase two is redundancy, where each release is pinned across **multiple independent providers and/or your own nodes**.

## Repository Prerequisites

### Build output

Your build must produce a static directory:

- **Next.js**: usually `./out` (`output: 'export'` is required)
- **Vite/React**: usually `./dist`

In this guide we assume `./out`.

## Create the GitHub Actions Workflow

Create this file in your repository:

`.github/workflows/release.yml`

Paste:

```yaml
name: Release

on:
  push:
    branches:
      - main

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Generate release tag
        id: release-tag
        run: echo "tag=release-$(date -u +"%Y-%m-%d_%H-%M")" >> "$GITHUB_OUTPUT"

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "21.4"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build static export
        run: pnpm build

      - name: Pin to IPFS (Pinata)
        id: upload
        uses: aquiladev/ipfs-action@v0.3.1
        with:
          path: ./out
          service: pinata
          pinataKey: ${{ secrets.PINATA_API_KEY }}
          pinataSecret: ${{ secrets.PINATA_SECRET_API_KEY }}
          pinName: "Release ${{ steps.release-tag.outputs.tag }}"

      - name: Convert CIDv0 to CIDv1
        id: convert_cid
        uses: uniswap/convert-cidv0-cidv1@v1.0.0
        with:
          cidv0: ${{ steps.upload.outputs.hash }}

      - name: Tag version
        id: tag
        uses: uniswap/github-tag-action@7bddacd4864a0f5671e836721db60174d8a9c399
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          custom_tag: ${{ steps.release-tag.outputs.tag }}
          tag_prefix: ""

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ steps.tag.outputs.new_tag }}
          name: Production Release
          body: |
            IPFS hash of the deployment:

            - CIDv0: `${{ steps.upload.outputs.hash }}`
            - CIDv1: `${{ steps.convert_cid.outputs.cidv1 }}`

            You can also access the interface from an IPFS gateway.

            IPFS gateways:
            - https://${{ steps.convert_cid.outputs.cidv1 }}.ipfs.dweb.link/
            - ipfs://${{ steps.upload.outputs.hash }}/

          draft: false
          prerelease: false
```

## Configure GitHub Secrets

Go to:
**Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**

Add the following keys (from [Pinata Developers](https://app.pinata.cloud/developers/api-keys)):

| Secret Name             | Description                |
| ----------------------- | -------------------------- |
| `PINATA_API_KEY`        | Your Pinata API Key        |
| `PINATA_SECRET_API_KEY` | Your Pinata Secret API Key |

## Framework Configuration

IPFS serves static files. If your app needs a server at runtime, it will break.

### Option A: Next.js

1. Update `next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // Required for IPFS static hosting
  trailingSlash: true, // Avoid common gateway path 404s
  images: { unoptimized: true }, // Next image optimization needs a server
};

export default nextConfig;
```

2. Keep your `package.json` build script as `next build`.
3. The workflow uses `./out`, which is correct for Next static export.

### Option B: Vite (React/Vue)

1. Change workflow upload path from `./out` to `./dist`:

```yaml
path: ./dist
```

2. Configure `vite.config.js` with a relative base:

```js
import { defineConfig } from "vite";

export default defineConfig({
  base: "./", // Important for IPFS path resolution
});
```

## What to Improve Next

Think of this setup as a good starting point. For stronger protection and real-world reliability, here’s what you might want to do next:

- Multi-provider pinning (Pinata + another pinning service)
- Self-hosted IPFS pinning node (if possible)
- Monitoring that checks gateway availability per CID
- Optional ENS/IPNS naming for better UX
