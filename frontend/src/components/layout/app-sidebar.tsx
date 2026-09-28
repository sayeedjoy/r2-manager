import { Link, useLocation } from "react-router-dom";
import { Database, HardDrive } from "lucide-react";
import { roleHasCapability } from "@r2-manager/shared";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar";
import { useBuckets } from "@/hooks/use-listing";
import { useMe } from "@/hooks/use-me";
import { NAV_SECTIONS, bucketPath, type NavItem } from "./nav";
import { NavUser } from "./nav-user";

/** NFR-05: collapses to an icon rail on desktop (Ctrl/⌘+B or the header trigger) and becomes a sheet on mobile. */
export function AppSidebar() {
  const { pathname } = useLocation();
  const { data: me } = useMe();
  const sections = NAV_SECTIONS.filter((s) => me && roleHasCapability(me.role, s.capability));

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="R2 Manager" render={<Link to="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <HardDrive />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">R2 Manager</span>
                <span className="truncate text-xs text-muted-foreground">Cloudflare R2</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <BucketsGroup pathname={pathname} />
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <NavLink key={item.to} item={item} isActive={pathname === item.to} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

/** FILE-01: only the buckets this user may browse; the server leaves denied ones out. */
function BucketsGroup({ pathname }: { pathname: string }) {
  const { data, isLoading, isError } = useBuckets();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Buckets</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {isLoading &&
            Array.from({ length: 3 }, (_, i) => (
              <SidebarMenuItem key={i}>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
            ))}
          {isError && <p className="px-2 text-xs text-destructive group-data-[collapsible=icon]:hidden">Couldn't load buckets.</p>}
          {data?.buckets.length === 0 && (
            <p className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">No buckets yet.</p>
          )}
          {data?.buckets.map((bucket) => {
            const to = bucketPath(bucket);
            return (
              <NavLink
                key={bucket}
                item={{ to, label: bucket, icon: Database }}
                isActive={pathname === to || pathname.startsWith(`${to}/`)}
              />
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={item.label}
        render={<Link to={item.to} aria-current={isActive ? "page" : undefined} />}
        // On mobile the sidebar is a sheet over the page, so close it once the user picks somewhere to go.
        onClick={() => isMobile && setOpenMobile(false)}
      >
        <Icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
