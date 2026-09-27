import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface FileBreadcrumbsProps {
  bucket: string;
  prefix: string;
  onNavigate: (prefix: string) => void;
}

/** FILE-01: breadcrumbs for the current bucket/prefix. */
export function FileBreadcrumbs({ bucket, prefix, onNavigate }: FileBreadcrumbsProps) {
  const segments = prefix.split("/").filter(Boolean);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink onClick={() => onNavigate("")} className="cursor-pointer">
            {bucket}
          </BreadcrumbLink>
        </BreadcrumbItem>
        {segments.map((segment, i) => {
          const segmentPrefix = segments.slice(0, i + 1).join("/") + "/";
          const isLast = i === segments.length - 1;
          return (
            <Fragment key={segmentPrefix}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{segment}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink onClick={() => onNavigate(segmentPrefix)} className="cursor-pointer">
                    {segment}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
