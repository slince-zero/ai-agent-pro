import path from "node:path";
import cors from "cors";
import express from "express";
import { createChatRouter } from "./routes/chat.js";
import { createSessionsRouter } from "./routes/sessions.js";
import { createOpenAIClient } from "./services/openai.js";

export function createApp() {
  const app = express();
  const openai = createOpenAIClient();

  app.use(
    cors({
      origin: process.env.NODE_ENV === "production" ? false : true,
    }),
  );

  app.use(express.json());
  app.use("/api/chat", createChatRouter({ openai }));
  app.use("/api/sessions", createSessionsRouter({ openai }));

  if (process.env.NODE_ENV === "production") {
    const clientDistPath =
      process.env.CLIENT_DIST_DIR || path.join(process.cwd(), "public");

    app.use(express.static(clientDistPath));
    app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(clientDistPath, "index.html"));
    });
  }

  return app;
}
