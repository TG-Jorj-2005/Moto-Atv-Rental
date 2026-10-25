import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // `*.int.test.ts` need a real test database and are run with `npm run test:integration` instead.
  test: { include: ["src/**/*.test.ts"], exclude: ["**/*.int.test.ts", "node_modules/**"] },
});
