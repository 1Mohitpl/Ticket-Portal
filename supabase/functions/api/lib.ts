// Pure helpers for the ticket API. Kept dependency-free so they can be tested
// with `deno test` without a Supabase instance.

// Strips everything up to the `/api` function prefix and trailing slashes.
export function routePath(pathname: string): string {
  const stripped = pathname.replace(/^.*\/api(?=\/|$)/, "") || "/";
  const trimmed = stripped.replace(/\/+$/, "");
  return trimmed || "/";
}

export function parsePagination(
  pageParam: string | null,
  limitParam: string | null,
): { page: number; limit: number; from: number; to: number } {
  const rawPage = Number(pageParam ?? 1);
  const rawLimit = Number(limitParam ?? 20);
  const page = Number.isFinite(rawPage) && rawPage > 0
    ? Math.floor(rawPage)
    : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(100, Math.max(1, Math.floor(rawLimit)))
    : 20;
  const offset = (page - 1) * limit;
  return { page, limit, from: offset, to: offset + limit - 1 };
}

export type StatusFilter = "open" | "resolved";

// undefined = no filter supplied, null = invalid value.
export function parseStatus(
  value: string | null,
): StatusFilter | undefined | null {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return normalized === "open" || normalized === "resolved" ? normalized : null;
}

export function bearerToken(header: string | null): string {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// PostgREST treats commas and parentheses as syntax inside `or` filters.
export function likeTerm(value: string): string {
  return `%${value.replace(/[%(),\\]/g, "").trim()}%`;
}

export function searchParts(
  term: string,
  branchIds: string[],
  deviceIds: string[],
): string {
  const like = likeTerm(term);
  const parts = [`ticket_number.ilike.${like}`];
  if (branchIds.length > 0) parts.push(`branch_id.in.(${branchIds.join(",")})`);
  if (deviceIds.length > 0) parts.push(`device_id.in.(${deviceIds.join(",")})`);
  return parts.join(",");
}
