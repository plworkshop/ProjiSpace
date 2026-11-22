import { defineConfig } from "vite";
import type { PreviewServer, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
function protectFrames(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((_request, response, next) => {
    response.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
    response.setHeader("X-Frame-Options", "DENY");
    next();
  });
}
export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: "local-frame-protection",
    configureServer: protectFrames,
    configurePreviewServer: protectFrames,
  }],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4317" },
  },
});
