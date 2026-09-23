"use client";

// ============================================================
// Marketing landing page for wacrm — a self-hostable CRM template
// for WhatsApp®. This is the public front door at `/` (previously a
// bare redirect to /dashboard). It is a static marketing page: no
// auth, no data layer — every CTA points at the existing /login and
// /signup routes.
//
// Sections: Navbar → Hero → Features → Pricing (#pricing) →
// CTA band → Footer.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowRight,
  Bot,
  Check,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Sparkles,
  Tags,
  UsersRound,
  Workflow,
  Zap,
  X,
} from "lucide-react";

// ---- Shared primitives -------------------------------------------------

/**
 * Whether the visitor already has a Supabase session.
 *
 * The landing page is otherwise static/unauth, but the plan CTAs must
 * route a *signed-in* user to the billing upgrade flow instead of back
 * to /signup. Resolved once on mount; `false` until then, so a brief
 * "not signed in" render is fine (it only decides the CTA target).
 */
function useIsSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setSignedIn(!!data.session);
      })
      .catch(() => {
        // No session cookie / provider not ready — treat as signed out.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return signedIn;
}

function Container({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">{children}</div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {eyebrow ? (
        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-primary">
          {eyebrow}
        </span>
      ) : null}
      <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="max-w-2xl text-pretty text-base text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

// ---- Navbar ------------------------------------------------------------

function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <Container>
        <nav className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight text-foreground">
              Yaari CRM
            </span>
            <Badge variant="outline">WhatsApp CRM</Badge>
          </Link>

          <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link href="#features" className="transition-colors hover:text-foreground">
              Features
            </Link>
            <Link href="#pricing" className="transition-colors hover:text-foreground">
              Pricing
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" render={<Link href="/login" />}>
              Sign in
            </Button>
            <Button size="sm" render={<Link href="/signup" />}>
              Get started
              <ArrowRight className="size-3.5 opacity-70" data-icon="inline-end" />
            </Button>
          </div>
        </nav>
      </Container>
    </header>
  );
}

// ---- Hero --------------------------------------------------------------

function Hero() {
  const signedIn = useIsSignedIn();
  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* Soft primary glow behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[48rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]"
      />
      <Container>
        <div className="relative flex flex-col items-center gap-8 py-20 text-center sm:py-28">
          <Badge variant="outline" className="gap-1.5">
            <Sparkles className="size-3 text-primary" />
            Self-hostable · MIT-licensed · Your data stays yours
          </Badge>

          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            The WhatsApp CRM your team will actually use
          </h1>

          <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
            A shared inbox, contacts, pipelines, broadcasts, no-code
            automations, and an AI reply assistant — built on the official
            WhatsApp Business API and hosted by you. No SaaS lock-in, no seat
            pricing, no trust dance.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" render={<Link href={signedIn ? "/dashboard" : "/signup"} />}>
              {signedIn ? "Open your CRM" : "Get started free"}
              <ArrowRight className="size-4 opacity-70" data-icon="inline-end" />
            </Button>
            <Button size="lg" variant="outline" render={<Link href="#pricing" />}>
              See pricing
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Free trial — no credit card required. Upgrade anytime.
          </p>
        </div>
      </Container>
    </section>
  );
}

// ---- Features ----------------------------------------------------------

const FEATURES: Array<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = [
  {
    icon: <Inbox className="size-5" />,
    title: "Shared inbox",
    description:
      "Multiple agents work one WhatsApp number with per-conversation assignment, status, and notes.",
  },
  {
    icon: <Tags className="size-5" />,
    title: "Contacts & tags",
    description:
      "Contacts, tags, and custom fields with CSV import and automatic deduplication.",
  },
  {
    icon: <KanbanSquare className="size-5" />,
    title: "Sales pipelines",
    description:
      "Kanban pipelines with deals linked straight to WhatsApp conversations.",
  },
  {
    icon: <Megaphone className="size-5" />,
    title: "Broadcasts",
    description:
      "Meta-approved templates with delivery and read tracking, and per-recipient variables.",
  },
  {
    icon: <Workflow className="size-5" />,
    title: "No-code automations",
    description:
      "Visual triggers, branches, waits, tags, and webhooks — no code required.",
  },
  {
    icon: <Bot className="size-5" />,
    title: "AI reply assistant",
    description:
      "Bring your own OpenAI or Anthropic key. AI-drafted replies with an optional auto-bot and knowledge base.",
  },
  {
    icon: <LayoutDashboard className="size-5" />,
    title: "Real-time dashboard",
    description:
      "Response times, daily volume, pipeline value, and a live activity feed.",
  },
  {
    icon: <UsersRound className="size-5" />,
    title: "Team accounts",
    description:
      "Invite your team by link with role-based access — owner, admin, agent, or viewer.",
  },
];

function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="Everything you need"
          title="Run your WhatsApp sales and support like a product team"
          subtitle="Hand-picked capabilities that ship working out of the box — build the rest yourself on a boring, predictable stack."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:bg-card-2"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {f.icon}
              </span>
              <h3 className="text-sm font-medium text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

// ---- Pricing -----------------------------------------------------------

type Plan = {
  name: string;
  tagline: string;
  price: string;
  period?: string;
  cta: string;
  highlighted: boolean;
  automation: boolean;
  ai: boolean;
  features: string[];
};

const PLANS: Plan[] = [
  {
    name: "Free trial",
    tagline: "Everything you need to kick the tires on a real WhatsApp CRM.",
    price: "₹0",
    period: "trial period",
    cta: "Get started free",
    highlighted: false,
    automation: false,
    ai: false,
    features: [
      "Shared WhatsApp inbox",
      "Contacts, tags & custom fields",
      "Sales pipelines (Kanban)",
      "Broadcasts",
      "Real-time dashboard",
      "Team accounts (invite by link)",
      "Standard support",
    ],
  },
  {
    name: "Pro",
    tagline: "For teams that want to automate the busywork.",
    price: "₹6,000",
    period: "month",
    cta: "Go Pro",
    highlighted: false,
    automation: true,
    ai: false,
    features: [
      "Everything in Free trial",
      "No-code automation builder",
      "Advanced flows — triggers, branches, waits & webhooks",
      "Scheduled & keyword automations",
      "Priority support",
    ],
  },
  {
    name: "Pro Max",
    tagline: "Automation plus AI — let the assistant draft replies for you.",
    price: "₹8,000",
    period: "month",
    cta: "Get Pro Max",
    highlighted: true,
    automation: true,
    ai: true,
    features: [
      "Everything in Pro",
      "AI reply assistant (draft & polish)",
      "Auto-reply bot with human handoff",
      "Knowledge base — answers from your content",
      "Priority support + onboarding",
    ],
  },
];

function FeatureRow({
  included,
  label,
}: {
  included: boolean;
  label: string;
}) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span
        className={
          included
            ? "mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
            : "mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        }
      >
        {included ? (
          <Check className="size-3.5" />
        ) : (
          <X className="size-3.5" />
        )}
      </span>
      <span className={included ? "text-foreground" : "text-muted-foreground line-through decoration-muted-foreground/40"}>
        {label}
      </span>
    </li>
  );
}

function PlanCard({ plan, signedIn }: { plan: Plan; signedIn: boolean }) {
  return (
    <div
      className={
        plan.highlighted
          ? "relative flex flex-col rounded-2xl border-2 border-primary bg-card p-6 shadow-xl shadow-primary/10"
          : "relative flex flex-col rounded-2xl border border-border bg-card p-6"
      }
    >
      {plan.highlighted ? (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1">
          <Zap className="size-3" />
          Most popular
        </Badge>
      ) : null}

      <div className="flex items-baseline justify-between pr-2">
        <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
        <Badge variant={plan.automation ? "secondary" : "outline"} className="capitalize">
          {plan.automation
            ? plan.ai
              ? "Automation + AI"
              : "Automation"
            : "Core CRM"}
        </Badge>
      </div>

      <p className="mt-2 h-10 text-sm text-muted-foreground">{plan.tagline}</p>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight text-foreground">
          {plan.price}
        </span>
        {plan.period ? (
          <span className="text-xs text-muted-foreground">/ {plan.period}</span>
        ) : null}
      </div>

      <Button
        className="mt-6 w-full"
        variant={plan.highlighted ? "default" : "outline"}
        render={<Link href={signedIn ? "/settings?tab=billing" : "/signup"} />}
      >
        {plan.cta}
        <ArrowRight className="size-4 opacity-70" data-icon="inline-end" />
      </Button>

      <ul className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
        {plan.features.map((f) => (
          <FeatureRow key={f} included label={f} />
        ))}
        <FeatureRow included={plan.automation} label="No-code automations & flows" />
        <FeatureRow included={plan.ai} label="AI reply assistant & knowledge base" />
      </ul>
    </div>
  );
}

function Pricing() {
  const signedIn = useIsSignedIn();
  return (
    <section
      id="pricing"
      className="scroll-mt-20 border-t border-border bg-card-2/50 py-20 sm:py-24"
    >
      <Container>
        <SectionHeading
          eyebrow="Pricing"
          title="Simple, honest pricing"
          subtitle="Start free. Add automation when you grow. Bring in AI when you're ready. No per-seat surprises."
        />
        <div className="mt-14 grid gap-6 lg:grid-cols-3 lg:items-center">
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} signedIn={signedIn} />
          ))}
        </div>
      </Container>
    </section>
  );
}

// ---- CTA band + footer -------------------------------------------------

function CtaBand() {
  const signedIn = useIsSignedIn();
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-primary/10 px-6 py-16 text-center sm:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[100px]"
          />
          <h2 className="relative text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Stand up your WhatsApp CRM in an afternoon
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-pretty text-muted-foreground">
            Fork it, brand it, host it anywhere Node.js runs. Start with the
            free trial — no card required.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" render={<Link href={signedIn ? "/dashboard" : "/signup"} />}>
              {signedIn ? "Open your CRM" : "Get started free"}
              <ArrowRight className="size-4 opacity-70" data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border">
      <Container>
        <div className="flex flex-col items-center justify-between gap-6 py-10 sm:flex-row">
          <div className="flex items-center gap-2">
            <MessagesSquare className="size-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Yaari CRM</span>
            <span className="text-xs text-muted-foreground">
              · WhatsApp CRM for your team.
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="#features" className="transition-colors hover:text-foreground">
              Features
            </Link>
            <Link href="#pricing" className="transition-colors hover:text-foreground">
              Pricing
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            © {year} Yaari CRM. WhatsApp® is a registered trademark of Meta.
          </p>
        </div>
      </Container>
    </footer>
  );
}

// ---- Page --------------------------------------------------------------

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Features />
        <Pricing />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}