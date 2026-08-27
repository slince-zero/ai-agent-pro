import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { IconGallery } from './IconGallery'
import './tailwind.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

/** 访问 /?icons 打开图标与动效总览，用于设计走查 */
const showGallery = new URLSearchParams(window.location.search).has('icons')

createRoot(rootElement).render(
  <React.StrictMode>{showGallery ? <IconGallery /> : <App />}</React.StrictMode>,
)
