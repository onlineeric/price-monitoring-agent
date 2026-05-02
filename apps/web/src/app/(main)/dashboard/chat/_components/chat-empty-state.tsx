"use client";

import { Lightbulb, Plus, Search, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ChatEmptyStateProps {
  /**
   * Called when the user clicks a starter chip.
   *
   * - `autoSend = true` → page should call `send(text)` immediately.
   * - `autoSend = false` → page should populate the input only; the user
   *   must replace the placeholder before pressing Send.
   */
  onSelectPrompt: (text: string, autoSend: boolean) => void;
}

interface StarterChip {
  label: string;
  prompt: string;
  autoSend: boolean;
  hint: string;
  Icon: typeof Search;
}

/**
 * The three FR-013 starter prompts. Each exercises a different MCP tool:
 *   1. search_products  — auto-send (no placeholder to resolve).
 *   2. get_price_summary — input only; user fills in [first product].
 *   3. add_product       — input only; user pastes a URL.
 *
 * Per the analyze pass, prompts #2 and #3 do NOT auto-send. The page does
 * not auto-fetch product data to substitute placeholders.
 */
const STARTER_CHIPS: readonly StarterChip[] = [
  {
    label: "Show monitored products",
    prompt: "Show me my monitored products.",
    autoSend: true,
    hint: "Lists all products you're tracking.",
    Icon: Search,
  },
  {
    label: "Price trend on a product",
    prompt: "What's the price trend on my [first product]?",
    autoSend: false,
    hint: "Replace [first product] with a name, then send.",
    Icon: Sparkles,
  },
  {
    label: "Add a new product",
    prompt: "Add this product: [paste URL]",
    autoSend: false,
    hint: "Paste a product URL, then send.",
    Icon: Plus,
  },
];

export function ChatEmptyState({ onSelectPrompt }: ChatEmptyStateProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12 text-center">
      <div className="flex flex-col items-center gap-2">
        <Lightbulb className="size-8 text-primary" aria-hidden="true" />
        <h2 className="font-semibold text-xl">Ask about your products</h2>
        <p className="text-muted-foreground text-sm">
          Get prices, trends, and deals for everything you monitor — or add a new product to track. Try one of these to
          get started.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {STARTER_CHIPS.map((chip) => (
          <Button
            key={chip.label}
            type="button"
            variant="outline"
            className="flex h-auto flex-col items-start gap-2 whitespace-normal px-4 py-3 text-left"
            onClick={() => onSelectPrompt(chip.prompt, chip.autoSend)}
          >
            <span className="flex items-center gap-2 font-medium">
              <chip.Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {chip.label}
            </span>
            <span className="text-muted-foreground text-xs">{chip.hint}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
