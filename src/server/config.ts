try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional; production and CI provide real environment variables.
}

export function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const isProduction = process.env.NODE_ENV === "production";
