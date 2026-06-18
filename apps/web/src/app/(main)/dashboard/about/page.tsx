import type { ReactNode } from "react";

import { Bot, Layers, type LucideIcon, Server, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

function Section({
  title,
  icon: Icon,
  headingClassName,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  headingClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className={cn("font-semibold text-xl", headingClassName ?? "mb-2", Icon && "flex items-center gap-2")}>
        {Icon && <Icon className="size-5 text-primary" />}
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div>
        <h1 className="font-bold text-3xl">About This App</h1>
        <p className="text-muted-foreground">
          What this project demonstrates, how it is built, and how it all fits together
        </p>
      </div>

      {/* Overview */}
      <Section title="Overview">
        <p className="mb-4 text-muted-foreground">
          Price Monitor AI Agent is{" "}
          <a
            href="https://github.com/onlineeric"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Eric Cheng
          </a>
          &apos;s personal portfolio project, built to demonstrate my full-stack development skills with a focus on AI
          agent and AI integration development.
        </p>
        <p className="mb-4 text-muted-foreground">
          It is a full-stack application that tracks product prices from arbitrary URLs, stores historical price
          records, and sends automated digest emails with trend analysis. The core engineering problem is extraction
          reliability: instead of using AI as the first step, the worker starts with a fast HTML parser and only
          escalates to browser automation and AI-powered structured extraction when a page is dynamic, bot-protected, or
          poorly structured.
        </p>
        <p className="text-muted-foreground">
          The project is designed end to end — a streaming AI chat agent with Model Context Protocol (MCP) tool-calling,
          an event-driven background worker, a typed data layer, and a production deployment pipeline — to showcase
          practical AI agent development and AI feature integration alongside solid full-stack engineering.
        </p>
      </Section>

      {/* Architecture diagram */}
      <Section title="System Architecture" icon={Server}>
        <p className="mb-4 text-muted-foreground">
          Three independent services — the Next.js web app, the background worker, and the internal-only MCP server —
          share PostgreSQL and Redis. Solid lines are synchronous request/response calls; dashed lines are asynchronous
          BullMQ jobs. Click the diagram to open it full size.
        </p>
        <a href="/architecture-phase4.svg" target="_blank" rel="noopener noreferrer">
          {/* biome-ignore lint/performance/noImgElement: local static SVG; next/image would route it through the optimizer, which blocks SVG by default */}
          <img
            src="/architecture-phase4.svg"
            alt="Price Monitoring Agent system architecture — web app, data layer, background services, and external integrations, with synchronous request/response and asynchronous BullMQ job flows"
            className="w-full rounded-lg border"
            width={1860}
            height={920}
          />
        </a>
      </Section>

      {/* What this project demonstrates */}
      <Section title="What This Project Demonstrates" headingClassName="mb-4">
        <div className="grid @3xl/main:grid-cols-2 grid-cols-1 gap-6">
          <div>
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-lg">
              <Bot className="size-5 text-primary" />
              AI Agent & Integration
            </h3>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                Conversational AI agent with multi-step tool calling over a <strong>custom MCP server</strong>,
                streaming UI, and multi-turn chat history
              </li>
              <li>
                Typed, Zod-validated MCP tools (search products, price history, trend summaries, add product) — the
                model has no direct SQL access, so every action is bounded by validated tool schemas
              </li>
              <li>
                Practical AI integration using the Vercel AI SDK with typed structured output (
                <code>generateObject</code>), not just free-form prompting
              </li>
              <li>
                AI used where it adds clear value: a structured-extraction fallback for difficult pages, not the default
                for every request
              </li>
              <li>
                Provider abstraction — OpenAI, Anthropic, and Google models switchable through a single environment
                variable
              </li>
              <li>
                Production guardrails: per-turn step budget, turn timeout, structured error taxonomy, and a
                domain-restricted system prompt
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-lg">
              <Layers className="size-5 text-primary" />
              Full-Stack Engineering
            </h3>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                Full-stack application design with Next.js 16, React 19, TypeScript, PostgreSQL, Redis, and BullMQ
              </li>
              <li>
                Background job orchestration for price checks, digest generation, and scheduler-managed repeatable jobs
              </li>
              <li>Browser automation with Playwright Extra and stealth mode for difficult e-commerce pages</li>
              <li>Typed persistence with a shared Drizzle ORM schema package across web, worker, and MCP server</li>
              <li>
                Production-oriented operations: Dockerized services, health endpoints, CI/CD via GitHub Actions, and
                self-hosted deployment
              </li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Tech stack */}
      <Section title="Tech Stack" icon={Wrench} headingClassName="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <tbody>
              {[
                ["Web app", "Next.js 16 App Router, React 19, TypeScript"],
                ["UI", "Tailwind CSS v4, Shadcn UI, Radix primitives, Sonner, Lucide"],
                ["Forms & validation", "React Hook Form, Zod"],
                ["Data access", "Drizzle ORM, PostgreSQL 18"],
                ["Queue & background jobs", "BullMQ, Redis 8"],
                ["Extraction", "Cheerio, Playwright, Playwright Extra, puppeteer-extra-plugin-stealth"],
                ["AI", "Vercel AI SDK, OpenAI, Anthropic, Google, @modelcontextprotocol/sdk, streamdown"],
                ["Email", "Resend, React Email"],
                ["Testing", "Vitest, Testing Library, jsdom"],
                ["DevOps", "Docker Compose, GitHub Actions, GHCR, Coolify"],
              ].map(([area, technologies]) => (
                <tr key={area} className="border-b last:border-b-0">
                  <td className="whitespace-nowrap py-2 pr-6 align-top font-medium">{area}</td>
                  <td className="py-2 text-muted-foreground">{technologies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Source */}
      <Section title="Source Code">
        <p className="text-muted-foreground">
          The full source code, including the MCP server, extraction pipeline, and deployment workflows, is available at{" "}
          <a
            href="https://github.com/onlineeric/price-monitoring-agent"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4 hover:text-primary/80"
          >
            github.com/onlineeric/price-monitoring-agent
          </a>
          .
        </p>
      </Section>
    </div>
  );
}
