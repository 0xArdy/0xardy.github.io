---
layout: post
title: "Lightweight E2E Provider for Web3 DApps"
---

## Executive Summary

This proposal outlines a lightweight, dependency-free solution for E2E testing in Dapps. By replacing heavy browser automation frameworks and real wallet extensions with a custom **EIP-1193 Ethereum Provider**, we can achieve deterministic, high-performance tests that run natively in standard frameworks like Cypress or Playwright.

## Problem Statement

Current Web3 E2E testing strategies face significant bottlenecks:

- **High Overhead:** Tools like Synpress require launching full browser extensions (Metamask), consuming significant CI/CD resources.
- **Flakiness:** Tests depend on external blockchain states, network latency, and UI changes in 3rd-party wallet extensions.
- **Complex Configuration:** Setting up the environment requires complex seed phrase management and synchronization between the test runner and the browser extension.
- **Slow Execution:** Waiting for wallet animations, block confirmations, and network switching drastically slows down test suites.

## Proposed Solution: The Virtual E2E Connector

The solution is a **"Man-in-the-Middle" injected provider** that sits between the DApp and the network. Instead of interacting with a real wallet extension, the DApp interacts with our custom provider which implements the standard EIP-1193 interface.

This provider functions as a traffic controller:

1. **Read operations** (`eth_call`, `eth_getBalance`, etc.)

   → Forwarded directly to **Anvil RPC**

2. **Write operations** (`eth_sendTransaction`, `eth_sign`, etc.)

   → Routed to **Signing / Impersonation logic**, then forwarded to **Anvil RPC**

This keeps **100% chain realism**, while maintaining **full control** in tests.

## Advantages

1. **Incredible Test Speed:** Test execution becomes dramatically faster since there's no browser extension overhead, RPC latency is controlled, and wallet interactions are fully virtualized.
2. **Framework Agnostic:** Works with Cypress, Playwright, Selenium, or any tool that can intercept network traffic.
3. **Zero External Dependencies:** Built entirely on `viem` types and native `fetch`. No heavy peer dependencies.
4. **Total Control:** We can simulate edge cases that are hard to reproduce with real wallets (e.g., RPC errors, specific error codes, delayed signatures, chain switching failures).
5. **CI/CD Friendly:** Runs effortlessly in headless browsers (Docker containers).

### Architecture Diagram

```text
DApp UI
  |- Read  -> Custom Provider -> Anvil RPC
  |          (eth_call, eth_getBalance, ...)
  |
  `- Write -> Custom Provider -> Sign/Impersonation logic -> Anvil RPC
             (eth_sendTx, eth_sign, ...)
```

## Implementation Details

### The Traffic Splitter

The core logic resides in a Proxy Provider that inspects the RPC method.

```javascript
// lib/e2e-connector/provider.ts

const READ_METHODS = [
  "eth_call",
  "eth_getBalance",
  "eth_blockNumber",
  "eth_getTransactionReceipt",
  "eth_getLogs",
  // ...
];

export function createE2EProvider(config: E2EConnectorConfig) {
  return {
    async request({ method, params }) {
      // READ → Anvil
      if (READ_METHODS.includes(method)) {
        return fetch(config.rpcUrl, {
          method: "POST",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params,
          }),
        })
          .then((res) => res.json())
          .then((r) => r.result);
      }

      // WRITE → Sign locally, then send to Anvil
      return handleWrite(method, params, config);
    },
  };
}
```

### Signing / Impersonation Logic

```javascript
// lib/e2e-connector/sign.ts

import { createWalletClient, http } from "viem";

export async function handleWrite(method, params, config) {
  const client = createWalletClient({
    transport: http(config.rpcUrl),
    chain: config.chain,
    account: config.account, // private key or impersonated account
  });

  switch (method) {
    case "eth_sendTransaction":
      return client.sendTransaction(params[0]);

    case "eth_sign":
    case "personal_sign":
      return client.signMessage({
        message: params[0],
      });

    default:
      throw new Error(`Unsupported method: ${method}`);
  }
}
```

### Integration with Wagmi/Viem

The solution uses a standard Wagmi Connector factory, making it "Plug and Play". The DApp does not need to change its code logic, only its configuration

```javascript
// src/config/wagmiConfig.ts

const isE2E = process.env.CI === "true";

export const config = createConfig({
  connectors: isE2E
    ? [
        e2eConnector({
          rpcUrl: "http://127.0.0.1:8545", // Anvil
          account: TEST_PRIVATE_KEY, // or impersonated
          chain: mainnetFork,
        }),
      ]
    : [
        /* real wallets */
      ],
});
```

## Final Result

You now have:

- A **real blockchain**
- A **virtual wallet**
- A **deterministic environment**
- A **super-fast E2E stack**
- And **zero dependency on Metamask or fake endpoints**

This is as close as you can get to **production behavior** with **testing-level control**.
