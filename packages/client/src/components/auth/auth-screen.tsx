import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Send,
  UserRound,
} from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import type { AuthenticationResult } from '@/hooks/use-auth'
import {
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  validateAuthFields,
  validateEmail,
  validateNewPassword,
  type AuthAction,
  type AuthFieldErrors,
  type AuthFields,
  type AuthMode,
} from '@/lib/auth'
import { cn } from '@/lib/utils'

type AuthScreenProps = {
  initialAction?: AuthAction | null
  onAuthenticate: (mode: AuthMode, fields: AuthFields) => Promise<AuthenticationResult>
  onDismissAction?: () => void
  onSessionInvalidated?: () => void
}

type AuthView =
  | AuthMode
  | 'forgot-password'
  | 'recovery-sent'
  | 'verification-pending'
  | 'reset-password'
  | 'reset-password-error'
  | 'reset-success'
  | 'email-verified'
  | 'email-verification-error'

const emptyFields: AuthFields = {
  name: '',
  email: '',
  password: '',
}

function initialView(action: AuthAction | null | undefined): AuthView {
  return action?.type ?? 'sign-in'
}

export function AuthScreen({
  initialAction,
  onAuthenticate,
  onDismissAction,
  onSessionInvalidated,
}: AuthScreenProps) {
  const [view, setView] = useState<AuthView>(() => initialView(initialAction))
  const [fields, setFields] = useState(emptyFields)
  const [confirmation, setConfirmation] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [errors, setErrors] = useState<AuthFieldErrors>({})
  const [requestError, setRequestError] = useState('')
  const [notice, setNotice] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!initialAction || typeof window === 'undefined') return
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.hash}`,
    )
  }, [initialAction])

  const selectView = (nextView: AuthView) => {
    if (isSubmitting) return
    setView(nextView)
    setErrors({})
    setRequestError('')
    setNotice('')
    setShowPassword(false)
  }

  const returnToSignIn = () => {
    onDismissAction?.()
    selectView('sign-in')
  }

  const updateField = (field: keyof AuthFields, value: string) => {
    setFields((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setRequestError('')
  }

  const submitCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (view !== 'sign-in' && view !== 'sign-up') return

    const nextErrors = validateAuthFields(view, fields)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setIsSubmitting(true)
    setRequestError('')

    try {
      const result = await onAuthenticate(view, fields)
      if (result.status === 'verification-required') {
        setPendingEmail(result.email)
        selectView('verification-pending')
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '认证请求失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const error = validateEmail(fields.email)
    if (error) {
      setErrors({ email: error })
      return
    }

    setIsSubmitting(true)
    setRequestError('')
    try {
      await requestPasswordReset(fields.email)
      selectView('recovery-sent')
    } catch (requestFailure) {
      setRequestError(
        requestFailure instanceof Error ? requestFailure.message : '请求失败，请稍后重试。',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const resendVerification = async () => {
    if (!pendingEmail) return
    setIsSubmitting(true)
    setRequestError('')
    setNotice('')
    try {
      await resendVerificationEmail(pendingEmail)
      setNotice('如果该账户需要验证，新的验证邮件已发送。')
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '发送失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitNewPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const passwordError = validateNewPassword(fields.password, confirmation)
    if (passwordError) {
      setErrors({ password: passwordError })
      return
    }

    if (initialAction?.type !== 'reset-password') {
      selectView('reset-password-error')
      return
    }

    setIsSubmitting(true)
    setRequestError('')
    try {
      await resetPassword(initialAction.token, fields.password)
      onSessionInvalidated?.()
      selectView('reset-success')
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '密码重置失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isCredentialView = view === 'sign-in' || view === 'sign-up'

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
          {isCredentialView && (
            <CredentialForm
              errors={errors}
              fields={fields}
              isSubmitting={isSubmitting}
              mode={view}
              onForgotPassword={() => selectView('forgot-password')}
              onSelectMode={(mode) => selectView(mode)}
              onSubmit={submitCredentials}
              onTogglePassword={() => setShowPassword((current) => !current)}
              onUpdateField={updateField}
              requestError={requestError}
              showPassword={showPassword}
            />
          )}

          {view === 'forgot-password' && (
            <form noValidate onSubmit={(event) => void submitRecovery(event)}>
              <BackButton onClick={returnToSignIn} />
              <AuthHeading
                title="找回密码"
                description="输入注册邮箱，我们会发送一个限时重置链接。"
              />
              <div className="mt-7">
                <AuthField
                  autoComplete="email"
                  error={errors.email}
                  icon={<Mail className="size-4" aria-hidden="true" />}
                  id="recovery-email"
                  inputMode="email"
                  label="邮箱"
                  onChange={(value) => updateField('email', value)}
                  type="email"
                  value={fields.email}
                />
              </div>
              <RequestMessage error={requestError} />
              <SubmitButton isSubmitting={isSubmitting} label="发送重置邮件" />
            </form>
          )}

          {view === 'reset-password' && (
            <form noValidate onSubmit={(event) => void submitNewPassword(event)}>
              <AuthHeading
                title="设置新密码"
                description="提交后，当前账户的所有旧会话都会失效。"
              />
              <div className="mt-7 space-y-1">
                <AuthField
                  autoComplete="new-password"
                  error={errors.password}
                  icon={<LockKeyhole className="size-4" aria-hidden="true" />}
                  id="new-password"
                  label="新密码"
                  onChange={(value) => updateField('password', value)}
                  type="password"
                  value={fields.password}
                />
                <AuthField
                  autoComplete="new-password"
                  icon={<LockKeyhole className="size-4" aria-hidden="true" />}
                  id="confirm-password"
                  label="确认新密码"
                  onChange={(value) => {
                    setConfirmation(value)
                    setErrors((current) => ({ ...current, password: undefined }))
                    setRequestError('')
                  }}
                  type="password"
                  value={confirmation}
                />
              </div>
              <RequestMessage error={requestError} />
              <SubmitButton isSubmitting={isSubmitting} label="重置密码" />
            </form>
          )}

          {view === 'verification-pending' && (
            <StatusPanel
              icon={<Mail className="size-6" aria-hidden="true" />}
              title="检查你的邮箱"
              description="验证链接将在 30 分钟后失效。完成验证后即可登录。"
            >
              <p className="text-foreground mt-4 text-sm font-medium break-all">{pendingEmail}</p>
              <RequestMessage error={requestError} notice={notice} />
              <Button
                className="h-11 w-full rounded-lg"
                disabled={isSubmitting}
                onClick={() => void resendVerification()}
                type="button"
              >
                {isSubmitting ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="size-4" aria-hidden="true" />
                )}
                {isSubmitting ? '正在发送' : '重新发送验证邮件'}
              </Button>
              <Button className="mt-3 h-10 w-full" onClick={returnToSignIn} variant="ghost">
                返回登录
              </Button>
            </StatusPanel>
          )}

          {view === 'recovery-sent' && (
            <StatusPanel
              icon={<Mail className="size-6" aria-hidden="true" />}
              title="检查你的邮箱"
              description="如果该邮箱对应一个账户，我们已经发送了 15 分钟有效的重置链接。"
            >
              <Button className="mt-7 h-11 w-full rounded-lg" onClick={returnToSignIn}>
                返回登录
              </Button>
            </StatusPanel>
          )}

          {(view === 'email-verified' || view === 'reset-success') && (
            <StatusPanel
              icon={<CheckCircle2 className="size-6" aria-hidden="true" />}
              tone="success"
              title={view === 'email-verified' ? '邮箱验证完成' : '密码已重置'}
              description={
                view === 'email-verified'
                  ? '你的账户现已激活，可以使用邮箱和密码登录。'
                  : '所有旧会话已失效，请使用新密码重新登录。'
              }
            >
              <Button className="mt-7 h-11 w-full rounded-lg" onClick={returnToSignIn}>
                前往登录
              </Button>
            </StatusPanel>
          )}

          {(view === 'email-verification-error' || view === 'reset-password-error') && (
            <StatusPanel
              icon={<CircleAlert className="size-6" aria-hidden="true" />}
              tone="error"
              title="链接无效或已过期"
              description={
                view === 'email-verification-error'
                  ? '请返回登录页，使用你的邮箱重新发送验证邮件。'
                  : '请重新发起找回密码请求，使用最新邮件中的链接。'
              }
            >
              <Button className="mt-7 h-11 w-full rounded-lg" onClick={returnToSignIn}>
                返回登录
              </Button>
            </StatusPanel>
          )}
        </div>
      </section>
    </main>
  )
}

type CredentialFormProps = {
  errors: AuthFieldErrors
  fields: AuthFields
  isSubmitting: boolean
  mode: AuthMode
  onForgotPassword: () => void
  onSelectMode: (mode: AuthMode) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onTogglePassword: () => void
  onUpdateField: (field: keyof AuthFields, value: string) => void
  requestError: string
  showPassword: boolean
}

function CredentialForm({
  errors,
  fields,
  isSubmitting,
  mode,
  onForgotPassword,
  onSelectMode,
  onSubmit,
  onTogglePassword,
  onUpdateField,
  requestError,
  showPassword,
}: CredentialFormProps) {
  return (
    <>
      <div className="bg-muted grid grid-cols-2 rounded-lg p-1" aria-label="账户操作" role="group">
        {(['sign-in', 'sign-up'] as const).map((item) => (
          <button
            className={cn(
              'h-9 rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              mode === item ? 'bg-background shadow-xs' : 'text-muted-foreground',
            )}
            aria-pressed={mode === item}
            key={item}
            onClick={() => onSelectMode(item)}
            type="button"
          >
            {item === 'sign-in' ? '登录' : '注册'}
          </button>
        ))}
      </div>

      <AuthHeading
        title={mode === 'sign-in' ? '欢迎回来' : '创建账户'}
        description={mode === 'sign-in' ? '登录后进入个人工作台。' : '注册后验证邮箱以激活账户。'}
      />

      <form className="mt-7 space-y-1" noValidate onSubmit={(event) => void onSubmit(event)}>
        {mode === 'sign-up' && (
          <AuthField
            autoComplete="name"
            error={errors.name}
            icon={<UserRound className="size-4" aria-hidden="true" />}
            id="auth-name"
            label="称呼"
            onChange={(value) => onUpdateField('name', value)}
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
          onChange={(value) => onUpdateField('email', value)}
          type="email"
          value={fields.email}
        />

        <AuthField
          action={
            <button
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-9 items-center justify-center rounded-md outline-none focus-visible:ring-2"
              onClick={onTogglePassword}
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
          onChange={(value) => onUpdateField('password', value)}
          type={showPassword ? 'text' : 'password'}
          value={fields.password}
        />

        {mode === 'sign-in' && (
          <div className="flex justify-end pb-1">
            <button
              className="text-primary focus-visible:ring-ring text-sm font-medium hover:underline focus-visible:ring-2"
              onClick={onForgotPassword}
              type="button"
            >
              忘记密码？
            </button>
          </div>
        )}

        <RequestMessage error={requestError} />
        <SubmitButton
          isSubmitting={isSubmitting}
          label={mode === 'sign-in' ? '登录' : '创建账户'}
        />
      </form>
    </>
  )
}

function AuthHeading({ description, title }: { description: string; title: string }) {
  return (
    <div className="mt-8">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">{description}</p>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button className="-ml-3" onClick={onClick} size="sm" type="button" variant="ghost">
      <ArrowLeft className="size-4" aria-hidden="true" />
      返回登录
    </Button>
  )
}

function SubmitButton({ isSubmitting, label }: { isSubmitting: boolean; label: string }) {
  return (
    <Button className="h-11 w-full rounded-lg" disabled={isSubmitting} type="submit">
      {isSubmitting && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {isSubmitting ? '正在提交' : label}
    </Button>
  )
}

function RequestMessage({ error, notice }: { error?: string; notice?: string }) {
  return (
    <div className="min-h-9 py-2" aria-live="polite">
      {error && <p className="text-destructive text-sm">{error}</p>}
      {notice && <p className="text-primary text-sm">{notice}</p>}
    </div>
  )
}

function StatusPanel({
  children,
  description,
  icon,
  title,
  tone = 'neutral',
}: {
  children: ReactNode
  description: string
  icon: ReactNode
  title: string
  tone?: 'neutral' | 'success' | 'error'
}) {
  return (
    <div>
      <span
        className={cn(
          'bg-muted text-foreground flex size-12 items-center justify-center rounded-lg',
          tone === 'success' && 'bg-primary/10 text-primary',
          tone === 'error' && 'bg-destructive/10 text-destructive',
        )}
      >
        {icon}
      </span>
      <AuthHeading title={title} description={description} />
      {children}
    </div>
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
