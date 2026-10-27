import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// package.json に "type": "module" を付けないため、設定ファイルは .mts にしている。
// これにより tools/*.js（CommonJS）の Phase 0 検証スクリプトはそのまま動く。
export default defineConfig({
  plugins: [react()],
  // ハッシュルーティングなので、相対パスでどの配置先（サブパス含む）でも動く
  base: "./",
  server: { port: 5173 },
  preview: { port: 4173 },
  test: {
    // tools/validate-sample-data.test.js は node:test 用。Vitest では src のテストだけを実行する
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
