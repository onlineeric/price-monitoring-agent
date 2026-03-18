# Idea Specification: Price Monitor AI Agent & MCP Integration

## 1. Overview

We are integrating an end-to-end AI Agent into our Price Monitor app. The goal is to provide a conversational interface for users to interact with their monitored products and to enhance our existing email reports with AI-driven market insights. The system will use the Model Context Protocol (MCP) to ensure secure, standardized, and scalable AI integration.

## 2. Architecture & Core Components

### 2.1 Custom MCP Server (`price-monitor-mcp-server`)

- **Location:** A new, independent project within our existing monorepo.
- **Function:** Acts as the secure bridge between the AI Agent and our PostgreSQL database. 
- **Tool Calling:** Exposes predefined tools for the AI to use. **Direct SQL access (Text-to-SQL) is strictly prohibited** to prevent SQL injection.
- **Expected Tools:** - `search_products`: Search for monitored products.
  - `get_product_history`: Retrieve historical price data.
  - `get_price_summary`: Get a summary of a product's price trend.
  - `add_product`: Add a new product to the monitor list.
  - `update_product`: Update an existing product in DB.
- **DX (Developer Experience):** Must be accessible via standard input/output (`stdio`) so it can be integrated with VSCode and Cursor for local development and testing.

### 2.2 MCP Client

- **Location:** Implemented in our web server backend (Next.js API routes).
- **Function:** Acts as the communication layer, retrieving available tools from the MCP Server and passing them to the AI SDK.

## 3. Key Features

### 3.1 AI Chatbot UI & Logic

- **Interface:** A dedicated chatbot page on our web app.
- **Framework:** Built using the **Vercel AI SDK** for seamless streaming and state management.
- **Context Awareness:** Maintains chat history so users can have continuous, multi-turn conversations.

### 3.2 Semantic Search (RAG)

- **Database:** Utilize the `pgvector` extension in our PostgreSQL DB.
- **Embeddings:** Store product metadata (names, specs, categories) as vector embeddings.
- **User Flow:** Users can search using natural language (e.g., "Find me a cheap gaming monitor"). The chatbot uses Retrieval-Augmented Generation (RAG) to fetch relevant products from pgvector and formulate an answer.

### 3.3 Smart Deal Analyzer

- **Integration:** Enhances our existing scheduled Email Price Monitor Report.
- **Logic:** For each product, an LLM analyzes the current price against historical data to generate a short, human-readable insight.
- **Examples:**
  - *"This Sony monitor is currently 15% off, the lowest price in the past 60 days. Based on past trends, this is a Strong Buy opportunity."*
  - *"This energy drink price has been stable for the past 30 days, no significant price changes."*
  - *"This product price has been increasing steadily for the past 90 days. The current price is at an average level."*

## 4. Security & Guardrails

- **Strict Tool Boundaries:** The AI can only perform actions explicitly defined in the MCP Server tools. 
- **Domain Restriction:** The chatbot's System Prompt will restrict it to app-related topics (products, prices, monitor features). It must politely decline off-topic questions or general chit-chat to prevent misuse and token abuse.
- **Data Validation:** All parameters passed by the AI to the MCP Server tools must be strictly validated before executing any database operations.

