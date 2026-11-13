import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// tsconfig bilan bir xil alias: @/* -> src/*. Testlar domen papkalari yonida (src/**/*.test.ts).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"] },
});
