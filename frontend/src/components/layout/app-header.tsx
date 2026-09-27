import { useLocation, useMatch } from "react-router-dom";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileBreadcrumbs } from "@/features/files/breadcrumbs";
import { NAV_SECTIONS } from "./nav";

const MOD_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

/** The top bar of every page: sidebar toggle, then where you are. */
export function AppHeader() {
  const crumbs = useHeaderBreadcrumbs();
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <Tooltip>
        <TooltipTrigger render={<SidebarTrigger className="-ml-1" />} />
        <TooltipContent side="bottom">
          Toggle sidebar
          <KbdGroup>
            <Kbd>{MOD_KEY}</Kbd>
            <Kbd>B</Kbd>
          </KbdGroup>
        </TooltipContent>
      </Tooltip>
      {crumbs && (
        <>
          <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-auto" />
          {crumbs}
        </>
      )}
    </header>
  );
}

/** Returns null on routes with nothing to show (home, 404), so the header can drop its divider too. */
function useHeaderBreadcrumbs() {
  const { pathname } = useLocation();
  const browse = useMatch("/b/:bucket/*");

  if (browse?.params.bucket) {
    const splat = browse.params["*"] ?? "";
    return <FileBreadcrumbs bucket={browse.params.bucket} prefix={splat ? `${splat}/` : ""} />;
  }

  for (const section of NAV_SECTIONS) {
    const item = section.items.find((i) => i.to === pathname);
    if (!item) continue;
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden sm:inline-flex">{section.label}</BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>{item.label}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return null;
}
