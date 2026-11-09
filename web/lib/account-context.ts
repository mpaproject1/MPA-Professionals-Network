import { api } from "./api";

export type AccountContext = {
  roles?: string[];
  permissions?: string[];
  email?: string;
  user?: { email?: string };
  user_id?: string;
  [key: string]: unknown;
};

let activeToken = "";
let accountRequest: Promise<AccountContext> | null = null;

/**
 * Coalesces the authenticated /me request across the persistent app shell and
 * page workspaces. This is a UI data cache only; every protected API continues
 * to enforce authorization on the server.
 */
export function getAccountContext<T = AccountContext>(token: string): Promise<T> {
  if (!token) return Promise.reject(new Error("An authenticated session is required."));
  if (activeToken !== token) {
    activeToken = token;
    accountRequest = null;
  }
  if (!accountRequest) {
    accountRequest = api<AccountContext>("/api/v1/me", {}, token).catch((error) => {
      if (activeToken === token) accountRequest = null;
      throw error;
    });
  }
  return accountRequest as Promise<T>;
}

export function clearAccountContext(token?: string): void {
  if (!token || token === activeToken) {
    activeToken = "";
    accountRequest = null;
  }
}

let reportsToken = "";
let reportCatalogueRequest: Promise<Array<{ id?: unknown }>> | null = null;

/** Shares the stable report catalogue between the admin shell and admin home. */
export function getAdminReportCatalogue<T = Array<{ id?: unknown }>>(token: string): Promise<T> {
  if (!token) return Promise.reject(new Error("An authenticated session is required."));
  if (reportsToken !== token) {
    reportsToken = token;
    reportCatalogueRequest = null;
  }
  if (!reportCatalogueRequest) {
    reportCatalogueRequest = api<Array<{ id?: unknown }>>("/api/v1/admin/reports", {}, token).catch((error) => {
      if (reportsToken === token) reportCatalogueRequest = null;
      throw error;
    });
  }
  return reportCatalogueRequest as Promise<T>;
}

let organizationsToken = "";
let organizationDirectoryRequest: Promise<unknown[]> | null = null;

/** Shares the signed-in user organization directory between the shell and workspaces. */
export function getOrganizationDirectory<T = unknown[]>(token: string, refresh = false): Promise<T> {
  if (!token) return Promise.reject(new Error("An authenticated session is required."));
  if (organizationsToken !== token) {
    organizationsToken = token;
    organizationDirectoryRequest = null;
  }
  if (refresh) organizationDirectoryRequest = null;
  if (!organizationDirectoryRequest) {
    organizationDirectoryRequest = api<unknown[]>("/api/v1/organizations", {}, token).catch((error) => {
      if (organizationsToken === token) organizationDirectoryRequest = null;
      throw error;
    });
  }
  return organizationDirectoryRequest as Promise<T>;
}

export function invalidateOrganizationDirectory(token?: string): void {
  if (!token || token === organizationsToken) {
    organizationDirectoryRequest = null;
    if (typeof window !== "undefined") window.dispatchEvent(new Event("mpa:organization-directory-invalidated"));
  }
}
