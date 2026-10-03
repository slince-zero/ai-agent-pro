# 0002: Web chat surface, DeepSeek over the OpenAI SDK, Tavily for retrieval

## Status

Accepted. Recorded on 2026-10-01 from decisions already in the code; the code came first.

## Context

ADR 0001 reset the project to a minimal TypeScript CLI and left several choices open
(`docs/product-plan.md` §7): the search source, the model, how pages are read, and how results are
shown. Since then the code has settled each of them without a record:

- `cd2e696` (2026-08-19) connected a React client to an Express server;
- `864078f` (2026-08-28) replaced the search stub with Tavily;
- the loop streams from `deepseek-v4-flash` with thinking enabled.

## Decision

- **Surface**: a web chat. The React client consumes an NDJSON stream from
  `POST /api/questions/stream`. The CLI from ADR 0001 is gone. The event types in
  `packages/shared/type.ts` are the contract between the two sides.
- **Model**: one model, `deepseek-v4-flash`, called through the `openai` SDK with DeepSeek's base
  URL. The loop streams with thinking enabled, because the reasoning is shown in the UI and must be
  sent back with tool calls. Intent extraction is non-streaming JSON mode with thinking disabled.
  The SDK is a transport, not a framework: the loop, tool protocol, and context are still written
  by hand.
- **Search and page reading**: Tavily Search and Tavily Extract behind the `search` and
  `read_page` tool contracts. One provider for both keeps credentials and failure modes in one
  place.
- **Results**: links plus evidence held in the server's ledger; no page snapshots are stored.

## Consequences

- Running the product needs two keys, `OPENAI_API_KEY` (DeepSeek) and `TAVILY_API_KEY`.
- Page-reading limits (robots, paywalls, content types) are Tavily's, not ours. Our own limits are
  the timeouts, the 20 000-character body cap, and the context budget in `agentLimits`.
- Changing the model means one constant in `deepseek-client.ts`, plus a full `pnpm eval` run to
  compare against the baseline.
- The plan's stage 1 ("plain `fetch`, non-streaming, no SDK") is superseded by this record.
