// Loads naloga4/.env (if present) before any other module reads process.env.
// Must be the first import in server.js – ESM imports are evaluated in order.
import path from 'node:path';

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '..', '.env'));
} catch {
  // no .env → llm.js falls back to mock mode
}
