# Cloudflare R2 File Manager Software Requirements Specification

**Version:** 0.1  
**Status:** Working draft  
**Date:** 27 September 2026  
**Owner:** Joy

## 1. Purpose and scope

This specification defines a self-hosted web application for managing one or more Cloudflare R2 buckets from the owner's Cloudflare account. It covers secure access, file and folder operations, browser previews and editing, controlled sharing, and receiving email attachments through Cloudflare Email Routing. The application should feel like a familiar file manager while preserving R2's object storage behavior.

The first release is an administrator-focused tool. Multiple user roles and external sharing are supported by the data model and authorization rules, even if the initial deployment has one administrator. The application is not a general email client: its inbox exists to inspect routed messages and save or manage their attachments.

### 1.1 Goals

1. Let authorized users browse, upload, organize, preview, edit, and download files with clear progress and errors.
2. Keep buckets private while offering revocable links with optional passwords, expiry, and download limits.
3. Run in the owner's Cloudflare account with documented deployment and configuration.
4. Process configured incoming email addresses and make attachments available inside the interface.

### 1.2 Out of scope for this draft

Native desktop and mobile apps, outgoing email composition, collaborative document editing, full-text indexing inside arbitrary files, and antivirus guarantees. Malware scanning may be added through an external scanner or integration.

## 2. Users and permissions

| Role | Capabilities |
| --- | --- |
| Administrator | Configure buckets and authentication, manage users and inbound email settings, perform all file operations, create and revoke shares, inspect audit records. |
| Editor | Browse, upload, preview, edit, organize, download, and create shares within granted buckets or prefixes. |
| Viewer | Browse, preview, and download within granted buckets or prefixes. |
| Public share visitor | Access only the file and action allowed by a valid share link. No access to the management interface or bucket listing. |

Permission checks shall run on the server for every file, folder, metadata, share, and email action. A user may receive permissions for a bucket or a specified key prefix; denied prefixes shall not be revealed in listings or search results.

## 3. Proposed system architecture

| Component | Proposed technology | Responsibility |
| --- | --- | --- |
| Browser application | React, TypeScript, Vite, Tailwind CSS, shadcn/ui | Responsive file manager, upload queue, previews, editor, share and email views. |
| Application API | Cloudflare Worker, TypeScript, Hono | Authentication, authorization, validation, object operations, share gateway, audit events. |
| Object storage | Private Cloudflare R2 bucket bindings | File contents and optional raw email/attachment storage. |
| Application database | Cloudflare D1 | Users/roles, share policies and counters, email index, upload state, audit records, app settings. |
| Incoming email | Email Routing rule to a Worker email handler | Parse allowed messages and attach stored objects to indexed email records. |
| Access gateway | Cloudflare Access, optionally application-managed Basic Authentication | Protect management routes. Public share routes use their own link policy. |

The app shall deploy to the owner's Cloudflare account and use TLS. R2 buckets shall remain private, with public `r2.dev` access disabled. Browser code shall never contain R2 credentials. Bindings are preferred for ordinary file operations; a scoped server-side S3 credential may be used where direct signed uploads or a required S3 operation calls for it.

## 4. Functional requirements

**Priority key:** P0 = required for initial usable release; P1 = required for the requested complete feature set after the core; P2 = optional enhancement. Every requirement below is in scope unless explicitly marked P2.

### 4.1 Authentication and authorization

| ID | Priority | Requirement |
| --- | --- | --- |
| AUTH-01 | P0 | An owner shall be able to configure Cloudflare Access to protect all management UI and API routes and restrict access to approved identities. The API shall validate the Access assertion, including signature, issuer, audience, and expiry. |
| AUTH-02 | P0 | The app shall support HTTPS Basic Authentication as a configurable alternative for small private deployments. Credentials shall be stored only as server-side secrets or a password hash, never in source control or browser storage; failed attempts shall be rate limited. |
| AUTH-03 | P0 | Deployment shall select Access, Basic Authentication, or both. When both are enabled, both checks shall pass for management routes. An unconfigured deployment shall deny access. |
| AUTH-04 | P0 | All mutations shall enforce server-side role and bucket/prefix authorization. Browser controls are convenience only and shall not be the source of permission decisions. |
| AUTH-05 | P0 | Share endpoints shall bypass the management login only for the specific share route, then enforce the independent share token, password, expiration, and usage rules. |
| AUTH-06 | P1 | The administrator shall be able to revoke a user's app permissions and view the identity responsible for audited actions. |

### 4.2 Browsing and organization

| ID | Priority | Requirement |
| --- | --- | --- |
| FILE-01 | P0 | Show authorized buckets, current prefix, breadcrumbs, object name, size, type, last modified time, and a clear empty state. Use paginated R2 listings and loading/error states. |
| FILE-02 | P0 | Support list and grid views, name filtering within the current location, sorting of loaded results, and multi-selection. State clearly when search or sorting is limited to loaded results. |
| FILE-03 | P0 | Create an empty folder with a zero-byte trailing-slash placeholder object; display folders inferred from object key prefixes even without placeholders. |
| FILE-04 | P0 | Rename, copy, move, and delete files; show conflict options when a destination exists. Copy-then-delete operations shall verify the copy before deleting the source. |
| FILE-05 | P1 | Move, copy, and delete folder trees with progress, cancellation where feasible, resumable/retryable partial failures, and a final per-item result. Folder operations are not atomic. |
| FILE-06 | P0 | Provide a desktop right-click context menu, with equivalent visible action buttons or menus for touch, keyboard, and assistive technology users. |
| FILE-07 | P0 | Confirm destructive actions and show exactly which objects will be affected. An administrator-configurable soft-delete or retention policy is a P2 enhancement. |

R2 stores flat object keys. Folder creation, rename, and moves are application operations over prefixes and objects, not native directory transactions.

### 4.3 Uploads and downloads

| ID | Priority | Requirement |
| --- | --- | --- |
| XFER-01 | P0 | Accept file selection and drag-and-drop uploads into the active folder, with per-file progress, retry, cancel, and collision handling. |
| XFER-02 | P1 | Accept folder selection and drag-and-drop folders where the browser provides relative paths; preserve the selected hierarchy and reject unsafe paths or traversal components. Provide a file selection fallback on unsupported browsers. |
| XFER-03 | P0 | Use multipart upload for large files, with server-authorized initiation, bounded parts, completion, abort, progress, and recovery from interrupted transfers where supported. Choose part sizes below the deployment's request-body limit. |
| XFER-04 | P0 | Apply configurable per-file size, permitted type, and per-user upload limits before issuing upload permission; verify the stored object's size and metadata at completion. |
| XFER-05 | P0 | Download single files with correct filename, content type, and streaming behavior; support HTTP Range where previews or media require it. |
| XFER-06 | P1 | Provide bulk download as a generated archive only within configured resource limits; otherwise clearly direct users to individual downloads. |

### 4.4 Metadata, preview, and editing

| ID | Priority | Requirement |
| --- | --- | --- |
| META-01 | P0 | Display R2 HTTP metadata such as Content-Type, Content-Disposition, Cache-Control, and Content-Language, plus user custom metadata. |
| META-02 | P1 | Permit authorized editing of supported HTTP and custom metadata with validation, conflict checks, and an audit record. Preserve object contents and unspecified metadata. |
| PREV-01 | P0 | Preview PDF, common image formats, UTF-8 text, Markdown, and CSV within configured size limits. Offer download when a preview is unsupported, too large, or fails. |
| PREV-02 | P1 | Preview Logpush output as text, JSON, or JSON Lines as applicable; support bounded line count, search/filter in loaded content, and safe handling of compressed files where enabled. |
| PREV-03 | P0 | Treat all user-controlled content as untrusted. Render Markdown without executable HTML; render CSV/text as text; isolate PDF and image previews with restrictive content policy. |
| EDIT-01 | P1 | Edit supported text, Markdown, CSV, JSON, and log/text files in the browser up to a configurable size ceiling; show unsaved changes and require confirmation before discarding. |
| EDIT-02 | P1 | Save using an object version/ETag check and warn on a concurrent change. Preserve configured metadata, record editor and time, and reject writes outside permitted prefixes. |
| EDIT-03 | P2 | Offer format-aware validation, CSV table editing, and a diff before saving. Binary PDF and image editing are outside the initial editor scope. |

### 4.5 Shareable links

| ID | Priority | Requirement |
| --- | --- | --- |
| SHARE-01 | P0 | Authorized Editors and Administrators shall create a share for one file with a random unguessable token and optional password, expiration time, and maximum successful download count. |
| SHARE-02 | P0 | A share shall be retrievable without management login only through the app's share gateway. The gateway shall check revocation, expiry, password, and remaining uses before streaming the private R2 object. |
| SHARE-03 | P0 | Passwords shall be stored as slow password hashes; share tokens shall be stored as hashes or otherwise protected from database disclosure. Apply rate limiting to password attempts and share traffic. |
| SHARE-04 | P0 | Count a download once per authorized transfer, with an atomic D1 reservation before serving bytes; HTTP Range requests for the same transfer shall not consume additional uses. Document that a started transfer counts even if the client disconnects. |
| SHARE-05 | P0 | Show all active shares for a file and allow an authorized owner or administrator to revoke them immediately. Deleting or moving the source shall invalidate or explicitly migrate related shares. |
| SHARE-06 | P1 | Set secure response headers, avoid indexing, prevent shared content from running scripts on the app origin, and provide configurable inline preview versus forced download. Share responses shall not be publicly cached. |

A simple R2 presigned URL is insufficient for password protection, immediate revocation, or reliable download limits after it has been issued. Therefore, these shares must pass through the application gateway. A separate temporary direct-transfer URL may be used only when its limitations meet the selected share policy.

### 4.6 Incoming email and attachments

| ID | Priority | Requirement |
| --- | --- | --- |
| MAIL-01 | P1 | An administrator shall configure one or more Cloudflare Email Routing addresses to invoke the email Worker handler. The app shall expose the recipient configuration and deployment steps; DNS and routing changes require the account owner's setup. |
| MAIL-02 | P1 | For each accepted message, record sender, recipient, subject, received time, message identifier, processing status, and attachment metadata in D1. Store the raw message in a private R2 prefix if retention is enabled. |
| MAIL-03 | P1 | Parse MIME safely, store allowed attachments under generated object keys, retain original display filenames as metadata, and prevent path traversal or filename collisions. |
| MAIL-04 | P1 | Show an inbox with message details and attachment list; allow authorized users to preview, download, or copy attachments into an ordinary managed folder. The attachment viewer shall reuse file preview safety rules. |
| MAIL-05 | P1 | Support configurable sender allowlists, recipient rules, message/attachment size caps, type restrictions, retention, and duplicate-message handling. Mark rejected or partially processed messages with a reason without leaking raw content into logs. |
| MAIL-06 | P1 | If processing fails, record a retryable failure or reject the message according to documented routing behavior; do not present incomplete attachments as successfully imported. |

Email is an untrusted input channel. The release shall not claim malware-free attachments without an actual scanning service. Applicable Cloudflare Email Routing and Worker limits must be checked during deployment.

### 4.7 Activity and settings

| ID | Priority | Requirement |
| --- | --- | --- |
| ADMIN-01 | P0 | Record timestamp, actor, action, bucket/key or share identifier, result, and request correlation ID for uploads, edits, moves, deletions, share changes, and email ingestion. Do not log passwords, tokens, or file contents. |
| ADMIN-02 | P1 | Offer administrator settings for allowed buckets/prefixes, roles, file-size limits, preview/editor limits, share defaults, email rules, and retention periods. Validate all settings on save. |
| ADMIN-03 | P1 | Provide a deployment health view for R2, D1, Access configuration, and email routing status, without exposing secrets. |

## 5. Main user flows and acceptance criteria

### 5.1 Upload a large file

1. An Editor opens a permitted folder, chooses a large file, and sees its target path and collision policy.
2. The API authorizes the upload and creates a multipart session. The browser sends bounded parts and displays progress.
3. The server completes the upload, verifies the resulting object, records an audit event, and updates the listing.

**Accept when:** interruption can be retried or aborted; incomplete uploads are never shown as complete files; unauthorized paths and oversize files are rejected; errors identify which file or part failed.

### 5.2 Share a protected file

1. An Editor selects a file, sets an expiry, optional password, and download limit, then copies the generated link.
2. A visitor opens the link, enters a password when required, and receives only that file.
3. The owner can revoke the link and see its remaining uses.

**Accept when:** an expired, revoked, exhausted, guessed, or incorrect-password link reveals no file bytes; concurrent requests cannot exceed the configured reservation count; the underlying bucket URL does not bypass the policy.

### 5.3 Receive an attachment

1. Email Routing delivers a message to the configured Worker.
2. The handler validates configured rules, parses MIME, stores accepted attachments, and indexes the message.
3. An authorized user opens the inbox, previews an attachment, and may copy it to a managed folder.

**Accept when:** a valid message appears once, unsafe filenames do not affect object paths, failures show a processing state, and users without inbox permission cannot fetch attachments.

### 5.4 Edit text safely

1. An Editor opens a supported file and sees its current content and metadata.
2. The Editor changes content and saves.

**Accept when:** a changed ETag produces a conflict instead of silently overwriting another update; unsupported or oversized content opens read-only or download-only; saved content retains intended metadata.

## 6. Data model

| Entity | Essential fields |
| --- | --- |
| User / identity | Stable identity key, display name, status, role grants, bucket/prefix grants. |
| Share | ID, token hash, bucket/key, password hash if present, expiry, maximum and reserved downloads, revoked time, creator, timestamps. |
| Share transfer | ID, share ID, reservation time, short-lived transfer session, status; used to avoid counting each Range request separately. |
| Email message | ID, external message ID, sender, recipient, subject, received time, raw object key if retained, status, rejection/failure reason. |
| Email attachment | ID, message ID, safe object key, display filename, MIME type, size, processing state. |
| Upload session | Owner, target bucket/key, R2 upload ID, part state reference, expiry, status. |
| Audit event | Actor, action, target, outcome, timestamp, correlation ID, safe details. |

R2 remains the source of truth for stored object bytes and object metadata. D1 holds application state; the app shall tolerate and report stale database references if an object is changed outside the app.

## 7. Nonfunctional requirements

| ID | Requirement |
| --- | --- |
| NFR-01 Security | Use TLS; least-privilege bindings and secrets; private buckets; no credentials in client bundles; server authorization on every endpoint; CSRF protection for cookie-authenticated mutations; secure response headers. |
| NFR-02 Privacy | Do not send file contents or raw emails to third-party analytics. Provide configurable retention and deletion for raw messages, attachments, audit events, and abandoned uploads. |
| NFR-03 Reliability | Paginate listings; stream large objects rather than buffering them in Worker memory; retry transient failures with bounded backoff; make upload and email processing states visible. |
| NFR-04 Accessibility | Keyboard-operable actions, visible focus, labeled controls, readable errors, and a non-right-click alternative to every context action; target WCAG 2.2 AA for the app UI. |
| NFR-05 Responsive UI | Support desktop, tablet, and phone layouts. Drag-and-drop shall have a conventional file picker alternative. |
| NFR-06 Performance | Target a usable first listing within 3 seconds for a typical folder of up to 1,000 keys on a normal connection, excluding network or Cloudflare incident delays. Use virtualization or pagination for larger locations. |
| NFR-07 Portability | Supply a reproducible deployment guide, environment variable/secrets template, D1 migrations, R2 bindings, Access policy instructions, and Email Routing setup. |
| NFR-08 Observability | Structured error logs and correlation IDs without secret or content leakage; administrator-visible failures and operational status. |
| NFR-09 Data integrity | Verify copy/move before deleting a source; detect edit conflicts; prevent duplicate email imports where message identifiers permit; define recovery for partial folder operations. |

## 8. Deployment and interfaces

The deployable package shall include a Cloudflare Worker for the application API and share gateway, static frontend assets, R2 bindings, a D1 database and migrations, and an Email Routing Worker handler (same Worker if deployment routing supports the desired separation). A management hostname shall be protected by Cloudflare Access and/or Basic Authentication. A share hostname or `/s/{token}` route shall be accessible to visitors while enforcing share policies in code. No public R2 domain is required.

The API shall expose versioned routes for listings, objects, multipart sessions, metadata, shares, email index/attachments, and administrative settings. Mutations shall return structured validation errors and a correlation ID. Object keys shall be encoded and normalized consistently; the server shall never infer permissions from client-supplied labels alone.

For direct browser uploads to R2, the API may issue short-lived, operation-specific signed URLs and configure narrow bucket CORS. It shall not issue a broad R2 token to the browser. Multipart uploads through the Worker shall keep each part below the current account's request-size limit; object size and part-count limits remain subject to Cloudflare's published limits.

## 9. Release plan

| Release | Deliverables |
| --- | --- |
| Core | Deployment, Access and Basic Authentication modes, RBAC, bucket browsing, folders, drag-and-drop upload, multipart, download, previews for PDF/images/text/Markdown/CSV, object operations, audit trail. |
| Complete requested feature set | Folder upload, bulk operations, metadata editor, browser text editor, protected shares with counters, Logpush preview, Email Routing ingestion and attachment inbox, administrator settings. |
| Later enhancements | Soft delete, advanced search, archive export, malware scanner integration, format-aware editors. |

## 10. Decisions to confirm before implementation

1. **Audience:** one owner, a small team, or many tenant organizations? This affects identity and permission design.
2. **Authentication default:** Cloudflare Access is recommended for day-to-day use; Basic Authentication remains an opt-in mode or second gate.
3. **Bucket scope:** one configured bucket or multiple buckets, and whether users need different prefix grants.
4. **Sharing behavior:** whether a link may preview inline, whether shares survive file moves, and the default expiry and download limit.
5. **Email routing:** target domain/address, sender allowlist, whether to retain raw messages, attachment retention, and whether messages without attachments appear in the inbox.
6. **Maximum file sizes:** expected large upload size and editor/preview caps, to tune multipart and Worker limits.

These decisions are configuration choices, not blockers to defining the core architecture. Defaults in this draft are private buckets, Access as the preferred login, one configured bucket, shares invalidated on move/delete, and conservative configurable limits.

## 11. Cloudflare references

- R2 Workers API and object metadata: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- R2 prefixes and folders: https://developers.cloudflare.com/r2/objects/
- R2 multipart upload: https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/
- R2 limits: https://developers.cloudflare.com/r2/platform/limits/
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- R2 public bucket settings: https://developers.cloudflare.com/r2/buckets/public-buckets/
- Cloudflare Access for Workers: https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/
- Email Routing Worker handler: https://developers.cloudflare.com/email-service/api/route-emails/email-handler/
- Email storage and processing: https://developers.cloudflare.com/email-service/examples/email-routing/email-storage/
- D1 Worker binding: https://developers.cloudflare.com/d1/worker-api/
