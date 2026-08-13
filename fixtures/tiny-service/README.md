# Tiny Service

Tiny Service is a deterministic HTTP fixture used to evaluate repository understanding.

## Request flow

`src/index.ts` starts the Node.js HTTP server. It delegates every request to `src/app.ts`.
The request handler returns health information directly and reads user data from `src/users.ts`.
Runtime configuration is read in `src/config.ts`.

The fixture intentionally has no database, authentication, background jobs, or external API calls.
