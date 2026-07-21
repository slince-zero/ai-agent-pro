import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { AccountMenu } from './account-menu.tsx'
import { AuthLoading } from './auth-loading.tsx'
import { AuthScreen } from './auth-screen.tsx'

const authenticate = async () => ({ status: 'authenticated' as const })

test('renders an accessible email login entry without token storage controls', () => {
  const markup = renderToStaticMarkup(
    createElement(AuthScreen, {
      onAuthenticate: authenticate,
    }),
  )

  assert.match(markup, /登录/)
  assert.match(markup, /注册/)
  assert.match(markup, /autoComplete="email"/)
  assert.match(markup, /autoComplete="current-password"/)
  assert.doesNotMatch(markup, /token|localStorage/i)
})

test('renders verification and password reset link states', () => {
  const verifiedMarkup = renderToStaticMarkup(
    createElement(AuthScreen, {
      initialAction: { type: 'email-verified' },
      onAuthenticate: authenticate,
    }),
  )
  const resetMarkup = renderToStaticMarkup(
    createElement(AuthScreen, {
      initialAction: { type: 'reset-password', token: 'secret-token' },
      onAuthenticate: authenticate,
    }),
  )

  assert.match(verifiedMarkup, /邮箱验证完成/)
  assert.match(resetMarkup, /设置新密码/)
  assert.match(resetMarkup, /autoComplete="new-password"/)
  assert.doesNotMatch(resetMarkup, /secret-token/)
})

test('renders account identity and logout in the workspace menu', () => {
  const markup = renderToStaticMarkup(
    createElement(AccountMenu, {
      onSignOut: async () => undefined,
      user: {
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: false,
      },
    }),
  )

  assert.match(markup, /Test User/)
  assert.match(markup, /test@example.com/)
  assert.match(markup, /退出登录/)
})

test('renders a distinct startup session loading state', () => {
  const markup = renderToStaticMarkup(createElement(AuthLoading))

  assert.match(markup, /正在恢复会话/)
  assert.match(markup, /role="status"/)
})
