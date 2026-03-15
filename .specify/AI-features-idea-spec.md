# AI chatbot idea specification
I want to create an AI chatbot in our app.
It could be combine with my Postgres DB, provide end-to-end AI integration.
- chatbot should not access Postgres DB directly by SQL, to prevent SQL injection and other security issues.
- chatbot should has guardrails to prevent it from generating unsafe or inappropriate content.
- use MCP service to provide AI chatbot features.

## Semantic search
- in Postgres DB, save product data into pgvector vector store, provide vector embedding data for AI chatbot.
- user can use natural language to search the product data in Postgres DB, the chatbot use Retrieval-Augmented Generation (RAG) to answer the user's question.

## Smart Deal Analyzer
- in our email Price Monitor Report, for each product, perform LLM analysis, by combining the product's historical price data, current price, and other relevant data to generate a human-readable insight.
 For example, the insight report might look like this:
  - "This Sony monitor is currently 15% off, the lowest price in the past 60 days. Based on past trends, this is a Strong Buy opportunity."
  - "This energy drink price has been stable for the past 30 days, no significant price changes."
  - "This product price has been increasing steadily for the past 90 days, with some discounts for a limited time. The current price is at average level."

## Price Monitor MCP Server and MCP Client
### MCP Server
- in our mono repo, create a independent project, price-monitor-mcp-server, to provide MCP server for our Price Monitor AI Agent.
- provide tools for chatbot to access the Price Monitor data, and perform the actions.
- tools should include to search product data, get product historical data, get summary of product price history, etc.
- MCP server should be accessable from VSCode and Cursor for development and testing.

### MCP Client
- in our web server chatbot backend, create a new MCP client, response to the chatbot to access the MCP server.

## AI Chatbot
- create new page for chatbot
- chatbot should be similar to common AI chatbot like chatgpt, chat history should be reserved and able to continue the conversation.
- chatbot should majorly response to our app features, answering user's questions about our app, products, etc. Restrict to off-topic questions, to prevent inproper usage and avoid security issues.
