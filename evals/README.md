# Eval Harness

Eval cases live in `evals/suites/*.jsonl`. Each line is one JSON object:

```json
{
  "id": "repo_package_manager",
  "suite": "smoke",
  "input": "Which package manager does this repo use?",
  "expected": {
    "includes": ["pnpm"],
    "excludes": ["npm install"],
    "toolCalls": []
  },
  "mock": {
    "output": "This repo uses pnpm."
  },
  "tags": ["repo"]
}
```

Run the lightweight deterministic suite:

```bash
pnpm eval:smoke
```

Run against the live agent/model:

```bash
pnpm eval -- --suite smoke --provider live --commit HEAD
```

Reports are written to `evals/reports/<suite>.md` and `evals/reports/<suite>.json`.
