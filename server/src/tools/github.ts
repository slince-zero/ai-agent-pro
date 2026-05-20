import type { AppTool } from "./types.js";

type GitHubRepoLookupArgs = {
  owner?: string;
  repo?: string;
  url?: string;
};

type GitHubRepoApiResponse = {
  default_branch?: unknown;
  description?: unknown;
  forks_count?: unknown;
  full_name?: unknown;
  homepage?: unknown;
  html_url?: unknown;
  language?: unknown;
  license?: { spdx_id?: unknown } | null;
  open_issues_count?: unknown;
  pushed_at?: unknown;
  stargazers_count?: unknown;
  topics?: unknown;
  updated_at?: unknown;
};

const githubRepoPattern =
  /(?:https?:\/\/(?:www\.)?github\.com\/[^\s<>()]+|git@github\.com:[^\s<>()]+)/i;

function normalizeRepoName(repo: string) {
  return repo.replace(/\.git$/i, "");
}

function parseGitHubRepoUrl(input: string) {
  const match = input.match(githubRepoPattern);
  if (!match) return null;

  const rawUrl = match[0].replace(/[.,;!?]+$/g, "");

  if (rawUrl.startsWith("git@github.com:")) {
    const [owner, repo] = rawUrl
      .replace("git@github.com:", "")
      .split("/")
      .filter(Boolean);
    if (!owner || !repo) return null;
    return { owner, repo: normalizeRepoName(repo) };
  }

  try {
    const url = new URL(rawUrl);
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repo) return null;
    return { owner, repo: normalizeRepoName(repo) };
  } catch {
    return null;
  }
}

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function toNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toTopics(value: unknown) {
  return Array.isArray(value)
    ? value.filter((topic): topic is string => typeof topic === "string")
    : [];
}

function resolveRef(args: GitHubRepoLookupArgs) {
  if (args.owner && args.repo) {
    return { owner: args.owner, repo: normalizeRepoName(args.repo) };
  }
  if (args.url) {
    return parseGitHubRepoUrl(args.url);
  }
  return null;
}

export const githubRepoTool: AppTool<GitHubRepoLookupArgs> = {
  name: "github_repository_lookup",
  description:
    "查询单个公开 GitHub 仓库的元数据：描述、stars、forks、open issues、主要语言、默认分支、最近更新、最近推送、许可证、homepage、topics。当用户提到 GitHub 仓库链接、想要某个仓库的概况或对比多个仓库时调用。每次只查询一个仓库，需要查询多个时分别多次调用。",
  parameters: {
    type: "object",
    properties: {
      owner: {
        type: "string",
        description: "GitHub 组织或用户名，例如 'vercel'。优先使用 owner+repo。",
      },
      repo: {
        type: "string",
        description: "仓库名，例如 'next.js'，不要带 .git 后缀。",
      },
      url: {
        type: "string",
        description:
          "完整的 GitHub 仓库 URL，例如 'https://github.com/vercel/next.js'。当无法直接拆分 owner/repo 时使用。",
      },
    },
    additionalProperties: false,
  },
  async run(args) {
    const ref = resolveRef(args);
    if (!ref) {
      return JSON.stringify({
        error:
          "缺少有效的仓库定位参数：请同时提供 owner 和 repo，或提供完整的 url。",
      });
    }

    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(
      ref.owner,
    )}/${encodeURIComponent(ref.repo)}`;

    let response: Response;
    try {
      response = await fetch(apiUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
          "User-Agent": "ai-pro-agent",
        },
      });
    } catch (error) {
      return JSON.stringify({
        error: `网络请求失败：${(error as Error).message}`,
        owner: ref.owner,
        repo: ref.repo,
      });
    }

    if (response.status === 404) {
      return JSON.stringify({
        error: `仓库 ${ref.owner}/${ref.repo} 不存在或非公开仓库。`,
      });
    }

    if (!response.ok) {
      return JSON.stringify({
        error: `GitHub API 请求失败：HTTP ${response.status}`,
        hint:
          response.status === 403
            ? "可能触发了未认证 API 限流，可配置 GITHUB_TOKEN 后重试。"
            : undefined,
      });
    }

    const data = (await response.json()) as GitHubRepoApiResponse;

    return JSON.stringify(
      {
        full_name: toStringValue(data.full_name, `${ref.owner}/${ref.repo}`),
        url: toStringValue(
          data.html_url,
          `https://github.com/${ref.owner}/${ref.repo}`,
        ),
        description: toStringValue(data.description, ""),
        stars: toNumberValue(data.stargazers_count),
        forks: toNumberValue(data.forks_count),
        open_issues: toNumberValue(data.open_issues_count),
        language: toStringValue(data.language, ""),
        default_branch: toStringValue(data.default_branch, ""),
        license: toStringValue(data.license?.spdx_id, ""),
        homepage: toStringValue(data.homepage, ""),
        updated_at: toStringValue(data.updated_at, ""),
        pushed_at: toStringValue(data.pushed_at, ""),
        topics: toTopics(data.topics),
      },
      null,
      2,
    );
  },
};
