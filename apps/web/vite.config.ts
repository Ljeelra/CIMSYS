import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vercel의 Supabase 연동이 자동으로 넣어주는 NEXT_PUBLIC_* 변수도 읽는다
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: { port: 5173 },
  build: { sourcemap: true },
});
