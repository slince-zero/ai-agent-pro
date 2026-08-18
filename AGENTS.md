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
- Do not add a web UI, authentication, a database, queues, payment, MCP, plugins, Memory, or
  multi-Agent behavior unless a concrete product need is established.

## Pull requests

- One issue maps to one PR.
- Keep the core change small enough to explain line by line.
- Every capability PR must state its hypothesis, boundary, tests, observed failure, and result.
- A PR is incomplete if the owner cannot explain the request and data flow without reading code.
- Run `pnpm typecheck`, `pnpm lint:ci`, and `pnpm build` before publishing.
- The first PR that introduces behavior must also introduce its tests, a `pnpm test` script, and a
  CI test step. Run that test gate for every later PR.

## Repository operations

- Do not use `git push`; publish branches and commits through the GitHub API.
- Prefix shell commands with `rtk`.
- Do not rewrite or delete the `v1-ai-generated` tag.
