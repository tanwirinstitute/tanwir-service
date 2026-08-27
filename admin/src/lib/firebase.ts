import { applicationDefault, cert, getApps, initializeApp, type Credential } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

function buildCredential(): Credential {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8");
    return cert(JSON.parse(json));
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  }

  return applicationDefault();
}

function ensureInitialized(): void {
  if (!getApps().length) {
    initializeApp({ credential: buildCredential() });
  }
}

export function getDb(): Firestore {
  ensureInitialized();
  return getFirestore();
}

export function getAdminAuth(): Auth {
  ensureInitialized();
  return getAuth();
}
