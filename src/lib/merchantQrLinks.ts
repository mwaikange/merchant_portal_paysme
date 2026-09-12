import { supabase } from "@/integrations/supabase/client";

export type MerchantQrPaymentLink = {
  qr_payment_link_id: string;
  merchant_id: string;
  slug: string;
  product_reference: string;
  description: string | null;
  amount: number;
  currency: "NAD";
  recurring: boolean;
  recurring_period: string | null;
  allow_quantity: boolean;
  min_quantity: number;
  max_quantity: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
  hosted_url: string;
  qr_svg?: string;
  transaction_count?: number;
  paid_count?: number;
  total_received?: number;
  has_payment_history?: boolean;
  scheduled_deletion_at?: string | null;
};

type QrActionResponse = {
  ok: boolean;
  link?: MerchantQrPaymentLink;
  links?: MerchantQrPaymentLink[];
  recipient_email?: string;
  deleted_qr_payment_link_id?: string;
  error?: string;
};

async function invokeQrAction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<QrActionResponse>("merchant-qr-links", { body });
  if (error) throw new Error(data?.error || error.message || "QR payment-link request failed");
  if (!data?.ok) throw new Error(data?.error || "QR payment-link request failed");
  return data;
}

export async function createMerchantQrLink(input: {
  product_reference: string;
  description?: string | null;
  amount: number;
  recurring: boolean;
  recurring_period?: string | null;
  allow_quantity?: boolean;
  max_quantity?: number;
}) {
  const result = await invokeQrAction({ action: "create", ...input });
  if (!result.link) throw new Error("QR payment link was not returned");
  return result.link;
}

export async function createMerchantQrLinksBulk(products: Array<Record<string, unknown>>) {
  const result = await invokeQrAction({ action: "bulk_create", products });
  return result.links || [];
}

export async function listMerchantQrLinks() {
  const result = await invokeQrAction({ action: "list" });
  return result.links || [];
}

export async function getMerchantQrLink(qrPaymentLinkId: string) {
  const result = await invokeQrAction({
    action: "get",
    qr_payment_link_id: qrPaymentLinkId,
  });
  if (!result.link) throw new Error("QR payment link was not returned");
  return result.link;
}

export async function setMerchantQrLinkStatus(
  qrPaymentLinkId: string,
  status: "active" | "inactive",
) {
  const result = await invokeQrAction({
    action: "set_status",
    qr_payment_link_id: qrPaymentLinkId,
    status,
  });
  if (!result.link) throw new Error("Updated QR payment link was not returned");
  return result.link;
}

export async function deleteMerchantQrLink(qrPaymentLinkId: string) {
  const result = await invokeQrAction({
    action: "delete",
    qr_payment_link_id: qrPaymentLinkId,
  });
  if (result.deleted_qr_payment_link_id !== qrPaymentLinkId) {
    throw new Error("Deleted QR payment link was not confirmed");
  }
}

export async function emailMerchantQrLink(qrPaymentLinkId: string, recipientEmail?: string) {
  const result = await invokeQrAction({
    action: "email",
    qr_payment_link_id: qrPaymentLinkId,
    recipient_email: recipientEmail || undefined,
  });
  return result.recipient_email || recipientEmail || "";
}

export const qrSvgDataUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function downloadQrSvg(link: MerchantQrPaymentLink) {
  if (!link.qr_svg) throw new Error("QR image is not loaded");
  const blob = new Blob([link.qr_svg], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `paysme-${link.product_reference.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "payment"}-qr.svg`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
