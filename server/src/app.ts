import cors from "cors";
import express from "express";
import { createChatRouter } from "./routes/chat.js";
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

  return app;
}
