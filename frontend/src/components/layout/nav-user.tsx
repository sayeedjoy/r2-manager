import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSkeleton, useSidebar } from "@/components/ui/sidebar";
import { useTheme } from "@/components/theme-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useUploadQueue } from "@/features/upload/upload-queue";
import { useMe } from "@/hooks/use-me";
import { signOut } from "@/lib/sign-out";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

function initials(name: string): string {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Who's signed in, the theme switch, and sign-out. */
export function NavUser() {
  const { data: me, isLoading } = useMe();
  const { isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { uploads } = useUploadQueue();
  const confirm = useConfirm();

  if (isLoading) return <SidebarMenuSkeleton showIcon />;
  if (!me) return null;

  const handleSignOut = async () => {
    // Sign-out reloads the page, which kills uploads in flight.
    const active = uploads.filter((u) => u.status === "uploading").length;
    if (
      active > 0 &&
      !(await confirm({
        title: "Sign out and cancel uploads?",
        description: `${active} ${active === 1 ? "upload is" : "uploads are"} still in progress and will stop.`,
        confirmLabel: "Sign out",
        destructive: true,
      }))
    ) {
      return;
    }
    await signOut(me.authMode);
  };

  // Basic Auth users often have the same username and display name, so show the role instead of repeating it.
  const subtitle = me.identity === me.displayName ? <span className="capitalize">{me.role}</span> : me.identity;

  const avatar = (
    <Avatar className="rounded-md after:rounded-md">
      <AvatarFallback className="rounded-md text-xs font-medium">{initials(me.displayName)}</AvatarFallback>
    </Avatar>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="aria-expanded:bg-sidebar-accent" />}>
            {avatar}
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-medium">{me.displayName}</span>
              <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
            </div>
            <ChevronsUpDown className="ml-auto text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="end" sideOffset={8} className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2 px-1.5 py-1.5 text-sm font-normal text-foreground">
                {avatar}
                <div className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate font-medium">{me.displayName}</span>
                  {me.identity !== me.displayName && (
                    <span className="truncate text-xs text-muted-foreground">{me.identity}</span>
                  )}
                </div>
                <Badge variant="secondary" className="capitalize">
                  {me.role}
                </Badge>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center">
                Theme
                <DropdownMenuShortcut title="Press D to toggle dark mode">D</DropdownMenuShortcut>
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as typeof theme)}>
                {THEMES.map(({ value, label, icon: Icon }) => (
                  <DropdownMenuRadioItem key={value} value={value} closeOnClick={false}>
                    <Icon />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
