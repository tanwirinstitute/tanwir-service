import { getAdminAuth } from "@/lib/firebase";

/**
 * There's no per-admin identity (dashboard access is a single shared secret,
 * not individual logins), so every dashboard session signs in as this same
 * synthetic Firebase Auth user. The `admin: true` custom claim is what
 * Firestore security rules check to allow the dashboard's reads/writes —
 * it's only ever granted here, after the caller already passed
 * isValidAdminToken.
 */
const DASHBOARD_ADMIN_UID = "dashboard-admin";

export async function mintAdminCustomToken(): Promise<string> {
  return getAdminAuth().createCustomToken(DASHBOARD_ADMIN_UID, { admin: true });
}
