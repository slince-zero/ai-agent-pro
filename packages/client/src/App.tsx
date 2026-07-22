import { lazy, Suspense } from 'react'

import { getAuthAction } from '@/lib/auth'

const AgentApp = lazy(() => import('@/components/workspace/agent-app'))
const PublicSite = lazy(() => import('@/components/public/public-site'))

function RouteLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f5f7f4] text-sm text-[#5d665f]">
      <span
        className="size-[18px] animate-spin rounded-full border-2 border-[#bac2bc] border-t-[#07845d] motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="sr-only">Loading</span>
    </main>
  )
}

export default function App() {
  const authAction = getAuthAction()
  const path = window.location.pathname
  const opensWorkspace = path === '/app' || path.startsWith('/app/') || authAction !== null

  return (
    <Suspense fallback={<RouteLoading />}>
      {opensWorkspace ? <AgentApp /> : <PublicSite path={path} />}
    </Suspense>
  )
}
