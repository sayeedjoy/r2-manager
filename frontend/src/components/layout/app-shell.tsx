import { Outlet } from "react-router-dom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DemoBanner } from "@/components/demo";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";

/** SidebarProvider writes this cookie on every toggle but never reads it, so the collapsed state would reset on reload. */
function sidebarWasOpen(): boolean {
  return !/(?:^|;\s*)sidebar_state=false(?:;|$)/.test(document.cookie);
}

/** NFR-05: a collapsible sidebar with the page in an inset panel beside it. Only the panel scrolls, so the sidebar and header stay put. */
export function AppShell() {
  return (
    <SidebarProvider defaultOpen={sidebarWasOpen()} className="h-svh">
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-hidden">
        <DemoBanner />
        <AppHeader />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
