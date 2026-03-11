export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Local auth only — always redirect to /login.
 * No Manus OAuth. No external auth providers.
 */
export const getLoginUrl = (_returnPath?: string) => "/login";
