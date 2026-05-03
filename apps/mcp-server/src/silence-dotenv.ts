// Side-effect-only module: silences `dotenv`'s startup banner.
//
// `@price-monitor/db` (transitively imported by every tool) calls
// `dotenv.config()` at module load. dotenv@17 writes a one-line tip banner
// to **stdout** by default — which corrupts the JSON-RPC stream in stdio
// mode (FR-002). Setting `DOTENV_CONFIG_QUIET=true` before the db module
// is evaluated suppresses that banner.
//
// This file MUST be imported before any other module in `src/index.ts` so
// the env var is set before the dependency graph evaluates dotenv.
process.env.DOTENV_CONFIG_QUIET ??= "true";
