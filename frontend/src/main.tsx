import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Toaster } from "@/components/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ConfirmProvider } from "@/components/confirm-dialog"
import { UploadQueueProvider } from "@/features/upload/upload-queue"
import { FileClipboardProvider } from "@/features/files/file-clipboard"

const queryClient = new QueryClient()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ConfirmProvider>
            <UploadQueueProvider>
              <FileClipboardProvider>
                <App />
              </FileClipboardProvider>
            </UploadQueueProvider>
          </ConfirmProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
)
