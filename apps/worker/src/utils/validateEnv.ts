/**
 * Environment Variable Validation
 *
 * Validates that all required environment variables are present on startup.
 * This prevents runtime errors from missing configuration.
 */

interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "REDIS_URL",
  "AI_PROVIDER",
  "RESEND_API_KEY",
] as const;

const OPTIONAL_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "ANTHROPIC_MODEL",
  "OPENAI_MODEL",
  "GOOGLE_MODEL",
  "ENABLE_SCHEDULER",
  "NODE_ENV",
  "FORCE_AI_EXTRACTION",
] as const;

export function validateEnv(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  // Check AI provider specific keys
  const aiProvider = process.env.AI_PROVIDER;
  if (aiProvider) {
    switch (aiProvider) {
      case "anthropic":
        if (!process.env.ANTHROPIC_API_KEY) {
          missing.push("ANTHROPIC_API_KEY (required for AI_PROVIDER=anthropic)");
        }
        break;
      case "openai":
        if (!process.env.OPENAI_API_KEY) {
          missing.push("OPENAI_API_KEY (required for AI_PROVIDER=openai)");
        }
        break;
      case "google":
        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
          missing.push("GOOGLE_GENERATIVE_AI_API_KEY (required for AI_PROVIDER=google)");
        }
        break;
      default:
        warnings.push(`Unknown AI_PROVIDER: ${aiProvider}. Expected: anthropic, openai, or google`);
    }
  }

  // Check for production-specific settings
  if (process.env.NODE_ENV === "production") {
    if (!process.env.ENABLE_SCHEDULER) {
      warnings.push("ENABLE_SCHEDULER not set in production. Scheduler will be disabled.");
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

export function validateAndExit(): void {
  const result = validateEnv();

  // Log warnings
  if (result.warnings.length > 0) {
    console.log("[CONFIG] Warnings:");
    result.warnings.forEach((warning) => console.log(`  - ${warning}`));
  }

  // Exit on missing required variables
  if (!result.valid) {
    console.error("[CONFIG] Missing required environment variables:");
    result.missing.forEach((key) => console.error(`  - ${key}`));
    console.error("\n[CONFIG] Please set these variables and restart the worker.");
    process.exit(1);
  }

  console.log("[CONFIG] All required environment variables present");
}
