export type PublicRoute =
  | 'home'
  | 'pricing'
  | 'terms'
  | 'privacy'
  | 'refund'
  | 'contact'
  | 'not-found'

const PUBLIC_ROUTES: Record<string, PublicRoute> = {
  '/': 'home',
  '/pricing': 'pricing',
  '/terms': 'terms',
  '/privacy': 'privacy',
  '/refund': 'refund',
  '/contact': 'contact',
}

const REPOSITORY_URL = 'https://github.com/slince-zero/ai-agent-pro'

export function resolvePublicRoute(path: string): PublicRoute {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path
  return PUBLIC_ROUTES[normalized] ?? 'not-found'
}

export function resolvePublicContact(value: string | undefined) {
  const email = value?.trim()
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      href: `mailto:${email}`,
      label: email,
      email,
    }
  }

  return {
    href: `${REPOSITORY_URL}/issues`,
    label: 'GitHub support',
    email: null,
  }
}

type OptionalViteEnv = ImportMeta & {
  env?: {
    VITE_PUBLIC_SUPPORT_EMAIL?: string
  }
}

const viteEnv = (import.meta as OptionalViteEnv).env

export const publicContact = resolvePublicContact(viteEnv?.VITE_PUBLIC_SUPPORT_EMAIL)
export const repositoryUrl = REPOSITORY_URL
