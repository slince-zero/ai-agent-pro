import React, { Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { Landing } from './landing'
import './tailwind.css'

/**
 * 路由：/ 是 landing，/app 是对话界面，/?icons 是设计走查用的图标总览。
 *
 * 对话界面和图标总览都用 lazy 拆包：landing 是首屏入口，
 * 不应该为了它下载 react-markdown、remark-gfm 这些只有对话才用到的依赖。
 */
const App = lazy(async () => ({ default: (await import('./App')).App }))
const IconGallery = lazy(async () => ({ default: (await import('./IconGallery')).IconGallery }))

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

function resolveRoute() {
  if (new URLSearchParams(window.location.search).has('icons')) return <IconGallery />

  return window.location.pathname.startsWith('/app') ? <App /> : <Landing />
}

createRoot(rootElement).render(
  <React.StrictMode>
    <Suspense fallback={<div className="paper-grid h-svh" />}>{resolveRoute()}</Suspense>
  </React.StrictMode>,
)
