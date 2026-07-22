import {
  ArrowRight,
  Braces,
  Check,
  CircleDollarSign,
  ExternalLink,
  FileSearch,
  GitFork,
  Mail,
  SquareTerminal,
  Workflow,
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

import {
  publicContact,
  repositoryUrl,
  resolvePublicRoute,
  type PublicRoute,
} from '@/lib/public-site'
import { cn } from '@/lib/utils'

type PublicSiteProps = {
  path: string
}

type Metadata = {
  title: string
  description: string
}

const metadata: Record<PublicRoute, Metadata> = {
  home: {
    title: 'AI Engineering Agent | A focused workspace for engineering work',
    description:
      'Research repositories, inspect code, trace tool calls, and turn engineering questions into grounded work.',
  },
  pricing: {
    title: 'Pricing | AI Engineering Agent',
    description:
      'AI Engineering Agent is available as a free public beta while paid plans are prepared.',
  },
  terms: {
    title: 'Terms of Service | AI Engineering Agent',
    description: 'Terms for using the AI Engineering Agent beta service.',
  },
  privacy: {
    title: 'Privacy Policy | AI Engineering Agent',
    description: 'How AI Engineering Agent handles account, workspace, and usage data.',
  },
  refund: {
    title: 'Refund Policy | AI Engineering Agent',
    description: 'Current billing and refund policy for the AI Engineering Agent beta.',
  },
  contact: {
    title: 'Contact | AI Engineering Agent',
    description: 'Contact the AI Engineering Agent operator for product and account support.',
  },
  'not-found': {
    title: 'Page not found | AI Engineering Agent',
    description: 'The requested AI Engineering Agent page could not be found.',
  },
}

const publicShellClass =
  'min-h-svh min-w-80 overflow-x-clip bg-[#f5f7f4] text-[#18201d] [&_*]:tracking-normal'
const kickerClass = 'm-0 font-mono text-xs font-bold text-[#056348] uppercase'
const sectionClass = 'w-full px-[6vw] py-28 max-[820px]:px-[22px] max-[820px]:py-[82px]'
const sectionHeadingClass =
  'mx-auto grid max-w-[1440px] items-start gap-10 [grid-template-columns:minmax(120px,0.36fr)_minmax(320px,1fr)_minmax(260px,0.65fr)] max-[1100px]:[grid-template-columns:minmax(110px,0.3fr)_minmax(320px,1fr)] max-[820px]:grid-cols-1 max-[820px]:gap-[18px]'
const sectionTitleClass = 'm-0 text-[40px] leading-[1.16] font-[690] max-[820px]:text-[32px]'
const sectionCopyClass = 'm-0 text-[15px] leading-7 text-[#5d665f]'
const enterClass =
  'motion-safe:starting:translate-y-[18px] motion-safe:starting:opacity-0 motion-safe:transition-[opacity,transform] motion-safe:duration-700 motion-safe:ease-out'
const buttonClass =
  'inline-flex min-h-[46px] items-center justify-center gap-[9px] rounded-md px-[18px] text-sm font-[680] transition-[transform,background,border-color] duration-150 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#07845d] motion-reduce:transition-none max-[520px]:min-h-11 max-[520px]:px-3.5 max-[520px]:text-[13px] [&_svg]:size-4'
const primaryButtonClass =
  'border border-[#056348] bg-[#07845d] text-white hover:bg-[#056348] focus-visible:bg-[#056348]'
const secondaryButtonClass =
  'border border-[#bac2bc] bg-white/70 text-[#18201d] hover:border-[#7f8982] hover:bg-white focus-visible:border-[#7f8982] focus-visible:bg-white'
const textLinkClass =
  'mt-[26px] inline-flex items-center gap-2 text-[13px] font-bold text-[#056348] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#07845d] [&_svg]:size-4'

function usePageMetadata(route: PublicRoute) {
  useEffect(() => {
    const page = metadata[route]
    document.title = page.title
    document.documentElement.lang = 'en'

    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    description?.setAttribute('content', page.description)
  }, [route])
}

export default function PublicSite({ path }: PublicSiteProps) {
  const route = resolvePublicRoute(path)
  usePageMetadata(route)

  if (route === 'home') return <HomePage />
  if (route === 'pricing') return <PricingPage />
  if (route === 'contact') return <ContactPage />
  if (route === 'terms') return <TermsPage />
  if (route === 'privacy') return <PrivacyPage />
  if (route === 'refund') return <RefundPage />
  return <NotFoundPage />
}

function ProductMark() {
  return (
    <span
      className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-[7px] bg-[#07845d] text-white max-[820px]:size-8 [&_svg]:size-[18px]"
      aria-hidden="true"
    >
      <SquareTerminal strokeWidth={1.8} />
    </span>
  )
}

function PublicHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <header
      className={cn(
        'relative z-20 grid min-h-[72px] w-full grid-cols-[minmax(210px,1fr)_auto_minmax(210px,1fr)] items-center border-b border-[#d8ddd8] bg-[rgba(245,247,244,0.96)] px-[4.5vw] max-[1100px]:grid-cols-[1fr_auto] max-[820px]:min-h-16 max-[820px]:px-5',
        overlay && 'absolute inset-x-0 top-0 border-[#18201d24] bg-transparent',
      )}
    >
      <a
        className="inline-flex min-w-0 items-center gap-2.5 justify-self-start text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#07845d] max-[820px]:text-[13px] max-[520px]:[&>span:last-child]:max-w-[118px] max-[520px]:[&>span:last-child]:leading-[1.15]"
        href="/"
        aria-label="AI Engineering Agent home"
      >
        <ProductMark />
        <span>AI Engineering Agent</span>
      </a>

      <nav
        className="flex items-center justify-center gap-[30px] text-[13px] text-[#4d5750] max-[1100px]:hidden [&_a]:transition-colors [&_a]:duration-150 [&_a]:hover:text-[#056348] [&_a]:focus-visible:text-[#056348] [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-2 [&_a]:focus-visible:outline-[#07845d]"
        aria-label="Primary navigation"
      >
        <a href="/#capabilities">Product</a>
        <a href="/#workflow">Workflow</a>
        <a href="/pricing">Pricing</a>
        <a href="/contact">Contact</a>
      </nav>

      <a
        className="inline-flex min-h-[38px] items-center gap-2 justify-self-end rounded-md border border-[#18201d] bg-[#18201d] px-3.5 text-[13px] font-[650] text-white transition-[background,transform] duration-150 hover:-translate-y-px hover:bg-[#303a35] focus-visible:-translate-y-px focus-visible:bg-[#303a35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#07845d] motion-reduce:transition-none max-[820px]:min-h-9 max-[820px]:px-3 max-[820px]:text-xs max-[520px]:w-10 max-[520px]:px-0 max-[820px]:[&_svg]:hidden"
        href="/app"
      >
        <span className="max-[520px]:hidden">Open workspace</span>
        <span className="hidden text-[11px] max-[520px]:inline">Open</span>
        <ArrowRight className="size-4" aria-hidden="true" />
      </a>
    </header>
  )
}

function HomePage() {
  return (
    <main className={publicShellClass}>
      <section className="group relative min-h-[min(760px,88svh)] overflow-hidden border-b border-[#d8ddd8] bg-[#e8ede9] max-[820px]:min-h-[88svh]">
        <PublicHeader overlay />
        <img
          className="absolute -right-[4%] -bottom-[8%] h-auto w-[min(1120px,79vw)] origin-right [transform:perspective(1600px)_rotateY(-2deg)_rotateX(1deg)] rounded-lg border border-[#18201d33] shadow-[0_30px_80px_rgba(24,32,29,0.18)] transition-[transform,box-shadow,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:[transform:perspective(1600px)_rotateY(0)_rotateX(0)_translateY(-4px)] group-hover:shadow-[0_36px_96px_rgba(24,32,29,0.23)] motion-reduce:transition-none max-[820px]:right-[-34%] max-[820px]:bottom-[-2%] max-[820px]:w-[145%] max-[820px]:[transform:none] max-[820px]:group-hover:[transform:translateY(-2px)] max-[520px]:right-[-47%] max-[520px]:bottom-[1%] max-[520px]:w-[178%] motion-safe:starting:translate-y-8 motion-safe:starting:opacity-0"
          src="/workspace-welcome.png"
          alt="AI Engineering Agent workspace showing repository research and engineering prompts"
          width="1200"
          height="813"
        />
        <div
          className="absolute inset-y-0 left-0 z-[2] w-[49%] border-r border-[#18201d14] bg-[rgba(245,247,244,0.97)] max-[1100px]:w-[55%] max-[820px]:inset-x-0 max-[820px]:top-0 max-[820px]:bottom-auto max-[820px]:h-[61%] max-[820px]:w-full max-[820px]:border-r-0 max-[820px]:border-b max-[520px]:h-[66%]"
          aria-hidden="true"
        />

        <div className="relative z-[4] flex min-h-[min(760px,88svh)] w-[43%] max-w-[650px] flex-col justify-center pt-[98px] pr-8 pb-[82px] pl-[6vw] max-[1100px]:w-1/2 max-[820px]:min-h-0 max-[820px]:w-full max-[820px]:max-w-[620px] max-[820px]:justify-start max-[820px]:px-[22px] max-[820px]:pt-28 max-[820px]:pb-6">
          <p className={cn(kickerClass, enterClass, 'delay-75')}>
            <span
              className="mr-[9px] inline-block size-[7px] rounded-full bg-[#bb5b3f]"
              aria-hidden="true"
            />
            Open beta
          </p>
          <h1
            className={cn(
              enterClass,
              'mt-[18px] mb-0 max-w-[610px] text-[64px] leading-[1.02] font-[720] delay-150 max-[1100px]:text-[52px] max-[820px]:mt-[13px] max-[820px]:max-w-[520px] max-[820px]:text-[43px] max-[520px]:text-[38px]',
            )}
          >
            AI Engineering Agent
          </h1>
          <p
            className={cn(
              enterClass,
              'mt-[22px] mb-0 max-w-[500px] text-lg leading-[1.65] text-[#4d5750] delay-200 max-[820px]:mt-4 max-[820px]:max-w-[480px] max-[820px]:text-base max-[820px]:leading-[1.55] max-[520px]:text-[15px]',
            )}
          >
            A focused workspace for repository research, code reasoning, and traceable agent work.
          </p>
          <div
            className={cn(
              enterClass,
              'mt-8 flex flex-wrap gap-2.5 delay-300 max-[820px]:mt-[22px]',
            )}
          >
            <a className={cn(buttonClass, primaryButtonClass)} href="/app">
              Start in the workspace
              <ArrowRight aria-hidden="true" />
            </a>
            <a className={cn(buttonClass, secondaryButtonClass)} href={repositoryUrl}>
              <GitFork aria-hidden="true" />
              View source
            </a>
          </div>
          <p
            className={cn(
              enterClass,
              'mt-[18px] mb-0 flex items-center gap-2 text-xs text-[#5d665f] delay-300 max-[820px]:mt-[13px]',
            )}
          >
            <span
              className="size-[7px] rounded-full bg-[#07845d] shadow-[0_0_0_4px_rgba(7,132,93,0.12)]"
              aria-hidden="true"
            />{' '}
            Free during beta. No payment details required.
          </p>
        </div>

        <a
          className="absolute bottom-[22px] left-[6vw] z-[4] flex items-center gap-3.5 text-[11px] font-[650] text-[#5d665f] uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#07845d] max-[820px]:hidden [&_span]:text-[17px] [&_span]:transition-transform [&_span]:duration-150 hover:[&_span]:translate-y-[3px] motion-reduce:[&_span]:transition-none"
          href="#capabilities"
        >
          Explore the product
          <span aria-hidden="true">↓</span>
        </a>
      </section>

      <section className={cn(sectionClass, 'bg-white')} id="capabilities">
        <div className={sectionHeadingClass}>
          <p className={kickerClass}>Built for engineering work</p>
          <h2 className={sectionTitleClass}>Move from a question to grounded work.</h2>
          <p className={cn(sectionCopyClass, 'max-[1100px]:col-start-2 max-[820px]:col-auto')}>
            The agent combines conversation, tools, retrieved context, and run traces in one working
            surface.
          </p>
        </div>

        <div className="mx-auto mt-[76px] grid max-w-[1440px] grid-cols-3 border-t border-[#d8ddd8] motion-safe:transition-opacity motion-safe:duration-700 max-[820px]:mt-[52px] max-[820px]:grid-cols-1 motion-safe:starting:opacity-0">
          <Capability
            icon={<FileSearch />}
            label="Research"
            title="Inspect repositories and source context"
            copy="Read GitHub metadata, index selected source files, retrieve relevant chunks, and keep citations attached to the answer."
          />
          <Capability
            divided
            icon={<Braces />}
            label="Reason"
            title="Work through code with bounded tools"
            copy="Fetch public references, execute small isolated snippets when enabled, and keep tool inputs and outputs visible."
          />
          <Capability
            divided
            icon={<Workflow />}
            label="Trace"
            title="See how each run was produced"
            copy="Review stages, tool calls, latency, token usage, cost, errors, and the final response from a single run record."
          />
        </div>
      </section>

      <section className={cn(sectionClass, 'bg-[#18201d] text-white')} id="workflow">
        <div className="mx-auto max-w-[1440px]">
          <div
            className={cn(
              sectionHeadingClass,
              '[grid-template-columns:minmax(160px,0.4fr)_minmax(320px,1fr)] motion-safe:starting:opacity-0 motion-safe:transition-opacity motion-safe:duration-700 max-[1100px]:[grid-template-columns:minmax(110px,0.3fr)_minmax(320px,1fr)] max-[820px]:grid-cols-1',
            )}
          >
            <p className={cn(kickerClass, 'text-[#74d1ad]')}>One continuous workflow</p>
            <h2 className={sectionTitleClass}>Context in. Evidence through. Answer out.</h2>
          </div>

          <ol className="mt-[76px] grid list-none grid-cols-3 border-t border-white/20 p-0 motion-safe:transition-opacity motion-safe:duration-700 max-[820px]:mt-[52px] max-[820px]:grid-cols-1 motion-safe:starting:opacity-0">
            <WorkflowStep
              number="01"
              title="Ask with context"
              copy="Start a session, attach the engineering goal, and choose a direct or multi-agent workflow."
            />
            <WorkflowStep
              divided
              number="02"
              title="Follow the run"
              copy="Tool activity and workflow stages stream into the same conversation while the run remains inspectable."
            />
            <WorkflowStep
              divided
              number="03"
              title="Keep the result"
              copy="Sessions, summaries, memories, citations, and run traces remain available for the next decision."
            />
          </ol>
        </div>
      </section>

      <section
        className={cn(
          sectionClass,
          'mx-auto grid max-w-[1580px] [grid-template-columns:minmax(300px,0.75fr)_minmax(380px,1fr)] gap-[10vw] bg-[#f5f7f4] max-[820px]:grid-cols-1 max-[820px]:gap-[52px]',
        )}
      >
        <div className="motion-safe:transition-opacity motion-safe:duration-700 motion-safe:starting:opacity-0">
          <p className={kickerClass}>Trust by design</p>
          <h2 className={cn(sectionTitleClass, 'mt-[18px]')}>
            Useful tools need explicit boundaries.
          </h2>
          <p className={cn(sectionCopyClass, 'mt-6 max-w-[560px]')}>
            The current beta protects private network targets, constrains code execution, separates
            user assets, and records the path from prompt to result.
          </p>
          <a
            className={textLinkClass}
            href={`${repositoryUrl}/blob/main/docs/PRODUCTION_SECURITY.md`}
          >
            Read the security baseline
            <ExternalLink aria-hidden="true" />
          </a>
        </div>

        <ul className="m-0 list-none border-t border-[#d8ddd8] p-0 motion-safe:transition-opacity motion-safe:duration-700 motion-safe:starting:opacity-0">
          <TrustItem text="Cookie-based accounts with verified email and user-scoped data" />
          <TrustItem text="SSRF protection with redirect and private-address checks" />
          <TrustItem text="No-network code sandbox with execution and output limits" />
          <TrustItem text="Structured run traces with tool duration and failure status" />
          <TrustItem text="Production Origin checks, request limits, and secret redaction" />
        </ul>
      </section>

      <section className={cn(sectionClass, 'border-t border-[#d8ddd8] bg-[#e8ede9]')}>
        <div className="mx-auto grid max-w-[1440px] [grid-template-columns:minmax(320px,1fr)_minmax(320px,0.7fr)] items-end gap-[8vw] motion-safe:transition-opacity motion-safe:duration-700 max-[820px]:grid-cols-1 max-[820px]:gap-[52px] motion-safe:starting:opacity-0">
          <div>
            <p className={kickerClass}>Public beta</p>
            <h2 className={cn(sectionTitleClass, 'mt-[18px] max-w-[700px]')}>
              Use the working product before paid plans arrive.
            </h2>
          </div>
          <div className="pb-[3px]">
            <p className={sectionCopyClass}>
              The beta is currently free. Paid subscriptions and checkout are not yet available.
            </p>
            <a className={cn(buttonClass, primaryButtonClass, 'mt-[26px]')} href="/app">
              Create an account
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  )
}

function Capability({
  icon,
  label,
  title,
  copy,
  divided = false,
}: {
  icon: ReactNode
  label: string
  title: string
  copy: string
  divided?: boolean
}) {
  return (
    <article
      className={cn(
        'min-w-0 pt-8 pr-10 pb-3 max-[820px]:border-b max-[820px]:border-[#d8ddd8] max-[820px]:px-0 max-[820px]:py-[26px] max-[820px]:pb-8',
        divided && 'border-l border-[#d8ddd8] pl-10 max-[820px]:border-l-0',
      )}
    >
      <div
        className="flex size-[38px] items-center justify-center rounded-[7px] border border-[#b9c1bb] text-[#056348] [&_svg]:size-[18px]"
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className="mt-7 mb-0 font-mono text-[11px] font-bold text-[#bb5b3f] uppercase">{label}</p>
      <h3 className="mt-2.5 mb-0 max-w-[330px] text-[22px] leading-[1.35] font-[660]">{title}</h3>
      <span className="mt-[15px] block max-w-[360px] text-sm leading-7 text-[#5d665f]">{copy}</span>
    </article>
  )
}

function WorkflowStep({
  number,
  title,
  copy,
  divided = false,
}: {
  number: string
  title: string
  copy: string
  divided?: boolean
}) {
  return (
    <li
      className={cn(
        'min-w-0 pt-8 pr-[42px] max-[820px]:border-b max-[820px]:border-white/20 max-[820px]:px-0 max-[820px]:py-[26px] max-[820px]:pb-8',
        divided && 'border-l border-white/20 pl-[42px] max-[820px]:border-l-0',
      )}
    >
      <span className="font-mono text-xs text-[#74d1ad]">{number}</span>
      <h3 className="mt-[52px] mb-0 text-[23px] font-[650] max-[820px]:mt-6">{title}</h3>
      <p className="mt-3.5 mb-0 max-w-[360px] text-sm leading-7 text-white/65">{copy}</p>
    </li>
  )
}

function TrustItem({ text }: { text: string }) {
  return (
    <li className="grid grid-cols-[22px_1fr] items-start gap-3.5 border-b border-[#d8ddd8] py-[22px] text-[15px] leading-[1.55]">
      <Check className="mt-0.5 size-[18px] text-[#07845d]" aria-hidden="true" />
      <span>{text}</span>
    </li>
  )
}

function PublicPageFrame({ children }: { children: ReactNode }) {
  return (
    <main className={cn(publicShellClass, 'bg-white')}>
      <PublicHeader />
      {children}
      <PublicFooter />
    </main>
  )
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <header className="mx-auto max-w-[1100px] px-[6vw] pt-[120px] pb-[76px] max-[820px]:px-[22px] max-[820px]:pt-[84px] max-[820px]:pb-[58px]">
      <p className={cn(kickerClass, enterClass, 'delay-75')}>{eyebrow}</p>
      <h1
        className={cn(
          enterClass,
          'mt-[18px] mb-0 max-w-[900px] text-[56px] leading-[1.08] font-bold delay-150 max-[820px]:text-[42px] max-[520px]:text-4xl',
        )}
      >
        {title}
      </h1>
      <p
        className={cn(
          enterClass,
          'mt-6 mb-0 max-w-[720px] text-[17px] leading-[1.7] text-[#5d665f] delay-200',
        )}
      >
        {copy}
      </p>
    </header>
  )
}

function PricingPage() {
  return (
    <PublicPageFrame>
      <PageIntro
        eyebrow="Pricing"
        title="Free while the product is in beta."
        copy="Use the current engineering workspace without entering payment details. We will publish paid plan terms before billing is enabled."
      />

      <section
        className="mx-auto mb-20 grid max-w-[1100px] [grid-template-columns:minmax(300px,0.75fr)_minmax(360px,1fr)] border-y border-[#d8ddd8] max-[820px]:mx-[22px] max-[820px]:grid-cols-1"
        aria-labelledby="beta-plan-title"
      >
        <div className="py-12 pr-16 max-[820px]:p-0 max-[820px]:py-[38px]">
          <p className="m-0 font-mono text-[11px] font-bold text-[#bb5b3f] uppercase">Open beta</p>
          <h2 className="mt-2.5 mb-0 text-[26px]" id="beta-plan-title">
            Beta workspace
          </h2>
          <div className="mt-[34px] flex items-baseline gap-3">
            <strong className="text-[52px] leading-none">$0</strong>
            <span className="text-[13px] text-[#5d665f]">during beta</span>
          </div>
          <a className={cn(buttonClass, primaryButtonClass, 'mt-[34px]')} href="/app">
            Start free
            <ArrowRight aria-hidden="true" />
          </a>
        </div>

        <ul className="m-0 list-none border-l border-[#d8ddd8] py-9 pl-16 max-[820px]:border-t max-[820px]:border-l-0 max-[820px]:px-0 max-[820px]:py-[26px]">
          <PricingItem text="Email account and private sessions" />
          <PricingItem text="Single and multi-agent workflows" />
          <PricingItem text="GitHub lookup, public web fetch, and citations" />
          <PricingItem text="Run history with usage and tool traces" />
          <PricingItem text="Memory and repository retrieval when configured" />
        </ul>
      </section>

      <section className="mx-auto mb-[110px] grid max-w-[1100px] grid-cols-[44px_1fr] gap-6 rounded-lg border border-[#d8ddd8] bg-[#f5f7f4] p-[30px] max-[820px]:mx-[22px] max-[820px]:mb-[82px] max-[520px]:grid-cols-1">
        <CircleDollarSign className="size-7 text-[#056348]" aria-hidden="true" />
        <div>
          <h2 className="m-0 text-lg">Paid billing is not active</h2>
          <p className="mt-[9px] mb-0 text-sm leading-[1.7] text-[#5d665f]">
            AI Engineering Agent does not currently collect card details or charge subscription
            fees. Prices, quotas, cancellation terms, and the effective refund policy will be shown
            before any paid checkout is offered.
          </p>
        </div>
      </section>
    </PublicPageFrame>
  )
}

function PricingItem({ text }: { text: string }) {
  return (
    <li className="grid grid-cols-[22px_1fr] gap-3 py-3.5 text-sm">
      <Check className="mt-0.5 size-[18px] text-[#07845d]" aria-hidden="true" />
      {text}
    </li>
  )
}

function ContactPage() {
  return (
    <PublicPageFrame>
      <PageIntro
        eyebrow="Contact"
        title="Reach the product operator."
        copy="Use the support channel for account access, privacy requests, security reports, or product questions."
      />

      <section className="mx-auto mb-12 grid max-w-[1100px] grid-cols-2 border-y border-[#d8ddd8] max-[820px]:mx-[22px] max-[820px]:grid-cols-1">
        <article className="min-w-0 py-[46px] pr-[50px] pb-12 max-[820px]:p-0 max-[820px]:py-[38px]">
          <Mail className="mb-9 size-6 text-[#056348]" aria-hidden="true" />
          <p className="m-0 font-mono text-[11px] font-bold text-[#bb5b3f] uppercase">
            Product and account support
          </p>
          <h2 className="mt-2.5 mb-0 text-2xl [overflow-wrap:anywhere]">{publicContact.label}</h2>
          <a className={textLinkClass} href={publicContact.href}>
            Contact support
            <ArrowRight aria-hidden="true" />
          </a>
        </article>
        <article className="min-w-0 border-l border-[#d8ddd8] py-[46px] pr-0 pb-12 pl-[50px] max-[820px]:border-t max-[820px]:border-l-0 max-[820px]:p-0 max-[820px]:py-[38px]">
          <GitFork className="mb-9 size-6 text-[#056348]" aria-hidden="true" />
          <p className="m-0 font-mono text-[11px] font-bold text-[#bb5b3f] uppercase">
            Source and technical issues
          </p>
          <h2 className="mt-2.5 mb-0 text-2xl">GitHub repository</h2>
          <a className={textLinkClass} href={repositoryUrl}>
            View repository
            <ExternalLink aria-hidden="true" />
          </a>
        </article>
      </section>

      <section className="mx-auto mb-[110px] max-w-[1100px] rounded-lg border border-[#d8ddd8] bg-[#f5f7f4] p-[30px] max-[820px]:mx-[22px] max-[820px]:mb-[82px]">
        <h2 className="m-0 text-lg">Include enough context</h2>
        <p className="mt-[9px] mb-0 text-sm leading-[1.7] text-[#5d665f]">
          For account requests, contact us from the email associated with your account. Never send
          passwords, API keys, identity documents, payment card details, or recovery tokens.
        </p>
      </section>
    </PublicPageFrame>
  )
}

type LegalSection = {
  title: string
  paragraphs?: string[]
  items?: string[]
}

function LegalPage({
  eyebrow,
  title,
  summary,
  sections,
}: {
  eyebrow: string
  title: string
  summary: string
  sections: LegalSection[]
}) {
  return (
    <PublicPageFrame>
      <PageIntro eyebrow={eyebrow} title={title} copy={summary} />
      <article className="mx-auto max-w-[820px] px-[6vw] pb-[120px] max-[820px]:px-[22px] max-[820px]:pb-[90px]">
        <p className="mt-0 mb-12 border-t border-[#d8ddd8] pt-[18px] font-mono text-xs text-[#5d665f]">
          Effective July 22, 2026
        </p>
        {sections.map((section) => (
          <section className="mt-12" key={section.title}>
            <h2 className="m-0 text-[21px] leading-[1.4]">{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p className="mt-3.5 mb-0 text-[15px] leading-[1.8] text-[#48514b]" key={paragraph}>
                {paragraph}
              </p>
            ))}
            {section.items ? (
              <ul className="mt-3.5 mb-0 pl-[22px]">
                {section.items.map((item) => (
                  <li
                    className="text-[15px] leading-[1.8] text-[#48514b] [&+li]:mt-[7px]"
                    key={item}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
        <section className="mt-12">
          <h2 className="m-0 text-[21px] leading-[1.4]">Contact</h2>
          <p className="mt-3.5 mb-0 text-[15px] leading-[1.8] text-[#48514b]">
            Questions about this policy can be sent through{' '}
            <a
              className="font-[650] text-[#056348] underline underline-offset-[3px]"
              href={publicContact.href}
            >
              {publicContact.label}
            </a>
            .
          </p>
        </section>
      </article>
    </PublicPageFrame>
  )
}

function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      summary="These terms govern access to the AI Engineering Agent public beta and its engineering workspace."
      sections={[
        {
          title: '1. Service operator and acceptance',
          paragraphs: [
            'AI Engineering Agent is an independently operated software product. By creating an account or using the service, you agree to these terms and the Privacy Policy. If you do not agree, do not use the service.',
            'You must be at least 18 years old, or the minimum age required to enter a contract where you live, and you must provide accurate account information.',
          ],
        },
        {
          title: '2. The beta service',
          paragraphs: [
            'The service provides an AI-assisted workspace for software engineering research, repository analysis, code reasoning, retrieval, and run tracing. Features may change during the beta, and some tools are available only when the operator has enabled the required infrastructure.',
            'AI output can be incomplete or incorrect. You are responsible for reviewing results, testing code, checking cited sources, and deciding whether an output is suitable for your use.',
          ],
        },
        {
          title: '3. Accounts and security',
          items: [
            'Keep your password and account access confidential.',
            'Do not share authentication links, recovery tokens, or third-party credentials.',
            'Notify support if you believe your account has been compromised.',
            'You are responsible for activity performed through your account unless prohibited by law.',
          ],
        },
        {
          title: '4. Acceptable use',
          paragraphs: ['You may not use the service to:'],
          items: [
            'Break the law, violate third-party rights, or access systems without authorization.',
            'Create malware, evade security controls, conduct credential theft, or cause service disruption.',
            'Upload secrets or personal data you are not authorized to process.',
            'Resell access, scrape the service, bypass quotas, or interfere with other users.',
            'Treat the product as medical, legal, financial, or other regulated professional advice.',
          ],
        },
        {
          title: '5. Your content',
          paragraphs: [
            'You retain rights in prompts, files, repository references, and other content you submit. You grant the operator a limited right to process that content only to provide, secure, maintain, and improve the service.',
            'You represent that you have the rights needed to submit your content. Do not provide production secrets, payment card data, government identifiers, or other unnecessary sensitive information.',
          ],
        },
        {
          title: '6. Third-party services',
          paragraphs: [
            'The service can rely on model providers, hosting providers, email delivery, GitHub, and other configured tools. Their availability and separate terms may affect specific features. Links and citations do not constitute endorsement of third-party content.',
          ],
        },
        {
          title: '7. Fees and paid plans',
          paragraphs: [
            'The current public beta is free and does not collect payment details. Before paid plans are introduced, the service will display prices, renewal terms, included usage, cancellation terms, and an updated refund policy before checkout.',
          ],
        },
        {
          title: '8. Suspension and termination',
          paragraphs: [
            'You may stop using the service at any time. The operator may restrict or suspend access to protect users, investigate abuse, comply with law, or respond to material violations of these terms. Account deletion and data export capabilities may evolve during the beta.',
          ],
        },
        {
          title: '9. Availability and liability',
          paragraphs: [
            'The beta is provided on an as-available basis without a promise of uninterrupted operation. To the maximum extent allowed by applicable law, the operator is not liable for indirect, incidental, special, or consequential loss resulting from use of beta output or unavailable features. Mandatory consumer rights are not excluded.',
          ],
        },
        {
          title: '10. Changes',
          paragraphs: [
            'These terms may be updated as the product and billing model change. Material updates will be published with a new effective date. Continued use after an update means you accept the revised terms where permitted by law.',
          ],
        },
      ]}
    />
  )
}

function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      summary="This policy explains what the beta collects, why it is processed, and the choices available to account holders."
      sections={[
        {
          title: '1. Scope and controller',
          paragraphs: [
            'This policy applies to the AI Engineering Agent website, account system, engineering workspace, and support channels. The independent operator of AI Engineering Agent controls the personal data described here.',
          ],
        },
        {
          title: '2. Data we collect',
          items: [
            'Account data such as name, email address, verification state, and security records.',
            'Workspace content such as prompts, messages, memories, document chunks, repository references, tool calls, and generated responses.',
            'Usage and diagnostic data such as timestamps, run status, latency, token usage, cost estimates, request identifiers, IP address, and browser or device information.',
            'Support communications and information you choose to provide when requesting help.',
          ],
        },
        {
          title: '3. How data is used',
          items: [
            'Provide accounts, sessions, agent runs, retrieval, tools, and requested product features.',
            'Secure the service, prevent abuse, enforce limits, and investigate failures.',
            'Operate, debug, and improve product quality and reliability.',
            'Communicate about verification, password recovery, support, and material service changes.',
            'Meet legal obligations and respond to valid legal requests.',
          ],
        },
        {
          title: '4. AI processing and service providers',
          paragraphs: [
            'Prompts and selected context may be sent to the model provider configured by the operator to generate a response. Infrastructure, database, email, monitoring, repository, and model providers process data only as needed to provide their functions.',
            'When paid billing launches, a Merchant of Record or payment provider will process checkout, tax, subscription, and payment information under its own privacy notice. AI Engineering Agent does not intend to store full card numbers.',
          ],
        },
        {
          title: '5. Data sharing',
          paragraphs: [
            'Personal data is not sold. Data may be shared with contracted service providers, authorities when legally required, or a successor if the product is reorganized, provided appropriate protections apply.',
          ],
        },
        {
          title: '6. International processing',
          paragraphs: [
            'The service is operated from China and can use providers in other countries. This means data may be processed outside your country. The operator will use reasonable contractual and technical measures appropriate to the service and applicable law.',
          ],
        },
        {
          title: '7. Retention and security',
          paragraphs: [
            'Data is retained while your account is active and as reasonably needed for the purposes above, security, dispute handling, backups, and legal obligations. Retention controls will become more granular as the beta matures.',
            'The service uses access controls, user-scoped database queries, secure cookies in production, request limits, secret redaction, and bounded tool execution. No system can guarantee absolute security.',
          ],
        },
        {
          title: '8. Your choices and rights',
          paragraphs: [
            'Depending on where you live, you may request access, correction, export, restriction, objection, or deletion of personal data. Contact support from your account email. Some data may be retained where required for security, legal obligations, or dispute records.',
          ],
        },
        {
          title: '9. Cookies and local storage',
          paragraphs: [
            'The service uses essential cookies for authentication and security. It does not store authentication tokens in browser local storage. Optional analytics or advertising cookies are not currently used.',
          ],
        },
        {
          title: '10. Children and policy updates',
          paragraphs: [
            'The service is not directed to children. This policy may be updated as providers, features, and legal requirements change. Material changes will be published with a revised effective date.',
          ],
        },
      ]}
    />
  )
}

function RefundPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Refund Policy"
      summary="The current beta is free. This page states the present policy and how it will change before paid billing begins."
      sections={[
        {
          title: '1. Current beta',
          paragraphs: [
            'AI Engineering Agent does not currently charge subscription fees or collect payment details. Because no purchase is made, there is presently no payment to refund.',
          ],
        },
        {
          title: '2. Before paid plans launch',
          paragraphs: [
            'Before checkout is enabled, this policy will be updated to identify the seller or Merchant of Record, eligible refund window, usage-based limitations, renewal treatment, request process, expected processing time, and any mandatory rights that apply to the customer.',
            'The checkout will show the price, currency, billing interval, renewal terms, included usage, and a link to the effective refund policy before payment is confirmed.',
          ],
        },
        {
          title: '3. Cancellations',
          paragraphs: [
            'Paid subscriptions are not yet available. When they launch, customers will be able to review cancellation terms before purchase and will not be charged solely for using the current free beta.',
          ],
        },
        {
          title: '4. Unexpected payment claims',
          paragraphs: [
            'If you see a charge claiming to be from AI Engineering Agent before paid billing is announced on this website, do not share card information or credentials. Contact support and your payment provider promptly because the charge may be unauthorized or unrelated to this service.',
          ],
        },
      ]}
    />
  )
}

function NotFoundPage() {
  return (
    <PublicPageFrame>
      <section className="mx-auto flex min-h-[62svh] max-w-[760px] flex-col justify-center px-[6vw] pt-20 pb-[110px]">
        <span className="font-mono text-[13px] font-bold text-[#bb5b3f]">404</span>
        <h1 className="mt-[18px] mb-0 text-[46px] leading-[1.12] max-[520px]:text-4xl">
          That page is not part of the workspace.
        </h1>
        <p className="mt-5 mb-0 text-base text-[#5d665f]">
          Return to the product site or open the engineering workspace.
        </p>
        <div className="mt-8 flex gap-2.5 max-[520px]:flex-col max-[520px]:items-stretch">
          <a className={cn(buttonClass, secondaryButtonClass)} href="/">
            Product home
          </a>
          <a className={cn(buttonClass, primaryButtonClass)} href="/app">
            Open workspace
            <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </section>
    </PublicPageFrame>
  )
}

function PublicFooter() {
  return (
    <footer className="grid [grid-template-columns:minmax(260px,0.7fr)_minmax(420px,1fr)] gap-20 bg-white px-[6vw] pt-[74px] pb-[30px] max-[820px]:grid-cols-1 max-[820px]:gap-[52px] max-[820px]:px-[22px] max-[820px]:pt-[60px] max-[820px]:pb-[26px]">
      <div className="flex items-start gap-3">
        <ProductMark />
        <div className="flex flex-col gap-1">
          <strong className="text-sm">AI Engineering Agent</strong>
          <span className="text-xs text-[#5d665f]">Independent engineering software</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-10 max-[520px]:grid-cols-2 max-[520px]:gap-y-[34px] [&_a]:text-[13px] [&_a]:transition-colors [&_a]:duration-150 [&_a]:hover:text-[#056348] [&_a]:focus-visible:text-[#056348] [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-2 [&_a]:focus-visible:outline-[#07845d] [&_p]:mt-0 [&_p]:mb-[7px] [&_p]:text-[11px] [&_p]:font-bold [&_p]:text-[#5d665f] [&_p]:uppercase">
        <div className="flex min-w-0 flex-col gap-2.5">
          <p>Product</p>
          <a href="/app">Workspace</a>
          <a href="/pricing">Pricing</a>
          <a href={repositoryUrl}>Source</a>
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <p>Legal</p>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/refund">Refund policy</a>
        </div>
        <div className="flex min-w-0 flex-col gap-2.5 [&_a]:[overflow-wrap:anywhere]">
          <p>Support</p>
          <a href="/contact">Contact</a>
          <a href={publicContact.href}>{publicContact.label}</a>
        </div>
      </div>

      <div className="col-span-full mt-11 flex justify-between border-t border-[#d8ddd8] pt-5 text-[11px] text-[#5d665f] max-[820px]:mt-3.5 max-[520px]:flex-col max-[520px]:gap-[7px]">
        <span>Open beta</span>
        <span>Copyright 2026 AI Engineering Agent</span>
      </div>
    </footer>
  )
}
