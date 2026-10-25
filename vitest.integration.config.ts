import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests run against a real PostgreSQL TEST database. Start them with `npm run test:integration`,
// which validates the target before anything else; the setup file validates it again.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.int.test.ts"],
    setupFiles: ["src/test-support/integration-setup.ts"],
    fileParallelism: false, // all files share one database
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
