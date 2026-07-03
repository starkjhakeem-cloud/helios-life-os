# HELIOS V4.5 / V5 Financial Services Architecture

Date: 2026-07-03  
Status: Architecture only  
Scope: Future financial awareness layer; no runtime implementation in this phase

## Purpose

HELIOS Financial Services is a secure, read-only financial intelligence source.
It is not a banking app, payment system, trading interface, or budgeting
spreadsheet.

The system exists so HELIOS can understand financial context when producing:

- Daily Brief
- Today's Flow
- Recommendation Engine
- Build My Day
- Assistant answers
- Long-term planning

The user remains in control of all money movement. HELIOS can observe, explain,
prioritize, and recommend. It cannot execute financial actions.

## Non-Goals

Financial Services must not include:

- Payments
- Money transfers
- Bill pay execution
- Asset purchases
- Trades
- Account modification
- Card controls
- Loan applications
- Financial institution write actions
- Automated movement of funds

Recommendations may say "consider transferring surplus to savings" or "pay the
card before tomorrow," but execution always happens through the user's financial
institution.

## Core Principles

- Secure by default
- Read-only by default
- Optional and user-controlled
- Least-privilege access
- Prompt-safe summaries for AI
- Transparent about what HELIOS can see
- Explicit consent before connecting providers
- No account numbers, card numbers, passwords, provider secrets, or access tokens
  in API responses, logs, notifications, prompts, or mobile state

## Provider Abstraction

Provider-specific code should be isolated behind a replaceable adapter boundary.
The rest of HELIOS should consume normalized financial context, not Plaid/MX/etc.
objects directly.

Future provider candidates:

- Plaid
- MX
- Finicity
- Yodlee
- Apple Wallet
- Credit Karma
- Manual account support

```ts
type FinancialProvider =
  | "plaid"
  | "mx"
  | "finicity"
  | "yodlee"
  | "apple_wallet"
  | "credit_karma"
  | "manual";

type FinancialProviderCapability =
  | "accounts"
  | "balances"
  | "transactions"
  | "liabilities"
  | "investments"
  | "income"
  | "subscriptions";

interface FinancialProviderAdapter {
  provider: FinancialProvider;
  capabilities: FinancialProviderCapability[];
  createConnectSession(userId: string): Promise<ConnectSession>;
  exchangePublicToken(userId: string, payload: unknown): Promise<ConnectedFinancialInstitution>;
  refreshConnection(userId: string, connectionId: string): Promise<void>;
  syncProfile(userId: string, connectionId: string): Promise<FinancialProfileSnapshot>;
  disconnect(userId: string, connectionId: string): Promise<void>;
}
```

The adapter contract is intentionally read-oriented. It does not expose transfer,
payment, trading, or account mutation methods.

## Financial Profile Model

Financial data should normalize into a profile object that can be summarized for
intelligence consumers.

```ts
type FinancialProfile = {
  accounts: Account[];
  subscriptions: Subscription[];
  recurringBills: Bill[];
  income: Income[];
  debts: Debt[];
  investments: Investment[];
  goals: FinancialGoal[];
};
```

Recommended normalized entities:

```ts
type Account = {
  id: string;
  userId: string;
  providerConnectionId: string;
  institutionName: string;
  displayName: string;
  accountType: "checking" | "savings" | "credit_card" | "investment" | "retirement" | "loan" | "mortgage" | "student_loan" | "cash" | "wallet";
  balanceCurrent: number | null;
  balanceAvailable: number | null;
  currency: string;
  maskedIdentifier?: string | null; // last4 only, never full account/card number
  status: "active" | "needs_attention" | "disconnected" | "error";
  lastSyncedAt: string | null;
};

type Subscription = {
  id: string;
  merchantName: string;
  amount: number;
  currency: string;
  cadence: "weekly" | "monthly" | "quarterly" | "annual" | "unknown";
  nextExpectedDate: string | null;
  previousAmount?: number | null;
  amountChanged?: boolean;
};

type Bill = {
  id: string;
  billerName: string;
  amountDue: number | null;
  dueDate: string;
  accountId?: string | null;
  status: "upcoming" | "due_soon" | "overdue" | "paid" | "unknown";
};

type Income = {
  id: string;
  sourceName: string;
  amount: number;
  currency: string;
  receivedAt: string;
  recurring: boolean;
};

type Debt = {
  id: string;
  accountId: string;
  displayName: string;
  balance: number | null;
  apr?: number | null;
  minimumPayment?: number | null;
  nextPaymentDue?: string | null;
};

type Investment = {
  id: string;
  accountId: string;
  displayName: string;
  allocationCategory: "cash" | "stocks" | "bonds" | "funds" | "crypto" | "other";
  marketValue: number | null;
  currency: string;
};

type FinancialGoal = {
  id: string;
  title: string;
  goalType: "emergency_fund" | "savings" | "debt_payoff" | "retirement" | "custom";
  targetAmount: number;
  currentAmount: number;
  targetDate?: string | null;
};
```

## Storage Design

Future tables should separate provider connections, normalized financial facts,
insights, and goals. Token material must stay in the connection table only and
must never be joined into normal response models.

Suggested future tables:

- `financial_connections`
- `financial_accounts`
- `financial_transactions`
- `financial_subscriptions`
- `financial_bills`
- `financial_income_events`
- `financial_debts`
- `financial_investments`
- `financial_goals`
- `financial_insights`

Security rules:

- Store provider tokens encrypted at rest using the same encrypted-token pattern
  established by `user_integrations`.
- Store only provider IDs required for sync and reconciliation.
- Store masked identifiers only when needed for user clarity.
- Do not store account numbers, routing numbers, full PANs, CVVs, passwords, or
  raw credentials.
- Apply user-scoped queries everywhere.
- Redact financial payloads from logs.
- Never return token fields through API schemas.

## Read-Only Mode

Financial Services should expose only read operations:

- Connect provider
- Refresh/sync read-only data
- List safe account summaries
- List bills/subscriptions/income/debt/investment summaries
- Generate insights
- Disconnect provider

Any action that moves money should be represented as a recommendation only:

```ts
type FinancialRecommendation = {
  id: string;
  title: string;
  description: string;
  insightType: "bill_due" | "cash_flow" | "subscription_change" | "savings_progress" | "debt_priority" | "spending_trend" | "investment_summary";
  urgency: "low" | "medium" | "high" | "critical";
  impact: "low" | "medium" | "high";
  readOnly: true;
  action: {
    label: string;
    route?: "/(tabs)/finance" | null;
    externalInstitutionRequired: true;
  };
};
```

No financial recommendation should contain an operation such as
`transfer_money`, `pay_bill`, `execute_trade`, or `modify_account`.

## Intelligence Context Package

Financial Services should feed HELIOS intelligence through a compact,
prompt-safe context package rather than raw transaction dumps.

```ts
type FinancialContextPackage = {
  source: "financial_services";
  connected: boolean;
  lastSyncedAt: string | null;
  accountsSummary: {
    cashAvailable?: number | null;
    creditUtilization?: number | null;
    debtTotal?: number | null;
    investmentTotal?: number | null;
    netWorthEstimate?: number | null;
  };
  upcomingBills: Array<{
    billerName: string;
    amountDue: number | null;
    dueDate: string;
    urgency: "low" | "medium" | "high" | "critical";
  }>;
  subscriptions: Array<{
    merchantName: string;
    amount: number;
    cadence: string;
    amountChanged: boolean;
  }>;
  incomeSignals: Array<{
    sourceName: string;
    amount: number;
    receivedAt: string;
  }>;
  insights: FinancialInsight[];
  recommendations: FinancialRecommendation[];
  warnings: string[];
};
```

This package is the only financial shape that Daily Brief, Priority Engine,
Build My Day, and Assistant should consume.

## Consumer Integration

### Daily Brief

Daily Brief may include:

- Payment due tomorrow
- Income deposited today
- Spending higher than usual
- Subscription amount increased
- Emergency fund reached target
- Credit utilization elevated

Daily Brief must avoid:

- Full account identifiers
- Full transaction lists
- Provider secrets
- Alarmist language when confidence is low

### Recommendation Engine

`PriorityEngine` should accept a future `financial_context` input and use it as
one signal among goals, tasks, calendar, email, memory, habits, and awareness.

Examples:

- Prioritize "review credit card payment" when due soon.
- Avoid recommending expensive discretionary actions during low-cash periods.
- Suggest subscription review when recurring costs changed.
- Prefer high-interest debt payoff recommendations over low-impact spending.
- Nudge savings contribution when cash flow surplus is detected.

All outputs remain recommendations. The action route can open a future Financial
section or a task creation flow, but it must not execute a bank action.

### Build My Day

Build My Day can schedule financial review blocks:

- Pay utility bill through provider app
- Review unusual transaction
- Review subscription renewal
- Prepare monthly financial review
- Check debt payoff progress

These blocks should be informational or task-like. They should never be payment
or transfer operations.

### Assistant

Assistant should answer financial awareness questions using the prompt-safe
context package:

- "How much have I spent eating out this month?"
- "When is my next credit card payment?"
- "What subscriptions increased?"
- "Did I receive my paycheck?"
- "Which recurring bills are coming up?"
- "How much progress have I made toward my savings goal?"

Assistant should refuse or redirect write-action requests:

- "Transfer $500 to savings" -> "I can help you plan it, but you need to make
  the transfer through your bank."
- "Buy stock" -> "I can summarize context, but I cannot execute trades."

## Future API Boundaries

Suggested future endpoints:

```text
GET  /api/v1/financial/status
GET  /api/v1/financial/connect-url?provider=plaid
POST /api/v1/financial/exchange
POST /api/v1/financial/sync
GET  /api/v1/financial/profile
GET  /api/v1/financial/context
GET  /api/v1/financial/insights
DELETE /api/v1/financial/connections/{id}
```

No endpoint should use verbs like `pay`, `transfer`, `trade`, `buy`, `sell`, or
`move-funds`.

## Future Mobile Surface

A future Financial section can appear under More / Command Center and eventually
as a deeper section if usage warrants it.

Suggested sections:

- Accounts
- Cash Flow
- Subscriptions
- Bills
- Investments
- Goals
- Insights
- Reports

The initial UI should clearly label Financial Services as read-only:

> HELIOS can read financial context you approve. HELIOS cannot move money,
> make payments, or trade assets.

## Privacy and Consent UX

Before connecting a provider, the user should see:

- Provider name
- Data categories requested
- What HELIOS can see
- What HELIOS cannot do
- Last sync behavior
- Disconnect behavior

Suggested copy:

> HELIOS uses read-only financial context to improve planning and
> recommendations. HELIOS cannot transfer money, make payments, purchase assets,
> execute trades, or modify your accounts.

## Insight Generation

Financial insights should be deterministic before becoming AI-enriched.

V4.5 deterministic insight candidates:

- Bill due within 48 hours
- Income deposit detected
- Subscription amount changed
- Credit utilization above threshold
- Spending category above recent baseline
- Emergency fund goal progress reached milestone
- High-interest debt requires attention

V5 AI-enriched insight candidates:

- Cash-flow forecast explanation
- Debt payoff scenario summary
- Subscription optimization suggestions
- Savings plan coaching
- Retirement projection summaries
- Credit health insight summaries

AI enrichment must consume summarized context only, not raw account payloads.

## Security Review Checklist

Before implementation:

- Provider scopes are read-only.
- No write-capable provider scopes are requested.
- Provider tokens are encrypted before storage.
- API schemas never include encrypted token fields.
- Logs redact provider payloads and identifiers.
- Account/card numbers are never stored or displayed.
- Only masked identifiers or user-chosen labels appear in UI.
- Financial context package excludes raw transaction IDs unless needed for
  internal traceability.
- Assistant prompt context uses summaries, not full transaction history.
- Disconnect deletes or deactivates provider tokens.
- Sync failure puts connection in `needs_attention`, not a crash state.

## Validation Plan

Architecture validation:

- Provider abstraction has no write-action methods.
- Financial recommendations are typed as `readOnly: true`.
- Priority Engine consumes only `FinancialContextPackage`, not provider payloads.
- Daily Brief uses insight summaries only.
- Assistant receives prompt-safe context only.
- No direct banking actions are present in route names, service methods, action
  operations, or UI labels.

Future implementation tests:

- Plaid/MX adapter contract tests with fixture payloads.
- Token encryption and redaction tests.
- User-scoped financial data isolation tests.
- Daily Brief includes due-bill insight without exposing account identifiers.
- Priority Engine downgrades discretionary recommendations during low-cash periods.
- Assistant refuses transfer/trade/payment execution requests.
- Build My Day creates review tasks, not bank actions.

## Phasing

### V4.5 Architecture Foundation

- Add provider abstraction interfaces.
- Add data model and migration plan.
- Add security review checklist.
- Add no-write-action contract tests before provider implementation.
- Add Command Center "Finance - Coming in V5" copy only.

### V5 Read-Only Provider Integration

- Implement one provider adapter behind feature flags.
- Add encrypted connection storage.
- Add read-only sync jobs.
- Add normalized Financial Profile.
- Add Financial Context Package.
- Integrate package into Daily Brief, Priority Engine, Build My Day, and
  Assistant.

### V5+ Intelligence Expansion

- Cash-flow forecasting.
- Savings planning.
- Debt payoff projections.
- Investment allocation summaries.
- Subscription optimization.
- Financial AI coaching.
- Credit health insights.

## Open Questions

- First provider: Plaid, MX, Finicity, or manual read-only accounts?
- Retention policy for transactions and insights.
- Whether to store transaction-level data or derive summaries during sync and
  discard raw rows.
- Whether financial goals should be separate from HELIOS goals or linked to
  existing goals.
- Which thresholds should be user-configurable.

## Success Criteria

HELIOS Financial Services is successful when it behaves like a trusted financial
awareness layer:

- Users understand exactly what HELIOS can see.
- Users understand HELIOS cannot move money.
- Financial context improves planning, briefings, and recommendations.
- Sensitive identifiers and tokens never reach prompts, logs, UI responses, or
  mobile state.
- The architecture can swap providers without changing intelligence consumers.
