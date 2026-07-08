import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertSafeLocalDatabaseReset,
  formatDatabaseResetTarget,
  parseDatabaseResetTarget,
} from './local-reset-guard.js'

test('accepts confirmed local PostgreSQL database URLs', () => {
  const target = assertSafeLocalDatabaseReset(
    'postgresql://ai_agent:secret@localhost:5432/ai_pro_agent',
    {
      confirm: true,
      nodeEnv: 'development',
    },
  )

  assert.deepEqual(target, {
    protocol: 'postgresql:',
    hostname: 'localhost',
    port: '5432',
    database: 'ai_pro_agent',
    username: 'ai_agent',
  })
  assert.equal(
    formatDatabaseResetTarget(target),
    'postgresql://ai_agent@localhost:5432/ai_pro_agent',
  )
})

test('requires the explicit reset confirmation flag by default', () => {
  assert.throws(
    () =>
      assertSafeLocalDatabaseReset('postgresql://ai_agent:secret@localhost:5432/ai_pro_agent', {
        nodeEnv: 'development',
      }),
    /--confirm-local-reset/,
  )
})

test('rejects production resets', () => {
  assert.throws(
    () =>
      assertSafeLocalDatabaseReset('postgresql://ai_agent:secret@localhost:5432/ai_pro_agent', {
        confirm: true,
        nodeEnv: 'production',
      }),
    /NODE_ENV=production/,
  )
})

test('rejects non-local hosts unless explicitly allowed', () => {
  assert.throws(
    () =>
      assertSafeLocalDatabaseReset(
        'postgresql://ai_agent:secret@db.example.com:5432/ai_pro_agent',
        {
          confirm: true,
          nodeEnv: 'development',
        },
      ),
    /non-local database host/,
  )

  assert.equal(
    assertSafeLocalDatabaseReset('postgresql://ai_agent:secret@db.example.com:5432/ai_pro_agent', {
      allowNonLocal: true,
      confirm: true,
      nodeEnv: 'development',
    }).hostname,
    'db.example.com',
  )
})

test('rejects missing names and system databases', () => {
  assert.throws(() => parseDatabaseResetTarget('postgresql://localhost:5432'), /database name/)
  assert.throws(
    () =>
      assertSafeLocalDatabaseReset('postgresql://postgres:secret@localhost:5432/postgres', {
        confirm: true,
        nodeEnv: 'development',
      }),
    /system database/,
  )
})
