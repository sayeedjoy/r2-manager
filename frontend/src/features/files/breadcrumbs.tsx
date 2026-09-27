import { Fragment } from "react";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { bucketPath } from "@/components/layout/nav";

interface FileBreadcrumbsProps {
  bucket: string;
  prefix: string;
}

/** Deeper than this, the middle folders fold into a "…" menu so the header stays one line. */
const MAX_VISIBLE_SEGMENTS = 2;

/** FILE-01: breadcrumbs for the current bucket/prefix. Every ancestor is a real link, so it opens in a new tab too. */
export function FileBreadcrumbs({ bucket, prefix }: FileBreadcrumbsProps) {
  const segments = prefix
    .split("/")
    .filter(Boolean)
    .map((name, i, all) => ({ name, prefix: all.slice(0, i + 1).join("/") + "/" }));
  const hidden = segments.length > MAX_VISIBLE_SEGMENTS ? segments.slice(0, -MAX_VISIBLE_SEGMENTS) : [];
  const visible = segments.slice(hidden.length);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="min-w-0">
          {segments.length === 0 ? (
            <BreadcrumbPage className="truncate">{bucket}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink className="truncate" render={<Link to={bucketPath(bucket)} />}>
              {bucket}
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>

        {hidden.length > 0 && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="flex items-center rounded-md hover:text-foreground"
                  aria-label={`Show ${hidden.length} more folders`}
                >
                  <BreadcrumbEllipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-auto">
                  <DropdownMenuGroup>
                    {hidden.map((segment) => (
                      <DropdownMenuItem key={segment.prefix} render={<Link to={bucketPath(bucket, segment.prefix)} />}>
                        {segment.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
          </>
        )}

        {visible.map((segment, i) => (
          <Fragment key={segment.prefix}>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              {i === visible.length - 1 ? (
                <BreadcrumbPage className="truncate">{segment.name}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink className="truncate" render={<Link to={bucketPath(bucket, segment.prefix)} />}>
                  {segment.name}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
