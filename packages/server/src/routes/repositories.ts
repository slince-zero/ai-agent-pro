import { Router } from 'express'
import { z } from 'zod'

import { sendApiError } from '../middleware/api-error.js'
import { type GitHubRepoIndexer, createGitHubRepoIndexer } from '../services/github-repo-indexer.js'

const repositoryPathPart = z.string().regex(/^[A-Za-z0-9_.-]+$/)
const indexRepositorySchema = z
  .object({
    url: z.string().trim().url().max(2_048),
    branch: z.string().trim().min(1).max(255).optional(),
  })
  .strict()

type RepositoriesRouterDeps = {
  indexer?: GitHubRepoIndexer
}

export function parsePublicGitHubRepositoryUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol !== 'https:') return null
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null

  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length !== 2) return null

  const owner = parts[0]
  const repo = parts[1]?.replace(/\.git$/i, '')
  if (!owner || !repo) return null
  if (!repositoryPathPart.safeParse(owner).success || !repositoryPathPart.safeParse(repo).success) {
    return null
  }

  return { owner, repo }
}

function indexingError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('Private GitHub repositories')) {
    return {
      status: 422,
      code: 'PRIVATE_REPOSITORY_NOT_SUPPORTED',
      message: '当前仅支持公开 GitHub 仓库',
    }
  }
  if (message.includes('HTTP 404')) {
    return { status: 404, code: 'REPOSITORY_NOT_FOUND', message: '仓库不存在或不是公开仓库' }
  }
  if (message.includes('HTTP 403')) {
    return {
      status: 429,
      code: 'GITHUB_RATE_LIMITED',
      message: 'GitHub API 限流，请稍后重试或配置 GITHUB_TOKEN',
    }
  }
  return { status: 502, code: 'REPOSITORY_INDEX_FAILED', message: '仓库索引失败' }
}

export function createRepositoriesRouter({
  indexer = createGitHubRepoIndexer(),
}: RepositoriesRouterDeps = {}) {
  const router = Router()

  router.post('/index', async (req, res) => {
    const parsed = indexRepositorySchema.safeParse(req.body)
    if (!parsed.success) {
      return sendApiError(req, res, 422, 'VALIDATION_ERROR', '仓库参数无效')
    }

    const repository = parsePublicGitHubRepositoryUrl(parsed.data.url)
    if (!repository) {
      return sendApiError(
        req,
        res,
        422,
        'INVALID_GITHUB_REPOSITORY_URL',
        '请输入公开 GitHub 仓库地址',
      )
    }

    try {
      const result = await indexer.indexRepository({
        userId: req.auth.user.id,
        owner: repository.owner,
        repo: repository.repo,
        branch: parsed.data.branch,
      })

      res.status(201).json({ repository: result })
    } catch (error) {
      const apiError = indexingError(error)
      req.log.error({ err: error, repository }, '仓库索引失败')
      sendApiError(req, res, apiError.status, apiError.code, apiError.message)
    }
  })

  return router
}
