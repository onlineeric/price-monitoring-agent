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
          A portfolio project showcasing AI agent &amp; AI integration engineering, built on a production full-stack
          platform
        </p>
      </div>

      {/* Architecture diagram — lead with the system overview */}
      <Section title="System Architecture" icon={Server}>
        <p className="mb-4 text-muted-foreground">
          The whole system at a glance: an AI chat agent and dashboard (Next.js), a custom MCP server that owns semantic
          search and the local embedding model, an event-driven background worker, and a PostgreSQL + pgvector / Redis
          data layer. Solid lines are synchronous request/response calls; dashed lines are asynchronous BullMQ jobs.
          Click the diagram to open it full size.
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
          &apos;s portfolio project, built first and foremost to demonstrate{" "}
          <strong className="text-foreground">AI agent and AI integration</strong> engineering — and backed by
          production-grade <strong className="text-foreground">full-stack product</strong> development.
        </p>
        <p className="mb-4 text-muted-foreground">
          The AI showcase is end to end: a streaming <strong className="text-foreground">conversational agent</strong>{" "}
          that drives the app through a custom{" "}
          <strong className="text-foreground">Model Context Protocol (MCP) server</strong> with typed tools (no raw
          SQL); <strong className="text-foreground">RAG semantic search</strong> that finds products by <em>meaning</em>{" "}
          over a <strong className="text-foreground">pgvector</strong> vector store powered by a{" "}
          <strong className="text-foreground">locally-hosted MiniLM embedding model</strong>; and structured AI
          extraction used as a smart fallback for difficult pages rather than the default for every request.
        </p>
        <p className="text-muted-foreground">
          The product itself tracks product prices from arbitrary URLs, stores historical records, and emails trend
          digests — a real, end-to-end application running on an event-driven Next.js 16 / React 19 platform with a
          Redis + BullMQ background worker, a typed PostgreSQL data layer, and a Dockerized, CI/CD-deployed
          architecture.
        </p>
      </Section>

      {/* What this project demonstrates */}
      <Section title="What This Project Demonstrates" headingClassName="mb-4">
        <div className="grid @3xl/main:grid-cols-2 grid-cols-1 gap-6">
          <div>
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-lg">
              <Bot className="size-5 text-primary" />
              AI Agent &amp; Integration
            </h3>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Conversational AI agent</strong> with multi-step tool calling over a
                custom <strong>MCP server</strong>, streaming UI, multi-turn history, and clickable product cards wired
                back into the app
              </li>
              <li>
                <strong className="text-foreground">RAG semantic search</strong> — finds products by <em>meaning</em>,
                not keywords, over a <strong>pgvector</strong> vector store, powered by a{" "}
                <strong>locally-hosted MiniLM</strong> embedding model (<code>all-MiniLM-L6-v2</code>, 384-dim) that
                runs offline on the droplet
              </li>
              <li>
                <strong className="text-foreground">Single embedding authority</strong> — the MCP server is the only
                process that loads the model, owning both query-time (search) and write-time (reindex) embeddings, so
                its ~300&nbsp;MB RAM cost is paid exactly once
              </li>
              <li>
                Typed, Zod-validated MCP tools (keyword + semantic search, price history, trend summaries, add product)
                — the model has no direct SQL access, so every action is bounded by a validated tool schema
              </li>
              <li>
                <strong className="text-foreground">Structured AI extraction</strong> using the Vercel AI SDK (
                <code>generateObject</code>) with strict Zod schemas — used as a fallback for difficult pages, not the
                default for every request
              </li>
              <li>
                Provider abstraction — OpenAI, Anthropic, and Google switchable through a single environment variable,
                for both extraction and chat
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
                <strong className="text-foreground">Event-driven architecture</strong> — BullMQ on Redis decouples the
                web app from a background worker (price checks, metadata enrichment, vector reindex, digests, and
                scheduler-managed repeatable jobs)
              </li>
              <li>Modern full-stack with Next.js 16 App Router, React 19, TypeScript, TanStack Query, and Shadcn UI</li>
              <li>
                <strong className="text-foreground">Backend worker</strong> with a 2-tier extraction pipeline (Cheerio →
                Playwright + stealth) and a worker-managed scheduler — no external cron dependency
              </li>
              <li>
                Typed persistence with a shared Drizzle ORM schema across web, worker, and MCP server over PostgreSQL 18
                + pgvector, with versioned, auto-applied migrations
              </li>
              <li>
                Production operations: three independent Dockerized services on one network, health endpoints, CI/CD via
                GitHub Actions, and self-hosted deployment
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
                ["Data access", "Drizzle ORM, PostgreSQL 18, pgvector"],
                ["Queue & background jobs", "BullMQ, Redis 8"],
                ["Extraction", "Cheerio, Playwright, Playwright Extra, puppeteer-extra-plugin-stealth"],
                ["AI", "Vercel AI SDK, OpenAI, Anthropic, Google, @modelcontextprotocol/sdk, streamdown"],
                [
                  "Embeddings / RAG",
                  "Local all-MiniLM-L6-v2 via @huggingface/transformers, @langchain/textsplitters, pgvector (HNSW cosine)",
                ],
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
