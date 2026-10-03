# Learning-first collaboration rules

This repository exists to help the owner learn AI and Agent engineering by building a
context-centered retrieval agent from first principles.

## Default AI role

- Start with questions, decomposition, hints, documentation pointers, and review.
- Do not implement a complete core learning step before the owner has written a first attempt.
- Core learning steps are the model client, search and page-reading tools, Agent loop, context
  selection, evidence handling, and retrieval logic.
- The owner may explicitly request implementation. Keep it to one issue and one learning concept.
- Never add an Agent framework to avoid implementing the raw protocol and loop.
- The product surface is the web chat: a React client and an Express server streaming NDJSON
  (see `docs/decisions/0002-web-chat-surface.md`). Do not add authentication, a database, queues,
  payment, MCP, plugins, Memory, or multi-Agent behavior unless a concrete product need is
  established.

## Where things live

- `packages/server/src/agent.ts`: the loop, its system prompt, and tool budgets.
- `packages/server/src/context/retrieval-ledger.ts`: citation numbers and context projection.
- `packages/server/src/retrieval/`: intent schema, extraction, update, seed queries.
- `packages/server/src/tools/`: `search` and `read_page` (Tavily) and the dispatcher.
- `packages/server/src/util.ts`: `agentLimits`, the single place for rounds and budgets.
- `packages/server/src/deepseek-client.ts`: the DeepSeek client and the one model name.
- `packages/server/src/evals/`: eval cases, scorers, and the runner (`docs/evals.md`).
- `docs/product-plan.md`: stages, acceptance criteria, and current status.

## Pull requests

- One issue maps to one PR.
- Keep the core change small enough to explain line by line.
- Every capability PR must state its hypothesis, boundary, tests, observed failure, and result.
- A PR is incomplete if the owner cannot explain the request and data flow without reading code.
- Run `pnpm typecheck`, `pnpm test`, `pnpm lint:ci`, and `pnpm build` before publishing. CI runs
  the same four gates.
- Behavior changes ship with tests that use injected fakes. `pnpm test` must never call a real
  model or search provider.

## Evals

- `pnpm eval` calls the real DeepSeek and Tavily APIs. It is not part of CI and never gates a
  merge by itself.
- A PR that changes a system prompt, a tool description, `agentLimits`, intent extraction, or
  context projection runs the affected suites and pastes the summary into its result section,
  next to the previous baseline from `docs/evals.md`.
- When a real failure is observed, first add an eval case that reproduces it, then fix it.
- Do not edit a case's expectations just to make a failing run pass. Change the case only when its
  match fragments were too narrow; otherwise the failure is the finding.
- Update the baseline table in `docs/evals.md` when a change moves it.

## Repository operations

- Do not use `git push`; publish branches and commits through the GitHub API.
- Prefix shell commands with `rtk`.
- Do not rewrite or delete the `v1-ai-generated` tag.
