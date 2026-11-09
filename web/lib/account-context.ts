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
