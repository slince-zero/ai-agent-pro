import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  validateAuthFields,
  type AuthFieldErrors,
  type AuthFields,
  type AuthMode,
} from '@/lib/auth'
import { cn } from '@/lib/utils'

type AuthScreenProps = {
  onAuthenticate: (mode: AuthMode, fields: AuthFields) => Promise<void>
}

const emptyFields: AuthFields = {
  name: '',
  email: '',
  password: '',
}

export function AuthScreen({ onAuthenticate }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [fields, setFields] = useState(emptyFields)
  const [errors, setErrors] = useState<AuthFieldErrors>({})
  const [requestError, setRequestError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectMode = (nextMode: AuthMode) => {
    if (isSubmitting) return
    setMode(nextMode)
    setErrors({})
    setRequestError('')
  }

  const updateField = (field: keyof AuthFields, value: string) => {
    setFields((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setRequestError('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validateAuthFields(mode, fields)

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setIsSubmitting(true)
    setRequestError('')

    try {
      await onAuthenticate(mode, fields)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '认证请求失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="bg-background text-foreground grid min-h-svh lg:grid-cols-[minmax(280px,0.78fr)_minmax(440px,1.22fr)]">
      <section className="bg-foreground text-background flex min-h-44 flex-col justify-between px-6 py-6 sm:px-10 lg:min-h-svh lg:px-12 lg:py-10">
        <div className="flex items-center gap-3">
          <span className="bg-primary flex size-9 items-center justify-center rounded-lg">
            <span className="font-mono text-sm font-semibold text-white">AI</span>
          </span>
          <span className="text-sm font-semibold">AI Engineering Agent</span>
        </div>

        <div className="max-w-md py-8 lg:py-0">
          <p className="text-background/60 font-mono text-xs">PERSONAL WORKSPACE</p>
          <h1 className="mt-3 text-3xl leading-tight font-semibold sm:text-4xl">
            继续你的工程工作
          </h1>
        </div>

        <p className="text-background/50 hidden text-xs lg:block">Private workspace</p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10 lg:py-16">
        <div className="w-full max-w-sm">
          <div
            className="bg-muted grid grid-cols-2 rounded-lg p-1"
            aria-label="账户操作"
            role="group"
          >
            <button
              className={cn(
                'h-9 rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                mode === 'sign-in' ? 'bg-background shadow-xs' : 'text-muted-foreground',
              )}
              aria-pressed={mode === 'sign-in'}
              onClick={() => selectMode('sign-in')}
              type="button"
            >
              登录
            </button>
            <button
              className={cn(
                'h-9 rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                mode === 'sign-up' ? 'bg-background shadow-xs' : 'text-muted-foreground',
              )}
              aria-pressed={mode === 'sign-up'}
              onClick={() => selectMode('sign-up')}
              type="button"
            >
              注册
            </button>
          </div>

          <div className="mt-8">
            <h2 className="text-2xl font-semibold">
              {mode === 'sign-in' ? '欢迎回来' : '创建账户'}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {mode === 'sign-in' ? '登录后进入个人工作台。' : '注册后直接进入个人工作台。'}
            </p>
          </div>

          <form className="mt-7 space-y-5" noValidate onSubmit={(event) => void submit(event)}>
            {mode === 'sign-up' && (
              <AuthField
                autoComplete="name"
                error={errors.name}
                icon={<UserRound className="size-4" aria-hidden="true" />}
                id="auth-name"
                label="称呼"
                onChange={(value) => updateField('name', value)}
                value={fields.name}
              />
            )}

            <AuthField
              autoComplete="email"
              error={errors.email}
              icon={<Mail className="size-4" aria-hidden="true" />}
              id="auth-email"
              inputMode="email"
              label="邮箱"
              onChange={(value) => updateField('email', value)}
              type="email"
              value={fields.email}
            />

            <AuthField
              action={
                <button
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-9 items-center justify-center rounded-md outline-none focus-visible:ring-2"
                  onClick={() => setShowPassword((current) => !current)}
                  title={showPassword ? '隐藏密码' : '显示密码'}
                  type="button"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                  <span className="sr-only">{showPassword ? '隐藏密码' : '显示密码'}</span>
                </button>
              }
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              error={errors.password}
              icon={<LockKeyhole className="size-4" aria-hidden="true" />}
              id="auth-password"
              label="密码"
              onChange={(value) => updateField('password', value)}
              type={showPassword ? 'text' : 'password'}
              value={fields.password}
            />

            <div className="min-h-5" aria-live="polite">
              {requestError && <p className="text-destructive text-sm">{requestError}</p>}
            </div>

            <Button className="h-11 w-full rounded-lg" disabled={isSubmitting} type="submit">
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {isSubmitting ? '正在提交' : mode === 'sign-in' ? '登录' : '创建账户'}
            </Button>
          </form>
        </div>
      </section>
    </main>
  )
}

type AuthFieldProps = {
  action?: ReactNode
  autoComplete: string
  error?: string
  icon: ReactNode
  id: string
  inputMode?: 'email'
  label: string
  onChange: (value: string) => void
  type?: 'email' | 'password' | 'text'
  value: string
}

function AuthField({
  action,
  autoComplete,
  error,
  icon,
  id,
  inputMode,
  label,
  onChange,
  type = 'text',
  value,
}: AuthFieldProps) {
  const errorId = `${id}-error`

  return (
    <div>
      <label className="mb-2 block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div
        className={cn(
          'bg-background flex h-11 items-center rounded-lg border px-3 transition-shadow focus-within:ring-2 focus-within:ring-ring/40',
          error && 'border-destructive',
        )}
      >
        <span className="text-muted-foreground mr-2">{icon}</span>
        <input
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          id={id}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          value={value}
        />
        {action}
      </div>
      <div className="min-h-5 pt-1" id={errorId}>
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>
    </div>
  )
}
