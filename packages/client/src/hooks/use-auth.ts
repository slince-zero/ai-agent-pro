import { useCallback, useEffect, useState } from 'react'

import { resetUnauthorizedNotification, setUnauthorizedHandler } from '@/lib/api'
import {
  getSession,
  invalidateSessionCache,
  signIn,
  signOut,
  signUp,
  AuthError,
  type AuthFields,
  type AuthMode,
  type AuthUser,
} from '@/lib/auth'

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: AuthUser }

export type AuthenticationResult =
  | { status: 'authenticated' }
  | { status: 'verification-required'; email: string }

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let active = true

    void getSession()
      .then((session) => {
        if (!active) return
        setState(
          session ? { status: 'authenticated', user: session.user } : { status: 'unauthenticated' },
        )
      })
      .catch(() => {
        if (active) setState({ status: 'unauthenticated' })
      })

    return () => {
      active = false
    }
  }, [])

  const expireSession = useCallback(() => {
    invalidateSessionCache()
    setState({ status: 'unauthenticated' })
  }, [])

  useEffect(() => setUnauthorizedHandler(expireSession), [expireSession])

  const authenticate = useCallback(
    async (mode: AuthMode, fields: AuthFields): Promise<AuthenticationResult> => {
      const email = fields.email.trim()

      if (mode === 'sign-up') {
        await signUp(fields.name, email, fields.password)
        setState({ status: 'unauthenticated' })
        return { status: 'verification-required', email }
      }

      let user: AuthUser
      try {
        user = await signIn(email, fields.password)
      } catch (error) {
        if (error instanceof AuthError && error.code === 'EMAIL_NOT_VERIFIED') {
          return { status: 'verification-required', email }
        }
        throw error
      }

      resetUnauthorizedNotification()
      setState({ status: 'authenticated', user })
      return { status: 'authenticated' }
    },
    [],
  )

  const endSession = useCallback(async () => {
    await signOut()
    setState({ status: 'unauthenticated' })
  }, [])

  return {
    state,
    authenticate,
    expireSession,
    signOut: endSession,
  }
}
