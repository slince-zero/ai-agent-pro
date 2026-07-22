import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolvePublicContact, resolvePublicRoute } from './public-site.ts'

test('maps public paths without treating unknown or app paths as marketing pages', () => {
  assert.equal(resolvePublicRoute('/'), 'home')
  assert.equal(resolvePublicRoute('/privacy/'), 'privacy')
  assert.equal(resolvePublicRoute('/app'), 'not-found')
  assert.equal(resolvePublicRoute('/missing'), 'not-found')
})

test('uses a configured support email and otherwise falls back to public support', () => {
  assert.deepEqual(resolvePublicContact(' support@example.com '), {
    href: 'mailto:support@example.com',
    label: 'support@example.com',
    email: 'support@example.com',
  })
  assert.equal(resolvePublicContact('invalid').email, null)
  assert.match(resolvePublicContact(undefined).href, /github\.com/)
})
