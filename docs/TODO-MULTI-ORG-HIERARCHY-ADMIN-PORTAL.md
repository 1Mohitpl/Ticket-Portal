# TODO: Organization Hierarchy and Admin Portal

**Status:** Planning only — no application, database, or Supabase changes are included in this document.

## Goal

Support multiple organizations in one Ticket Portal deployment. Each organization has its own hierarchy:

**Head Office (HO) → NBG → Zonal Office (ZO) → Branch**

Users can see ticket, device, branch, and reporting data for the branches in their assigned scope. Branch users can see data for their own branch only. A separate admin portal will allow authorized administrators to manage multiple organizations and each organization's hierarchy.

## Access and visibility requirements

| User scope | Branches and data visible |
|---|---|
| Organization HO | Every branch and related record in that user's organization |
| NBG | Branches beneath the user's assigned NBG, including all descendant zones |
| ZO | Branches beneath the user's assigned zone |
| Branch | The user's assigned branch only |
| SI | Branches with an active assignment to that SI; confirm whether assignments may span organizations |
| Organization administrator | Organization setup and management for explicitly assigned organizations; operational data access is a separate permission |
| Platform administrator | Cross-organization administration only through explicit platform-admin permissions and audited actions |

Apply scope consistently to tickets, devices, ticket events, SI assignments, breakdowns, counts, exports, API endpoints, and search/filter results. Hiding records in the UI alone does not satisfy this requirement.

## Work plan

### 1. Confirm product and authorization decisions

- [ ] Decide whether HO is an organization-specific role, an organization administrator, or both as separate roles.
- [ ] Define who can create the first organization and grant its first HO/admin.
- [ ] Define whether one user may belong to multiple organizations and, if so, how they switch active organization.
- [ ] Confirm whether SI assignments may cross organization boundaries.
- [ ] Define organization lifecycle behavior: active, suspended, archived, and data retention/deletion.
- [ ] Decide whether organizations can customize hierarchy names or must use HO → NBG → ZO → Branch.
- [ ] Decide whether hierarchy changes require moving existing tickets/devices or preserving their original organization and branch ownership.

### 2. Design organization-aware data model

- [ ] Add an `organizations` entity with stable ID, display name, status, and audit timestamps.
- [ ] Associate every NBG with an organization; keep zones attached to NBGs and branches attached to zones.
- [ ] Associate every user profile and organization membership with an organization and a role/scope.
- [ ] Add organization ownership to operational records that need direct tenant filtering, including tickets and devices, or document and enforce a safe ownership path through their branch.
- [ ] Enforce that parent and child hierarchy rows belong to the same organization.
- [ ] Add appropriate uniqueness constraints, such as hierarchy codes being unique within an organization.
- [ ] Add indexes for organization and hierarchy scope lookups used by RLS and dashboard queries.
- [ ] Preserve SI assignment history and ensure each assignment references entities in the same organization unless cross-org assignments are explicitly approved.
- [ ] Plan a migration that assigns all existing rows to a single initial organization without changing their current IDs or visibility.

### 3. Define and enforce tenant isolation

- [ ] Document one authoritative scope-resolution rule for each role.
- [ ] Create reusable database helpers or equivalent policy logic for resolving the caller's organization and descendant branches.
- [ ] Apply organization and role scope in RLS policies for every tenant-owned table, including related history and outbox/event tables.
- [ ] Prevent a caller from changing organization IDs, scope IDs, or roles through ordinary profile updates or API request bodies.
- [ ] Ensure security-definer functions validate the caller and organization scope explicitly.
- [ ] Ensure Edge Functions and REST API routes cannot bypass organization scope when filtering, creating, updating, or aggregating records.
- [ ] Ensure service-role operations are limited to trusted server-side workflows and validate tenant ownership before writes.
- [ ] Add audit records for privileged cross-organization actions.

### 4. Build organization hierarchy management

- [ ] Provide organization-scoped create, edit, deactivate, and move workflows for NBGs, zones, and branches.
- [ ] Validate parent-child relationships and prevent moving a node into another organization.
- [ ] Define behavior when a hierarchy node has users, devices, tickets, or SI assignments.
- [ ] Provide bulk import/export with validation and a preview before changes are applied.
- [ ] Record who changed hierarchy data and when.

### 5. Plan the multi-organization admin portal

- [ ] Add a protected admin area with a clear organization selector for administrators assigned to multiple organizations.
- [ ] Create an organization list/detail view with status, hierarchy summary, user counts, and audit history.
- [ ] Provide organization setup and lifecycle controls with explicit confirmation for suspension or archival.
- [ ] Provide hierarchy management screens for HO → NBG → ZO → Branch.
- [ ] Provide organization membership and user-role/scope management.
- [ ] Separate organization administration from platform administration; show only organizations the current admin is authorized to manage.
- [ ] Keep operational dashboards and admin screens scoped to the selected organization.
- [ ] Add audit history for organization, hierarchy, membership, role, and scope changes.
- [ ] Decide whether administrators can impersonate users; default plan is to avoid impersonation and use auditable support access if required.

### 6. Update application and API behavior

- [ ] Add organization context to sign-in/session handling when a user belongs to more than one organization.
- [ ] Update navigation and dashboard queries to show only data for the active authorized scope.
- [ ] Update branch, ticket, device, insights, exports, and API filters to carry organization context safely.
- [ ] Derive organization and permitted scope from the authenticated user on the server/database; do not trust a client-supplied organization ID by itself.
- [ ] Return consistent authorization errors for inaccessible organizations and hierarchy nodes.
- [ ] Update API documentation and examples to explain organization membership and scope.

### 7. Verification and rollout

- [ ] Create an access matrix test fixture with at least two organizations and multiple NBGs, zones, and branches in each.
- [ ] Verify HO, NBG, ZO, Branch, SI, organization admin, and platform admin access independently.
- [ ] Verify cross-organization reads and writes are denied through both the application and direct API/database access.
- [ ] Verify aggregates, counts, search, pagination, exports, and ticket detail/event endpoints do not leak out-of-scope data.
- [ ] Verify hierarchy edits cannot create cross-organization parent/child relationships.
- [ ] Back up and migrate the existing single-organization data; validate row counts and access before enabling multiple organizations.
- [ ] Roll out in stages: schema/backfill, RLS and API enforcement, admin portal, then onboarding of additional organizations.
- [ ] Keep a rollback plan for each migration and rollout stage.

## Acceptance criteria

- [ ] Every operational record is associated with exactly one organization, directly or through a validated ownership relationship.
- [ ] HO, NBG, ZO, and Branch users see only branches and related data within their defined descendant scope.
- [ ] Branch users cannot read or mutate another branch's data, including through API filters or guessed IDs.
- [ ] No organization user can read or mutate another organization's records.
- [ ] Administrators can manage only the organizations granted to them; platform-wide administration is separately permissioned and audited.
- [ ] Existing organization data retains its current IDs and valid access after migration.

## Not included in this planning task

- Database migrations, RLS policy changes, Edge Function changes, UI changes, or deployment.
- Creating organizations or users in the live Supabase project.

