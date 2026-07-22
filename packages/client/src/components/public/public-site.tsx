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

import './public-site.css'

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
    <span className="public-brand-mark" aria-hidden="true">
      <SquareTerminal strokeWidth={1.8} />
    </span>
  )
}

function PublicHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <header className={overlay ? 'public-header public-header-overlay' : 'public-header'}>
      <a className="public-brand" href="/" aria-label="AI Engineering Agent home">
        <ProductMark />
        <span>AI Engineering Agent</span>
      </a>

      <nav className="public-nav" aria-label="Primary navigation">
        <a href="/#capabilities">Product</a>
        <a href="/#workflow">Workflow</a>
        <a href="/pricing">Pricing</a>
        <a href="/contact">Contact</a>
      </nav>

      <a className="public-header-action" href="/app">
        Open workspace
        <ArrowRight aria-hidden="true" />
      </a>
    </header>
  )
}

function HomePage() {
  return (
    <main className="public-site">
      <section className="public-hero">
        <PublicHeader overlay />
        <img
          className="public-hero-image"
          src="/workspace-welcome.png"
          alt="AI Engineering Agent workspace showing repository research and engineering prompts"
          width="1200"
          height="813"
        />
        <div className="public-hero-shade" aria-hidden="true" />

        <div className="public-hero-content">
          <p className="public-eyebrow public-enter public-enter-one">Open beta</p>
          <h1 className="public-enter public-enter-two">AI Engineering Agent</h1>
          <p className="public-hero-copy public-enter public-enter-three">
            A focused workspace for repository research, code reasoning, and traceable agent work.
          </p>
          <div className="public-hero-actions public-enter public-enter-four">
            <a className="public-button public-button-primary" href="/app">
              Start in the workspace
              <ArrowRight aria-hidden="true" />
            </a>
            <a className="public-button public-button-secondary" href={repositoryUrl}>
              <GitFork aria-hidden="true" />
              View source
            </a>
          </div>
          <p className="public-availability public-enter public-enter-four">
            <span aria-hidden="true" /> Free during beta. No payment details required.
          </p>
        </div>

        <a className="public-hero-next" href="#capabilities">
          Explore the product
          <span aria-hidden="true">↓</span>
        </a>
      </section>

      <section className="public-capabilities public-section" id="capabilities">
        <div className="public-section-heading">
          <p className="public-kicker">Built for engineering work</p>
          <h2>Move from a question to grounded work.</h2>
          <p>
            The agent combines conversation, tools, retrieved context, and run traces in one working
            surface.
          </p>
        </div>

        <div className="public-capability-list public-reveal">
          <Capability
            icon={<FileSearch />}
            label="Research"
            title="Inspect repositories and source context"
            copy="Read GitHub metadata, index selected source files, retrieve relevant chunks, and keep citations attached to the answer."
          />
          <Capability
            icon={<Braces />}
            label="Reason"
            title="Work through code with bounded tools"
            copy="Fetch public references, execute small isolated snippets when enabled, and keep tool inputs and outputs visible."
          />
          <Capability
            icon={<Workflow />}
            label="Trace"
            title="See how each run was produced"
            copy="Review stages, tool calls, latency, token usage, cost, errors, and the final response from a single run record."
          />
        </div>
      </section>

      <section className="public-workflow public-section" id="workflow">
        <div className="public-workflow-inner">
          <div className="public-section-heading public-section-heading-inverse public-reveal">
            <p className="public-kicker">One continuous workflow</p>
            <h2>Context in. Evidence through. Answer out.</h2>
          </div>

          <ol className="public-workflow-steps public-reveal">
            <WorkflowStep
              number="01"
              title="Ask with context"
              copy="Start a session, attach the engineering goal, and choose a direct or multi-agent workflow."
            />
            <WorkflowStep
              number="02"
              title="Follow the run"
              copy="Tool activity and workflow stages stream into the same conversation while the run remains inspectable."
            />
            <WorkflowStep
              number="03"
              title="Keep the result"
              copy="Sessions, summaries, memories, citations, and run traces remain available for the next decision."
            />
          </ol>
        </div>
      </section>

      <section className="public-trust public-section">
        <div className="public-trust-copy public-reveal">
          <p className="public-kicker">Trust by design</p>
          <h2>Useful tools need explicit boundaries.</h2>
          <p>
            The current beta protects private network targets, constrains code execution, separates
            user assets, and records the path from prompt to result.
          </p>
          <a
            className="public-text-link"
            href={`${repositoryUrl}/blob/main/docs/PRODUCTION_SECURITY.md`}
          >
            Read the security baseline
            <ExternalLink aria-hidden="true" />
          </a>
        </div>

        <ul className="public-trust-list public-reveal">
          <TrustItem text="Cookie-based accounts with verified email and user-scoped data" />
          <TrustItem text="SSRF protection with redirect and private-address checks" />
          <TrustItem text="No-network code sandbox with execution and output limits" />
          <TrustItem text="Structured run traces with tool duration and failure status" />
          <TrustItem text="Production Origin checks, request limits, and secret redaction" />
        </ul>
      </section>

      <section className="public-beta public-section">
        <div className="public-beta-inner public-reveal">
          <div>
            <p className="public-kicker">Public beta</p>
            <h2>Use the working product before paid plans arrive.</h2>
          </div>
          <div className="public-beta-action">
            <p>
              The beta is currently free. Paid subscriptions and checkout are not yet available.
            </p>
            <a className="public-button public-button-primary" href="/app">
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
}: {
  icon: ReactNode
  label: string
  title: string
  copy: string
}) {
  return (
    <article className="public-capability">
      <div className="public-capability-icon" aria-hidden="true">
        {icon}
      </div>
      <p>{label}</p>
      <h3>{title}</h3>
      <span>{copy}</span>
    </article>
  )
}

function WorkflowStep({ number, title, copy }: { number: string; title: string; copy: string }) {
  return (
    <li>
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{copy}</p>
    </li>
  )
}

function TrustItem({ text }: { text: string }) {
  return (
    <li>
      <Check aria-hidden="true" />
      <span>{text}</span>
    </li>
  )
}

function PublicPageFrame({ children }: { children: ReactNode }) {
  return (
    <main className="public-site public-interior">
      <PublicHeader />
      {children}
      <PublicFooter />
    </main>
  )
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <header className="public-page-intro">
      <p className="public-kicker public-enter public-enter-one">{eyebrow}</p>
      <h1 className="public-enter public-enter-two">{title}</h1>
      <p className="public-enter public-enter-three">{copy}</p>
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

      <section className="public-pricing" aria-labelledby="beta-plan-title">
        <div className="public-pricing-summary">
          <p>Open beta</p>
          <h2 id="beta-plan-title">Beta workspace</h2>
          <div>
            <strong>$0</strong>
            <span>during beta</span>
          </div>
          <a className="public-button public-button-primary" href="/app">
            Start free
            <ArrowRight aria-hidden="true" />
          </a>
        </div>

        <ul className="public-pricing-includes">
          <PricingItem text="Email account and private sessions" />
          <PricingItem text="Single and multi-agent workflows" />
          <PricingItem text="GitHub lookup, public web fetch, and citations" />
          <PricingItem text="Run history with usage and tool traces" />
          <PricingItem text="Memory and repository retrieval when configured" />
        </ul>
      </section>

      <section className="public-pricing-note">
        <CircleDollarSign aria-hidden="true" />
        <div>
          <h2>Paid billing is not active</h2>
          <p>
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
    <li>
      <Check aria-hidden="true" />
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

      <section className="public-contact-grid">
        <article>
          <Mail aria-hidden="true" />
          <p>Product and account support</p>
          <h2>{publicContact.label}</h2>
          <a className="public-text-link" href={publicContact.href}>
            Contact support
            <ArrowRight aria-hidden="true" />
          </a>
        </article>
        <article>
          <GitFork aria-hidden="true" />
          <p>Source and technical issues</p>
          <h2>GitHub repository</h2>
          <a className="public-text-link" href={repositoryUrl}>
            View repository
            <ExternalLink aria-hidden="true" />
          </a>
        </article>
      </section>

      <section className="public-contact-expectations">
        <h2>Include enough context</h2>
        <p>
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
      <article className="public-legal">
        <p className="public-legal-date">Effective July 22, 2026</p>
        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.items ? (
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
        <section>
          <h2>Contact</h2>
          <p>
            Questions about this policy can be sent through{' '}
            <a href={publicContact.href}>{publicContact.label}</a>.
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
      <section className="public-not-found">
        <span>404</span>
        <h1>That page is not part of the workspace.</h1>
        <p>Return to the product site or open the engineering workspace.</p>
        <div>
          <a className="public-button public-button-secondary" href="/">
            Product home
          </a>
          <a className="public-button public-button-primary" href="/app">
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
    <footer className="public-footer">
      <div className="public-footer-brand">
        <ProductMark />
        <div>
          <strong>AI Engineering Agent</strong>
          <span>Independent engineering software</span>
        </div>
      </div>

      <div className="public-footer-links">
        <div>
          <p>Product</p>
          <a href="/app">Workspace</a>
          <a href="/pricing">Pricing</a>
          <a href={repositoryUrl}>Source</a>
        </div>
        <div>
          <p>Legal</p>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/refund">Refund policy</a>
        </div>
        <div>
          <p>Support</p>
          <a href="/contact">Contact</a>
          <a href={publicContact.href}>{publicContact.label}</a>
        </div>
      </div>

      <div className="public-footer-bottom">
        <span>Open beta</span>
        <span>Copyright 2026 AI Engineering Agent</span>
      </div>
    </footer>
  )
}
