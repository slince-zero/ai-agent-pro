import { ChevronUp, LoaderCircle, LogOut, UserRound } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { AuthUser } from '@/lib/auth'
import { cn } from '@/lib/utils'

type AccountMenuProps = {
  compact?: boolean
  onSignOut: () => Promise<void>
  user: AuthUser
}

export function AccountMenu({ compact = false, onSignOut, user }: AccountMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState('')
  const initial = user.name.trim().charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()

  const handleSignOut = async () => {
    setIsSigningOut(true)
    setError('')

    try {
      await onSignOut()
      detailsRef.current?.removeAttribute('open')
    } catch {
      setError('退出失败，请重试。')
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <details className="group/account relative" ref={detailsRef}>
      <summary
        className={cn(
          'hover:bg-accent focus-visible:ring-ring flex cursor-pointer list-none items-center outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden',
          compact
            ? 'size-9 justify-center rounded-md border bg-background'
            : 'w-full gap-2 rounded-lg px-2 py-1.5',
        )}
        title={compact ? '账户' : undefined}
      >
        <span className="bg-foreground text-background flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
          {initial || <UserRound className="size-4" aria-hidden="true" />}
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="text-muted-foreground block truncate text-xs">{user.email}</span>
            </span>
            <ChevronUp
              className="text-muted-foreground size-4 transition-transform group-open/account:rotate-180"
              aria-hidden="true"
            />
          </>
        )}
        {compact && <span className="sr-only">打开账户菜单</span>}
      </summary>

      <div
        className={cn(
          'bg-popover text-popover-foreground absolute z-50 w-64 rounded-lg border p-2 shadow-lg',
          compact ? 'right-0 top-11' : 'bottom-12 left-0',
        )}
      >
        <div className="border-b px-2 py-2">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">{user.email}</p>
        </div>
        <Button
          className="mt-1 w-full justify-start"
          disabled={isSigningOut}
          onClick={() => void handleSignOut()}
          type="button"
          variant="ghost"
        >
          {isSigningOut ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="size-4" aria-hidden="true" />
          )}
          {isSigningOut ? '正在退出' : '退出登录'}
        </Button>
        {error && (
          <p className="text-destructive px-2 pt-2 pb-1 text-xs" aria-live="polite">
            {error}
          </p>
        )}
      </div>
    </details>
  )
}
