---
layout: post
title: "Introducing Walletless: Deterministic Web3 E2E Tests"
---

Many Web3 E2E tests are flaky for one reason: wallet interactions live in browser extensions, not in your test-controlled app runtime.

That breaks determinism. Extensions update, prompt timing shifts, session state leaks between runs, and CI becomes a game of retries. [**Walletless**](https://www.npmjs.com/package/@wonderland/walletless) fixes this by turning wallet behavior into an in-process test dependency you can control.

If you treat the wallet as test infrastructure (not as a manual UI dependency), Web3 E2E tests become reproducible enough for CI and useful enough for fast iteration.

What Walletless gives you:

- Drop-in compatibility with Wagmi/Viem
- Connection to local or forked networks
- No browser extension installation
- Fully automatable wallet connect and transaction paths

## Real Implementations

This strategy is already used in real codebases:

- [`defi-wonderland/web3-nextjs-boilerplate`](https://github.com/defi-wonderland/web3-nextjs-boilerplate)
- [`defi-wonderland/canon-guard-ui`](https://github.com/defi-wonderland/canon-guard-ui)

## Mental Model

Think about Walletless as a signer virtualization layer:

1. Keep your normal app stack (Wagmi + Connector Provider + Test Framework).
2. Swap the real wallet connector for an E2E connector under a flag.
3. Route reads/writes to a deterministic forked chain.

The UI flow still behaves like "connect wallet, sign, send transaction", but the critical state is now scriptable and reproducible.

## Failure Mode Without This

Without signer virtualization, teams usually split into two bad options:

- Keep true-wallet browser flows and accept flaky CI.
- Mock too much in frontend tests and lose confidence in real transaction behavior.

Walletless sits in the middle: realistic enough to test wallet integration paths, deterministic enough to trust in automation.

---

## Prerequisites

Before setting up E2E tests, ensure you have:

- **Node.js** >= 18.17.0
- **pnpm**
- **Foundry** installed (for Anvil) - [Install Foundry](https://book.getfoundry.sh/getting-started/installation)

---

## Repository Setup

### 1. Install Dependencies

```bash
pnpm add -D @playwright/test @wonderland/walletless
```

### 2. Install Playwright Browsers

```bash
pnpm playwright:install
# or
npx playwright install
```

### 3. Configure Environment Variables

Create or update your `.env` file with the following variables:

```bash
# Enable Walletless test mode (local E2E)
E2E_TEST_MODE='true'

# Optional fallback switch often enabled in CI environments
CI='true'

# Fork source RPC (example)
FORK_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com/

```

> Important: only enable test mode for E2E runs. Use `E2E_TEST_MODE='true'` (or `CI='true'` in CI) to swap production connectors for Walletless.

---

## Walletless Configuration

Walletless exposes `e2eConnector`, which lets you provide a wallet implementation that [RainbowKit](https://rainbowkit.com/docs/introduction) can render and Wagmi can use like any other connector.

### How to set it up (with RainbowKit)

```tsx
// src/config/wagmiConfig.ts
import {
  connectorsForWallets,
  Wallet,
  WalletDetailsParams,
} from "@rainbow-me/rainbowkit";
import {
  rainbowWallet,
  walletConnectWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { e2eConnector } from "@wonderland/walletless";
import {
  createConfig,
  http,
  cookieStorage,
  createStorage,
  createConnector,
} from "wagmi";
import { sepolia } from "wagmi/chains";
import { getConfig as getAppConfig } from "~/config";

const {
  env: { PROJECT_ID },
  constants: { RPC_URL_TESTING },
} = getAppConfig();

const isE2E = process.env.E2E_TEST_MODE === "true" || process.env.CI === "true";

// For E2E testing only
export const e2eWallet = (): Wallet => ({
  id: "e2e",
  name: "E2E Test Wallet",
  iconUrl:
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%234F46E5" width="100" height="100" rx="20"/><text x="50" y="65" font-size="50" text-anchor="middle" fill="white">E2E</text></svg>',
  iconBackground: "#4F46E5",
  installed: true,
  createConnector: (walletDetails: WalletDetailsParams) => {
    const connector = e2eConnector({
      rpcUrls: {
        [sepolia.id]: RPC_URL_TESTING,
      },
      chains: [sepolia],
    });

    return createConnector((config) => ({
      ...connector(config),
      ...walletDetails,
    }));
  },
});

const getWallets = () => {
  if (isE2E) {
    return [e2eWallet];
  }

  if (PROJECT_ID) {
    return [injectedWallet, rainbowWallet, walletConnectWallet];
  } else {
    return [injectedWallet];
  }
};

export function getConfig() {
  const connectors = connectorsForWallets(
    [
      {
        groupName: "Recommended",
        wallets: getWallets(),
      },
    ],
    {
      appName: "Web3 React boilerplate",
      projectId: PROJECT_ID,
    },
  );

  return createConfig({
    chains: [sepolia],
    ssr: true,
    storage: createStorage({
      storage: cookieStorage,
    }),
    transports: {
      [sepolia.id]: isE2E ? http(RPC_URL_TESTING) : http(),
    },
    batch: { multicall: true },
    connectors,
  });
}
```

---

## Anvil Setup

Anvil is a local Ethereum node that can fork public networks. This gives you realistic state with deterministic control and no real funds.

### Configuration

The Anvil command is configured in `package.json`:

```json
{
  "scripts": {
    "fork:sep": "RPC_URL=${FORK_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com/} && anvil --fork-url $RPC_URL --chain-id 11155111 --no-storage-caching"
  }
}
```

### Running Anvil Manually

```bash
# Fork Sepolia with default settings
pnpm fork:sep
```

For critical flows, pin a fork block:

```bash
anvil --fork-url "$FORK_RPC_URL" --chain-id 11155111 --fork-block-number 7535000
```

### Default Test Accounts

Anvil provides 10 pre-funded accounts. The first account (index 0) is:

- **Address**: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **Private Key**: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- **Balance**: 10,000 ETH

> ⚠️ Never use these keys on mainnet! They are well-known test keys.

---

## Wonderland Isolation Pattern (Test Mode / CI)

At Wonderland, the E2E setup depends on the app under test, but the pattern is consistent when test mode is enabled (or `CI === "true"`):

1. Start the app alongside an Anvil fork for every supported chain (optionally pinned to specific blocks).
2. Replace the wallet provider with Walletless, configured with the fork RPC URLs.
3. Replace all app RPC transports with the same fork RPC URLs.

This creates complete runtime isolation. The virtual wallet auto-signs app-initiated transactions, and because wallet + app both read from the same fork RPC, balance and state changes are reflected immediately in the UI whether transactions succeed or revert.

---

## Playwright Configuration

The Playwright configuration is in `playwright.config.ts`:

```tsx
import dotenv from "@dotenvx/dotenvx";
import { defineConfig, devices } from "@playwright/test";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: [
    {
      command: "pnpm fork:sep",
      url: "http://127.0.0.1:8545",
      reuseExistingServer: true,
      timeout: 120 * 1000,
    },
    {
      command: "pnpm build && pnpm start",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});
```

## Tradeoffs and Edge Cases

Walletless reduces test instability, but you still need to manage constraints:

- **Provider correctness:** fork RPC quality affects determinism and speed.
- **State drift:** "latest" forks can introduce nondeterministic behavior across days.
- **Infra coupling:** if your app depends on indexers/subgraphs, chain-only forks may not reproduce full production behavior.
- **Concurrency:** fully parallel tests may contend for shared on-chain state unless each test isolates data carefully.
- **Operational overhead:** multi-chain apps may need one forked node per chain during E2E runs.

Practical fix: pin fork block numbers for critical flows, keep fixtures isolated, and reserve a tiny manual suite for real-wallet edge UX.

---

## CI/CD Integration

### GitHub Actions Example

Our [boilerplate](https://github.com/defi-wonderland/web3-nextjs-boilerplate) repository includes a GitHub workflow for running tests. Here's the key configuration:

```yaml
# .github/workflows/test.yml
name: E2E and Unit Tests

on:
  push:
  workflow_dispatch:

jobs:
  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: "pnpm"
      - name: Install Foundry
        uses: foundry-rs/foundry-toolchain@v1
        with:
          version: nightly
      - name: Install dependencies
        run: pnpm install
      - name: Install Playwright Browsers
        run: pnpm exec playwright install --with-deps
      - name: Create env file
        run: |
          touch .env
          echo "FORK_RPC_URL=${{ secrets.FORK_RPC_URL }}" >> .env
          echo "WALLET_CONNECT_PROJECT_ID=${{ secrets.WALLET_CONNECT_PROJECT_ID }}" >> .env
          echo "ALCHEMY_API_KEY=${{ secrets.ALCHEMY_API_KEY }}" >> .env
          echo "E2E_TEST_MODE='true'" >> .env
          echo "CI='true'" >> .env
      - name: Run E2E tests
        run: pnpm playwright:test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

---

In short: Walletless is not just a connector change; it is a reliability contract for your testing workflow.
