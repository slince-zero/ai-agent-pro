import { z } from "zod";
import type { AppTool } from "./types.js";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_TEXT_CHARS = 30_000;

const webFetchSchema = z
  .object({
    url: z.string().trim().url(),
  })
  .strict()
  .refine(
    (args) => {
      const protocol = new URL(args.url).protocol;
      return protocol === "http:" || protocol === "https:";
    },
    { message: "只支持 http 或 https URL。" },
  );

type WebFetchArgs = z.infer<typeof webFetchSchema>;

function isSupportedContentType(contentType: string) {
  const normalized = contentType.toLowerCase();

  return (
    normalized.startsWith("text/") ||
    normalized.includes("application/json") ||
    normalized.includes("application/xml") ||
    normalized.includes("application/xhtml+xml")
  );
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return "";

  return normalizeWhitespace(decodeHtmlEntities(match[1]));
}

function stripHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function toReadableText(raw: string, contentType: string) {
  const isHtml =
    contentType.toLowerCase().includes("html") || /<\/?[a-z][\s\S]*>/i.test(raw);
  const text = isHtml ? stripHtml(raw) : raw;

  return normalizeWhitespace(decodeHtmlEntities(text));
}

function truncateText(text: string) {
  if (text.length <= MAX_TEXT_CHARS) {
    return { text, truncated: false };
  }

  return {
    text: text.slice(0, MAX_TEXT_CHARS),
    truncated: true,
  };
}

export const webFetchTool: AppTool<WebFetchArgs> = {
  name: "web_fetch",
  description:
    "读取一个公开 http/https URL 的文本内容，用于分析技术文档、博客文章、网页说明或接口返回的文本。返回标题、状态码、content-type 和清洗后的正文预览；不要用于 GitHub 仓库元数据查询，GitHub 仓库概况优先使用 github_repository_lookup。",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "要读取的公开 http/https URL，例如 'https://example.com/docs'。",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  schema: webFetchSchema,
  async run(args) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(args.url, {
        headers: {
          Accept: "text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.1",
          "User-Agent": "ai-pro-agent",
        },
        signal: controller.signal,
      });
    } catch (error) {
      return JSON.stringify({
        error:
          (error as Error).name === "AbortError"
            ? `请求超时：超过 ${FETCH_TIMEOUT_MS / 1000} 秒未响应。`
            : `网络请求失败：${(error as Error).message}`,
        url: args.url,
      });
    } finally {
      clearTimeout(timeout);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const contentLength = Number(response.headers.get("content-length") ?? 0);

    if (!response.ok) {
      return JSON.stringify({
        error: `网页读取失败：HTTP ${response.status}`,
        url: args.url,
        final_url: response.url,
        status: response.status,
        content_type: contentType,
      });
    }

    if (contentLength > MAX_RESPONSE_BYTES) {
      return JSON.stringify({
        error: `响应内容过大：${contentLength} bytes，超过 ${MAX_RESPONSE_BYTES} bytes 限制。`,
        url: args.url,
        final_url: response.url,
        status: response.status,
        content_type: contentType,
      });
    }

    if (!isSupportedContentType(contentType)) {
      return JSON.stringify({
        error: "不支持读取该内容类型，当前工具只处理文本、HTML、JSON 或 XML。",
        url: args.url,
        final_url: response.url,
        status: response.status,
        content_type: contentType || "unknown",
      });
    }

    const raw = await response.text();
    const readableText = toReadableText(raw, contentType);
    const { text, truncated } = truncateText(readableText);

    return JSON.stringify(
      {
        url: args.url,
        final_url: response.url,
        status: response.status,
        content_type: contentType,
        title: extractTitle(raw),
        text,
        truncated,
      },
      null,
      2,
    );
  },
};
