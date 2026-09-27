import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { UploadQueueProvider } from "@/features/upload/upload-queue"

const queryClient = new QueryClient()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <UploadQueueProvider>
          <App />
        </UploadQueueProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
)
