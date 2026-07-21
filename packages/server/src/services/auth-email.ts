import { createHash } from 'node:crypto'

import type { TransactionalEmail } from './transactional-email.js'

function actionUrl(appURL: string, action: string, token?: string) {
  const url = new URL(appURL)
  url.search = ''
  url.hash = ''
  const params = new URLSearchParams({ auth_action: action })

  if (token) {
    params.set('token', token)
    url.hash = params.toString()
  } else {
    url.search = params.toString()
  }

  return url.toString()
}

function idempotencyKey(kind: string, token: string) {
  const digest = createHash('sha256').update(token).digest('hex')
  return `auth-${kind}-${digest}`
}

function linkHtml(title: string, description: string, label: string, url: string) {
  const escapedUrl = url.replaceAll('&', '&amp;').replaceAll('"', '&quot;')

  return [
    '<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#222">',
    `<h1 style="font-size:20px">${title}</h1>`,
    `<p>${description}</p>`,
    `<p><a href="${escapedUrl}" style="color:#087f5b">${label}</a></p>`,
    '<p style="color:#666;font-size:13px">如果不是你本人发起，请忽略此邮件。</p>',
    '</body></html>',
  ].join('')
}

export function emailVerificationCallbackUrl(appURL: string, success: boolean) {
  return actionUrl(appURL, success ? 'email-verified' : 'email-verification-error')
}

export function emailVerificationUrl(baseURL: string, appURL: string, token: string) {
  const url = new URL('/api/auth/verify-email', baseURL)
  url.searchParams.set('token', token)
  url.searchParams.set('callbackURL', emailVerificationCallbackUrl(appURL, true))
  return url.toString()
}

export function passwordResetUrl(appURL: string, token: string) {
  return actionUrl(appURL, 'reset-password', token)
}

export function emailVerificationMessage(options: {
  to: string
  url: string
  token: string
}): TransactionalEmail {
  return {
    to: options.to,
    subject: '验证你的 AI Engineering Agent 邮箱',
    text: `请在 30 分钟内验证邮箱：${options.url}\n\n如果不是你本人发起，请忽略此邮件。`,
    html: linkHtml('验证邮箱', '请在 30 分钟内完成邮箱验证。', '验证邮箱', options.url),
    idempotencyKey: idempotencyKey('verify-email', options.token),
  }
}

export function passwordResetMessage(options: {
  to: string
  url: string
  token: string
}): TransactionalEmail {
  return {
    to: options.to,
    subject: '重置你的 AI Engineering Agent 密码',
    text: `请在 15 分钟内重置密码：${options.url}\n\n如果不是你本人发起，请忽略此邮件。`,
    html: linkHtml('重置密码', '请在 15 分钟内设置新密码。', '重置密码', options.url),
    idempotencyKey: idempotencyKey('reset-password', options.token),
  }
}
