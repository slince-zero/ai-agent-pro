import { useCallback, useEffect, useState } from 'react'

import { resetUnauthorizedNotification, setUnauthorizedHandler } from '@/lib/api'
import {
  getSession,
  invalidateSessionCache,
  signIn,
  signOut,
  signUp,
  type AuthUser,
} from '@/lib/auth'

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: AuthUser }

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
    async (
      mode: 'sign-in' | 'sign-up',
      fields: {
        name: string
        email: string
        password: string
      },
    ) => {
      const user =
        mode === 'sign-in'
          ? await signIn(fields.email, fields.password)
          : await signUp(fields.name, fields.email, fields.password)

      resetUnauthorizedNotification()
      setState({ status: 'authenticated', user })
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
    signOut: endSession,
  }
}
