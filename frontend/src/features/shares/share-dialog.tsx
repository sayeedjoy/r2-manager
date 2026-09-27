import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleCheck, Copy, Link2, Lock, Trash2, TriangleAlert } from "lucide-react";
import type { ObjectEntry, Share } from "@r2-manager/shared";
import { baseName } from "@r2-manager/shared";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeDate } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";

interface ShareDialogProps {
  bucket: string;
  entry: ObjectEntry;
  onClose: () => void;
}

/** Matches createShareSchema's password rule, so the form catches it before the API does. */
const MIN_PASSWORD_LENGTH = 4;

/** SHARE-01/05: create a revocable link with optional password/expiry/download limit, and manage existing ones. */
export function ShareDialog({ bucket, entry, onClose }: ShareDialogProps) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const sharesQuery = useQuery({
    queryKey: ["shares", bucket, entry.key],
    queryFn: () => api.listShares(bucket, entry.key),
  });

  const [password, setPassword] = useState("");
  const [expiryHours, setExpiryHours] = useState("168");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [inlinePreview, setInlinePreview] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (passwordTooShort) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.createShare({
        bucket,
        key: entry.key,
        password: password || undefined,
        expiresAt: expiryHours ? new Date(Date.now() + Number(expiryHours) * 3600 * 1000).toISOString() : undefined,
        maxDownloads: maxDownloads ? Number(maxDownloads) : undefined,
        inlinePreview,
      });
      setUrl(result.url);
      qc.invalidateQueries({ queryKey: ["shares", bucket, entry.key] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the link");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(shareId: string) {
    const ok = await confirm({
      title: "Revoke this share link?",
      description: "Anyone holding the link loses access immediately.",
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.revokeShare(shareId);
    } catch (err) {
      notifyError("Couldn't revoke the link", err);
    }
    qc.invalidateQueries({ queryKey: ["shares", bucket, entry.key] });
  }

  const activeShares = (sharesQuery.data?.shares ?? []).filter((s) => !s.revokedAt);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleCreate} className="contents">
          <DialogHeader>
            <DialogTitle>Share link</DialogTitle>
            <DialogDescription className="truncate">{baseName(entry.key)}</DialogDescription>
          </DialogHeader>

          {url ? (
            <div className="flex flex-col gap-3">
              <Alert>
                <CircleCheck />
                <AlertTitle>Link created</AlertTitle>
                <AlertDescription>Copy it now. For security it's shown only once and can't be retrieved later.</AlertDescription>
              </Alert>
              <CopyField value={url} />
            </div>
          ) : (
            <FieldGroup>
              <Field data-invalid={passwordTooShort || undefined}>
                <FieldLabel htmlFor="share-password">Password</FieldLabel>
                <Input
                  id="share-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Optional"
                  value={password}
                  aria-invalid={passwordTooShort || undefined}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {passwordTooShort ? (
                  <FieldError>Use at least {MIN_PASSWORD_LENGTH} characters.</FieldError>
                ) : (
                  <FieldDescription>Visitors must enter it before they can download.</FieldDescription>
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="share-expiry">Expires after</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="share-expiry"
                      type="number"
                      min="1"
                      placeholder="Never"
                      value={expiryHours}
                      onChange={(e) => setExpiryHours(e.target.value)}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>hours</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor="share-max">Download limit</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="share-max"
                      type="number"
                      min="1"
                      placeholder="Unlimited"
                      value={maxDownloads}
                      onChange={(e) => setMaxDownloads(e.target.value)}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>downloads</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
              </div>
              <Field orientation="horizontal">
                <Checkbox id="share-inline" checked={inlinePreview} onCheckedChange={(v) => setInlinePreview(!!v)} />
                <FieldContent>
                  <FieldLabel htmlFor="share-inline">Allow inline preview</FieldLabel>
                  <FieldDescription>Open the file in the browser instead of forcing a download.</FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>
          )}

          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Couldn't create the link</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {activeShares.length > 0 && (
            <div className="flex flex-col gap-2">
              <Separator />
              <h3 className="pt-2 text-sm font-medium">
                Active links <span className="text-muted-foreground tabular-nums">{activeShares.length}</span>
              </h3>
              <ItemGroup className="max-h-56 gap-2 overflow-y-auto">
                {activeShares.map((share) => (
                  <ActiveShare key={share.id} share={share} onRevoke={() => handleRevoke(share.id)} />
                ))}
              </ItemGroup>
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{url ? "Done" : "Cancel"}</DialogClose>
            {!url && (
              <Button type="submit" disabled={busy || passwordTooShort}>
                {busy && <Spinner data-icon="inline-start" />}
                Create link
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActiveShare({ share, onRevoke }: { share: Share; onRevoke: () => void }) {
  const downloads = share.maxDownloads
    ? `${share.reservedDownloads} of ${share.maxDownloads} downloads`
    : `${share.reservedDownloads} ${share.reservedDownloads === 1 ? "download" : "downloads"}`;

  return (
    <Item variant="outline" size="sm">
      <ItemMedia variant="icon">
        <Link2 />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>
          Created <time title={formatDateTime(share.createdAt)}>{formatRelativeDate(share.createdAt)}</time>
          {share.hasPassword && (
            <Badge variant="secondary">
              <Lock data-icon="inline-start" />
              Password
            </Badge>
          )}
        </ItemTitle>
        <ItemDescription>
          {downloads} ·{" "}
          {share.expiresAt ? <span title={formatDateTime(share.expiresAt)}>expires {formatRelativeDate(share.expiresAt)}</span> : "never expires"}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Tooltip>
          <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Revoke link" onClick={onRevoke} />}>
            <Trash2 />
          </TooltipTrigger>
          <TooltipContent>Revoke</TooltipContent>
        </Tooltip>
      </ItemActions>
    </Item>
  );
}

/** Read-only URL with a copy button whose icon cross-fades to a check once copied. */
function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notifyError("Couldn't copy. Select the link and copy it manually.");
    }
  }

  const iconClass = "col-start-1 row-start-1 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]";
  return (
    <InputGroup>
      <InputGroupInput readOnly value={value} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton type="button" onClick={copy} aria-label="Copy link">
          <span className="grid" aria-hidden>
            <Copy className={cn(iconClass, copied ? "scale-[0.25] opacity-0 blur-[4px]" : "blur-[0px]")} />
            <Check className={cn(iconClass, copied ? "blur-[0px]" : "scale-[0.25] opacity-0 blur-[4px]")} />
          </span>
          {copied ? "Copied" : "Copy"}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
