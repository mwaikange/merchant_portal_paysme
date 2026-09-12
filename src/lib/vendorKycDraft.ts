export type VendorKycDraft<T> = {
  version: 1;
  vendorId: string;
  draftId: string;
  step: number;
  savedAt: string;
  form: T;
};

const DATABASE_NAME = "paysme-vendor-kyc-drafts";
const STORE_NAME = "files";
const DATABASE_VERSION = 1;
const TEXT_KEY_PREFIX = "paysme_vendor_kyc_draft_v1:";

const openDraftDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("Unable to open secure draft storage."));
});

const runFileTransaction = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) => {
  const database = await openDraftDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Unable to update secure draft storage."));
    });
  } finally {
    database.close();
  }
};

export const loadVendorKycDraft = <T>(vendorId: string): VendorKycDraft<T> | null => {
  try {
    const raw = localStorage.getItem(`${TEXT_KEY_PREFIX}${vendorId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VendorKycDraft<T>;
    return parsed.version === 1 && parsed.vendorId === vendorId ? parsed : null;
  } catch {
    return null;
  }
};

export const saveVendorKycDraft = <T>(draft: VendorKycDraft<T>) => {
  localStorage.setItem(`${TEXT_KEY_PREFIX}${draft.vendorId}`, JSON.stringify(draft));
};

export const loadVendorKycFiles = async (vendorId: string): Promise<Record<string, File>> => {
  if (!("indexedDB" in window)) return {};
  try {
    return (await runFileTransaction("readonly", (store) => store.get(vendorId))) || {};
  } catch {
    return {};
  }
};

export const saveVendorKycFiles = async (vendorId: string, files: Record<string, File>) => {
  if (!("indexedDB" in window)) return;
  await runFileTransaction("readwrite", (store) => store.put(files, vendorId));
};

export const clearVendorKycDraft = async (vendorId: string) => {
  localStorage.removeItem(`${TEXT_KEY_PREFIX}${vendorId}`);
  if (!("indexedDB" in window)) return;
  try {
    await runFileTransaction("readwrite", (store) => store.delete(vendorId));
  } catch {
    // The text draft is still cleared even if IndexedDB is unavailable.
  }
};
