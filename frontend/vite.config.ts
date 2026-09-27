import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      // A bare "/s" prefix would also match "/src/*" (Vite's own module
      // requests) by string prefix, so anchor it to the share route only.
      "^/s/": "http://localhost:8787",
    },
  },
})
