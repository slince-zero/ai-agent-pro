import { escapeHtml, formatDate } from "../utils/html.js";
import type { AppTool } from "./types.js";

type GitHubRepoRef = {
  owner: string;
  repo: string;
  url: string;
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

type GitHubRepoSummary = {
  defaultBranch: string;
  description: string;
  forks: number;
  fullName: string;
  homepage: string;
  language: string;
  license: string;
  openIssues: number;
  pushedAt: string;
  stars: number;
  topics: string[];
  updatedAt: string;
  url: string;
};

const githubRepoPattern =
  /(?:https?:\/\/(?:www\.)?github\.com\/[^\s<>()]+|git@github\.com:[^\s<>()]+)/i;

function normalizeRepoName(repo: string) {
  return repo.replace(/\.git$/i, "");
}

export function parseGitHubRepoUrl(input: string): GitHubRepoRef | null {
  const match = input.match(githubRepoPattern);
  if (!match) return null;

  const rawUrl = match[0].replace(/[.,;!?]+$/g, "");

  if (rawUrl.startsWith("git@github.com:")) {
    const [owner, repo] = rawUrl
      .replace("git@github.com:", "")
      .split("/")
      .filter(Boolean);

    if (!owner || !repo) return null;

    return {
      owner,
      repo: normalizeRepoName(repo),
      url: `https://github.com/${owner}/${normalizeRepoName(repo)}`,
    };
  }

  try {
    const url = new URL(rawUrl);
    const [owner, repo] = url.pathname.split("/").filter(Boolean);

    if (!owner || !repo) return null;

    return {
      owner,
      repo: normalizeRepoName(repo),
      url: `https://github.com/${owner}/${normalizeRepoName(repo)}`,
    };
  } catch {
    return null;
  }
}

function toStringValue(value: unknown, fallback = "未知") {
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

async function fetchGitHubRepo(ref: GitHubRepoRef): Promise<GitHubRepoSummary> {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
        "User-Agent": "ai-pro-agent",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub API 请求失败：${response.status}`);
  }

  const data = (await response.json()) as GitHubRepoApiResponse;

  return {
    defaultBranch: toStringValue(data.default_branch),
    description: toStringValue(data.description, "暂无描述"),
    forks: toNumberValue(data.forks_count),
    fullName: toStringValue(data.full_name, `${ref.owner}/${ref.repo}`),
    homepage: toStringValue(data.homepage, ""),
    language: toStringValue(data.language),
    license: toStringValue(data.license?.spdx_id),
    openIssues: toNumberValue(data.open_issues_count),
    pushedAt: toStringValue(data.pushed_at),
    stars: toNumberValue(data.stargazers_count),
    topics: toTopics(data.topics),
    updatedAt: toStringValue(data.updated_at),
    url: toStringValue(data.html_url, ref.url),
  };
}

function renderGitHubRepoHtml(repo: GitHubRepoSummary) {
  const topics =
    repo.topics.length > 0
      ? `<p>${repo.topics.map((topic) => `<code>${escapeHtml(topic)}</code>`).join(" ")}</p>`
      : "";

  return [
    `<h2>GitHub 仓库概览</h2>`,
    `<p><strong><a href="${escapeHtml(repo.url)}" rel="noreferrer">${escapeHtml(repo.fullName)}</a></strong></p>`,
    `<p>${escapeHtml(repo.description)}</p>`,
    `<table><tbody>`,
    `<tr><th>Stars</th><td>${repo.stars.toLocaleString("zh-CN")}</td></tr>`,
    `<tr><th>Forks</th><td>${repo.forks.toLocaleString("zh-CN")}</td></tr>`,
    `<tr><th>Open Issues</th><td>${repo.openIssues.toLocaleString("zh-CN")}</td></tr>`,
    `<tr><th>主要语言</th><td>${escapeHtml(repo.language)}</td></tr>`,
    `<tr><th>默认分支</th><td><code>${escapeHtml(repo.defaultBranch)}</code></td></tr>`,
    `<tr><th>许可证</th><td>${escapeHtml(repo.license)}</td></tr>`,
    `<tr><th>最近更新</th><td>${escapeHtml(formatDate(repo.updatedAt))}</td></tr>`,
    `<tr><th>最近推送</th><td>${escapeHtml(formatDate(repo.pushedAt))}</td></tr>`,
    repo.homepage
      ? `<tr><th>Homepage</th><td><a href="${escapeHtml(repo.homepage)}" rel="noreferrer">${escapeHtml(repo.homepage)}</a></td></tr>`
      : "",
    `</tbody></table>`,
    topics,
  ].join("");
}

function getGitHubErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.startsWith("GitHub API 请求失败：404")) {
    return "没有找到这个 GitHub 仓库，请确认链接是否正确，或仓库是否为公开仓库。";
  }

  if (error instanceof Error && error.message.startsWith("GitHub API 请求失败：")) {
    return `${error.message}，可以稍后重试，或检查是否触发了 GitHub API 限流。`;
  }

  return "连接 GitHub API 超时或失败，请确认当前网络能访问 api.github.com 后重试。";
}

function renderGitHubRepoErrorHtml(ref: GitHubRepoRef, error: unknown) {
  return [
    `<h2>GitHub 仓库读取失败</h2>`,
    `<p>${escapeHtml(getGitHubErrorMessage(error))}</p>`,
    `<p>仓库链接：<a href="${escapeHtml(ref.url)}" rel="noreferrer">${escapeHtml(ref.url)}</a></p>`,
  ].join("");
}

export const githubRepoTool: AppTool = {
  name: "github_repository_lookup",
  description: "读取公开 GitHub 仓库的基础信息。",
  canHandle: (input) => parseGitHubRepoUrl(input) !== null,
  async run({ input }) {
    const ref = parseGitHubRepoUrl(input);
    if (!ref) {
      throw new Error("没有找到有效的 GitHub 仓库链接");
    }

    try {
      const repo = await fetchGitHubRepo(ref);

      return {
        html: renderGitHubRepoHtml(repo),
      };
    } catch (error) {
      console.error("GitHub 仓库工具错误：", error);

      return {
        html: renderGitHubRepoErrorHtml(ref, error),
      };
    }
  },
};
