# Runbook: switch on risk ratings and automatic scoring (staging)

| Field | Value |
|---|---|
| Decisions | O-12 approved **for staging** (owner, 2026-10-18); [ADR 0021](../adr/0021-automatic-scoring-and-second-ethereum-provider.md) accepted for staging |
| Who | The owner, in the Infura and Render dashboards |
| Needs first | The pull request with ADR 0021 merged, and the Render API redeployed from `main` |
| Cost | None. Infura's free plan needs no card. Do not add a payment method |

Never paste any key into chat, GitHub, or a file. It goes only into the Render setting box.

## Part 1: switch on ratings

1. Open dashboard.render.com and click the **API** service (`blacklist-staging-api`).
2. Click **Environment**.
3. Find `RISK_PUBLIC_BANDS`. Change its value to `true`, or add it with **Add Environment Variable** if it is missing.
4. Click **Save Changes**. Render redeploys the API by itself.

To switch ratings off again, set it back to `false`. Nothing is deleted either way.

## Part 2: create the free Infura key

1. Go to **infura.io** (it may open as "MetaMask Developer") and sign up with your email. Choose the **free** plan. If it asks for a card, stop and tell Claude.
2. After signing in, open the API key it creates for you (or click **Create new API key**).
3. In the key's settings, make sure **Ethereum → Mainnet** is ticked.
4. Copy the **API key** itself (a long string of letters and numbers). Copy the key, not the whole URL.

## Part 3: add the key to Render

1. In Render, open the **API** service again, then **Environment**.
2. Click **Add Environment Variable**:
   - Key: `INFURA_ETHEREUM_API_KEY`
   - Value: paste the key (on the computer, not retyped from a phone)
3. Click **Save Changes** and wait for the deploy to show **Live**.
4. Delete any copy of the key you made elsewhere.

## Part 4: check it works

1. Open the test site and search a well-known Ethereum address. The **Risk assessment** box should now show a band or **Not assessed**, instead of "Risk assessment is unavailable".
2. Under **Blockchain facts**, the source line should mention `agree` only on pages where an automatic check ran. Ordinary pages stay `single source`, which is expected.
3. If the API fails to start after adding the key, the logs show `Invalid configuration fields: INFURA_ETHEREUM_API_KEY`. The key was copied wrongly: paste it again.

## Provider limits

An Ethereum contract page makes roughly 30 provider requests:
- address, contract and token reads;
- the fake-token check;
- history and balances.

The defaults (`RPC_API_REQUESTS_PER_MINUTE=30`, `RPC_API_TOTAL_REQUEST_BUDGET=100` per 24 hours) are too low for that. When a limit is hit, sections show "unavailable".

For staging on the free plans, set these on the Render **API**:
- `RPC_API_REQUESTS_PER_MINUTE=120`
- `RPC_API_TOTAL_REQUEST_BUDGET=3000`

These are well inside the Alchemy and Infura free quotas. They are per key and per process, and reset every `RPC_API_BUDGET_WINDOW_HOURS` (24 by default) and on restart. Never add a payment method to raise them.

## What the automatic checks do

| Check | When it scores | Band it adds |
|---|---|---|
| Hijacked wallet (`eoa.delegated_to_flagged`) | The wallet has handed control (EIP-7702) to an address with a published **High** or **Severe** finding, and both providers agree | Moderate. The text says the owner is often a victim |
| Lookalike token (`token.symbol_impersonation`) | A token uses the symbol of a well-known token (USDT, USDC, DAI, WETH, WBTC, LINK, UNI, SHIB, PEPE, stETH, AAVE), including lookalike letters, at a different address, and both providers agree | Moderate |

An administrator can suppress either check on one address from the admin console, with a public reason.
