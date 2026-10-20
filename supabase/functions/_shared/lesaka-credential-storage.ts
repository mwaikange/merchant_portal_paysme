import { LesakaError } from "./lesaka-4all.ts";

type Credentials = { api_username: string; api_password: string };
type Envelope = { version: 1; iv: string; ciphertext: string };
const encoder = new TextEncoder();
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const bytes = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const additionalData = (merchantId: string, environment: string) => encoder.encode(JSON.stringify(["lesaka-credentials-v1", merchantId, environment]));

async function storageKey(env: (key: string) => string | undefined) {
  try {
    const key = bytes(env("LESAKA_CREDENTIALS_ENCRYPTION_KEY") || "");
    if (key.length !== 32) throw new Error();
    return await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch {
    throw new LesakaError("Lesaka credential storage is not configured. Please contact support.", 503, "lesaka_storage_not_configured");
  }
}

export async function encryptLesakaCredentials(
  credentials: Credentials, merchantId: string, environment: string, env: (key: string) => string | undefined,
): Promise<Envelope> {
  const key = await storageKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(merchantId, environment), tagLength: 128 },
    key, encoder.encode(JSON.stringify(credentials)),
  );
  return { version: 1, iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) };
}

export async function decryptLesakaCredentials(
  envelope: Envelope, merchantId: string, environment: string, env: (key: string) => string | undefined,
): Promise<Credentials> {
  const key = await storageKey(env);
  try {
    if (envelope?.version !== 1) throw new Error();
    const iv = bytes(envelope.iv);
    if (iv.length !== 12) throw new Error();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: additionalData(merchantId, environment), tagLength: 128 },
      key, bytes(envelope.ciphertext),
    );
    const credentials = JSON.parse(new TextDecoder().decode(plaintext));
    if (typeof credentials.api_username !== "string" || !credentials.api_username || typeof credentials.api_password !== "string" || !credentials.api_password) throw new Error();
    return { api_username: credentials.api_username, api_password: credentials.api_password };
  } catch {
    throw new LesakaError("Lesaka credentials could not be loaded for this merchant. Please contact support.", 503, "lesaka_credentials_unavailable");
  }
}
