import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { PDFDocument, PDFImage, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  type: "welcome" | "password_reset" | "admin_password_reset" | "password_change_otp" | "merchant_fee_invoice" | "transaction_report";
  merchant_id?: string;
  email?: string;
  reset_link?: string;
  otp?: string;
  invoice_number?: string;
  fee_amount?: number;
  generated_code?: string;
  payment_link?: string;
  due_date?: string;
  filters?: Record<string, string>;
  stats?: Record<string, number>;
  period_label?: string;
  rows?: TransactionReportRow[];
}

interface TransactionReportRow {
  transaction_id: string;
  generated_code: string;
  invoice_id: string;
  status: string;
  payout_status?: string;
  type: string;
  payment_type: string;
  amount: number;
  amount_paid: number;
  fee: number | null;
  client_type: string;
  email: string;
  mobile: string;
  generated_date: string;
  paid_date: string;
}

interface MerchantData {
  merchant_id: string;
  vendor_id: string;
  email: string;
  business_name: string;
}

async function sendSmtpEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: Array<Record<string, unknown>>
): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get("SMTP_HOST")!,
      port: parseInt(Deno.env.get("SMTP_PORT") || "587"),
      tls: true,
      auth: {
        username: Deno.env.get("SMTP_USERNAME")!,
        password: Deno.env.get("SMTP_PASSWORD")!,
      },
    },
  });

  await client.send({
    from: `${Deno.env.get("SMTP_FROM_NAME") || "PaySME"} <${Deno.env.get("SMTP_FROM_EMAIL")!}>`,
    to,
    subject,
    html,
    attachments,
  });

  await client.close();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

function buildWelcomeEmail(
  businessName: string,
  email: string,
  merchantId: string,
  vendorId: string
): string {
  const yr = new Date().getFullYear();
  const logoUrl = "https://paysme.site/images/paysme-logo-email.png";
  const name = businessName || "Merchant";
  const dashUrl = new URL("/portal/dashboard", Deno.env.get("MERCHANT_PORTAL_URL") || "https://paysme.site").href;
  const p: string[] = [];
  p.push('<!DOCTYPE html>');
  p.push('<html><head>');
  p.push('<meta charset="utf-8">');
  p.push('<meta name="viewport" content="width=device-width">');
  p.push('</head>');
  p.push('<body style="margin:0;padding:0;');
  p.push('background-color:#f4f4f4;');
  p.push('font-family:Arial,sans-serif;">');
  p.push('<table width="100%" cellpadding="0"');
  p.push(' cellspacing="0" style="');
  p.push('background-color:#f4f4f4;padding:40px 0;">');
  p.push('<tr><td align="center">');
  p.push('<table width="600" cellpadding="0"');
  p.push(' cellspacing="0" style="');
  p.push('background-color:#ffffff;');
  p.push('border-radius:8px;overflow:hidden;');
  p.push('box-shadow:0 2px 8px rgba(0,0,0,0.1);">');
  // Header - white bg so logo is visible
  p.push('<tr><td style="background:#ffffff;');
  p.push('padding:30px 40px;text-align:center;');
  p.push('border-bottom:3px solid #374151;">');
  p.push('<img src="' + logoUrl + '"');
  p.push(' alt="PaySME"');
  p.push(' style="max-width:200px;height:auto;');
  p.push('margin-bottom:8px;" />');
  p.push('<p style="color:#6b7280;');
  p.push('margin:8px 0 0;font-size:14px;">');
  p.push('Your Gateway to Cash Payments</p>');
  p.push('</td></tr>');
  // Body
  p.push('<tr><td style="padding:40px;">');
  p.push('<h2 style="color:#1a1a2e;');
  p.push('margin:0 0 20px;font-size:22px;">');
  p.push('Welcome aboard, ' + name + '!</h2>');
  p.push('<p style="color:#555;font-size:15px;');
  p.push('line-height:1.6;">');
  p.push('Thank you for registering with PaySME.');
  p.push(' Your merchant account has been created');
  p.push(' successfully. Below are your important');
  p.push(' account identifiers.</p>');
  // Credentials box
  p.push('<table width="100%" cellpadding="0"');
  p.push(' cellspacing="0" style="');
  p.push('background-color:#f0f4ff;');
  p.push('border:1px solid #d0d8f0;');
  p.push('border-radius:8px;margin:24px 0;">');
  p.push('<tr><td style="padding:24px;">');
  p.push('<p style="margin:0 0 12px;');
  p.push('font-size:13px;color:#666;');
  p.push('text-transform:uppercase;');
  p.push('letter-spacing:1px;font-weight:bold;">');
  p.push('Your Account Details</p>');
  p.push('<table width="100%" cellpadding="0"');
  p.push(' cellspacing="0">');
  p.push('<tr><td style="padding:8px 0;');
  p.push('border-bottom:1px solid #e0e6f0;">');
  p.push('<span style="color:#888;');
  p.push('font-size:13px;">Email</span><br>');
  p.push('<span style="color:#1a1a2e;');
  p.push('font-size:15px;font-weight:bold;">');
  p.push(email + '</span>');
  p.push('</td></tr>');
  p.push('<tr><td style="padding:8px 0;">');
  p.push('<span style="color:#888;');
  p.push('font-size:13px;">USV ID</span><br>');
  p.push('<span style="color:#1a1a2e;');
  p.push('font-size:15px;font-weight:bold;');
  p.push('font-family:monospace;');
  p.push('background:#e8edf8;padding:2px 8px;');
  p.push('border-radius:4px;">');
  p.push(vendorId + '</span>');
  p.push('</td></tr></table>');
  p.push('</td></tr></table>');
  // Next steps
  p.push('<p style="color:#555;font-size:14px;');
  p.push('line-height:1.6;">');
  p.push('<strong>Next Steps:</strong></p>');
  p.push('<ul style="color:#555;font-size:14px;');
  p.push('line-height:1.8;padding-left:20px;">');
  p.push('<li>Complete your KYC verification</li>');
  p.push('<li>Choose a subscription plan</li>');
  p.push('<li>Start generating PaySME codes</li>');
  p.push('</ul>');
  // Button
  p.push('<table width="100%" cellpadding="0"');
  p.push(' cellspacing="0" style="margin:24px 0;">');
  p.push('<tr><td align="center">');
  p.push('<a href="' + dashUrl + '"');
  p.push(' style="display:inline-block;');
  p.push('background:#22c55e;color:#fff;');
  p.push('text-decoration:none;');
  p.push('padding:14px 32px;border-radius:8px;');
  p.push('font-size:16px;font-weight:bold;">');
  p.push('Go to Dashboard</a>');
  p.push('</td></tr></table>');
  // Disclaimer
  p.push('<p style="color:#999;font-size:12px;');
  p.push('line-height:1.6;margin-top:30px;');
  p.push('border-top:1px solid #eee;');
  p.push('padding-top:20px;">');
  p.push('If you did not create this account,');
  p.push(' please ignore this email.</p>');
  p.push('</td></tr>');
  // Footer
  p.push('<tr><td style="background-color:#1a1a2e;');
  p.push('padding:20px 40px;text-align:center;">');
  p.push('<p style="color:#a0a0c0;margin:0;');
  p.push('font-size:12px;">');
  p.push('&copy; ' + yr + ' PaySME.');
  p.push(' All rights reserved.</p>');
  p.push('</td></tr>');
  p.push('</table>');
  p.push('</td></tr></table>');
  p.push('</body></html>');
  return p.join('');
}

function buildPasswordResetEmail(
  businessName: string,
  email: string,
  merchantId: string,
  vendorId: string,
  resetLink: string
): string {
  const yr = new Date().getFullYear();
  const logoUrl = "https://paysme.site/images/paysme-logo-email.png";
  const parts: string[] = [];
  parts.push('<!DOCTYPE html>');
  parts.push('<html><head>');
  parts.push('<meta charset="utf-8">');
  parts.push('<meta name="viewport" content="width=device-width">');
  parts.push('</head>');
  parts.push('<body style="margin:0;padding:0;');
  parts.push('background-color:#f4f4f4;');
  parts.push('font-family:Arial,sans-serif;">');
  parts.push('<table width="100%" cellpadding="0"');
  parts.push(' cellspacing="0" style="');
  parts.push('background-color:#f4f4f4;');
  parts.push('padding:40px 0;">');
  parts.push('<tr><td align="center">');
  parts.push('<table width="600" cellpadding="0"');
  parts.push(' cellspacing="0" style="');
  parts.push('background-color:#ffffff;');
  parts.push('border-radius:8px;overflow:hidden;');
  parts.push('box-shadow:0 2px 8px rgba(0,0,0,0.1);">');
  // Header - white bg so logo is visible
  parts.push('<tr><td style="background:#ffffff;');
  parts.push('padding:30px 40px;text-align:center;');
  parts.push('border-bottom:3px solid #374151;">');
  parts.push('<img src="' + logoUrl + '"');
  parts.push(' alt="PaySME"');
  parts.push(' style="max-width:200px;height:auto;');
  parts.push('margin-bottom:8px;" />');
  parts.push('<p style="color:#6b7280;');
  parts.push('margin:8px 0 0;font-size:14px;">');
  parts.push('Password Reset Request</p>');
  parts.push('</td></tr>');
  // Body
  parts.push('<tr><td style="padding:40px;">');
  parts.push('<h2 style="color:#1a1a2e;');
  parts.push('margin:0 0 20px;font-size:22px;">');
  parts.push('Password Reset</h2>');
  parts.push('<p style="color:#555;font-size:15px;');
  parts.push('line-height:1.6;">');
  parts.push('We received a password reset request');
  parts.push(' for your PaySME account. Click the');
  parts.push(' button below to set a new password.');
  parts.push('</p>');
  // Account ref box
  parts.push('<table width="100%" cellpadding="0"');
  parts.push(' cellspacing="0" style="');
  parts.push('background-color:#fff8e1;');
  parts.push('border:1px solid #ffe082;');
  parts.push('border-radius:8px;margin:24px 0;">');
  parts.push('<tr><td style="padding:20px;">');
  parts.push('<p style="margin:0 0 8px;font-size:13px;');
  parts.push('color:#666;text-transform:uppercase;');
  parts.push('letter-spacing:1px;font-weight:bold;">');
  parts.push('Account Reference</p>');
  parts.push('<table width="100%" cellpadding="0"');
  parts.push(' cellspacing="0">');
  parts.push('<tr><td style="padding:4px 0;">');
  parts.push('<span style="color:#888;');
  parts.push('font-size:13px;">Email:</span>');
  parts.push('<span style="color:#1a1a2e;');
  parts.push('font-size:14px;font-weight:bold;');
  parts.push('margin-left:8px;">');
  parts.push(email + '</span>');
  parts.push('</td></tr>');
  parts.push('<tr><td style="padding:4px 0;">');
  parts.push('<span style="color:#888;');
  parts.push('font-size:13px;">USV ID:</span>');
  parts.push('<span style="color:#1a1a2e;');
  parts.push('font-size:14px;font-weight:bold;');
  parts.push('font-family:monospace;');
  parts.push('margin-left:8px;">');
  parts.push(vendorId + '</span>');
  parts.push('</td></tr>');
  parts.push('</table>');
  parts.push('</td></tr></table>');
  // Button
  parts.push('<table width="100%" cellpadding="0"');
  parts.push(' cellspacing="0" style="margin:24px 0;">');
  parts.push('<tr><td align="center">');
  parts.push('<a href="' + resetLink + '"');
  parts.push(' style="display:inline-block;');
  parts.push('background:#22c55e;color:#fff;');
  parts.push('text-decoration:none;');
  parts.push('padding:14px 32px;border-radius:8px;');
  parts.push('font-size:16px;font-weight:bold;">');
  parts.push('Reset Password</a>');
  parts.push('</td></tr></table>');
  // Disclaimer
  parts.push('<p style="color:#999;font-size:13px;');
  parts.push('line-height:1.6;">');
  parts.push('This link will expire in 1 hour.');
  parts.push(' If you did not request a password');
  parts.push(' reset, please ignore this email.');
  parts.push('</p>');
  parts.push('<p style="color:#999;font-size:12px;');
  parts.push('line-height:1.6;margin-top:30px;');
  parts.push('border-top:1px solid #eee;');
  parts.push('padding-top:20px;">');
  parts.push('For security, this email includes');
  parts.push(' your account identifiers so you');
  parts.push(' can verify this is legitimate.');
  parts.push('</p>');
  parts.push('</td></tr>');
  // Footer
  parts.push('<tr><td style="background-color:#1a1a2e;');
  parts.push('padding:20px 40px;text-align:center;">');
  parts.push('<p style="color:#a0a0c0;margin:0;');
  parts.push('font-size:12px;">');
  parts.push('&copy; ' + yr + ' PaySME.');
  parts.push(' All rights reserved.</p>');
  parts.push('</td></tr>');
  parts.push('</table>');
  parts.push('</td></tr></table>');
  parts.push('</body></html>');
  return parts.join('');
}

function buildPasswordChangeOtpEmail(
  businessName: string,
  email: string,
  vendorId: string,
  otp: string
): string {
  const yr = new Date().getFullYear();
  const logoUrl = "https://www.paysme.site/images/paysme-logo-email.png";
  const safeBusinessName = businessName || "Merchant";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;padding:28px 14px;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;box-shadow:0 14px 38px rgba(17,24,39,.10);">
        <div style="background:#262b28;padding:30px 34px;text-align:center;border-bottom:5px solid #f6c431;">
          <img src="${logoUrl}" alt="PaySME" style="display:block;margin:0 auto;max-width:260px;width:80%;height:auto;" />
        </div>
        <div style="padding:34px;">
          <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;text-align:center;color:#111827;">Password change OTP</h1>
          <p style="margin:0 auto 24px;max-width:500px;font-size:15px;line-height:1.65;text-align:center;color:#4b5563;">
            Use this one-time password to confirm the password change for your PaySME merchant account.
          </p>
          <div style="background:#fff8df;border:1px solid #f6c431;border-radius:10px;padding:18px 20px;margin:0 0 24px;">
            <p style="margin:0 0 10px;font-size:12px;letter-spacing:1.8px;font-weight:700;color:#6b5a20;text-transform:uppercase;">Account Reference</p>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#374151;">Merchant: <strong style="color:#111827;">${safeBusinessName}</strong></p>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#374151;">Email: <strong style="color:#111827;">${email}</strong></p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">USV ID: <strong style="color:#111827;">${vendorId || ""}</strong></p>
          </div>
          <div style="text-align:center;margin:26px 0;">
            <div style="display:inline-block;background:#f6c431;color:#161b18;font-weight:800;font-size:30px;letter-spacing:8px;padding:18px 28px;border-radius:10px;border:1px solid #d9a900;">${otp}</div>
          </div>
          <p style="margin:0 auto;font-size:13px;line-height:1.6;text-align:center;color:#6b7280;">This OTP expires in 10 minutes. If you did not request this change, please secure your account.</p>
        </div>
        <div style="background:#151827;padding:22px 30px;text-align:center;">
          <p style="margin:0 0 6px;font-size:13px;color:#f9fafb;font-weight:700;">PaySME</p>
          <p style="margin:0;font-size:12px;color:#b7c2d6;">Bridging Wallets, Apps &amp; Websites</p>
          <p style="margin:14px 0 0;font-size:11px;color:#8d97aa;">© ${yr} PaySME. All rights reserved.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function buildMerchantFeeInvoiceEmail(
  businessName: string,
  email: string,
  vendorId: string,
  invoiceNumber: string,
  feeAmount: number,
  generatedCode: string,
  paymentLink: string,
  dueDate: string
): string {
  const yr = new Date().getFullYear();
  const logoUrl = "https://zvoqrqdnuupdefsuiurt.supabase.co/storage/v1/object/public/LOGO/Paysme%20Logo.png";
  const iconUrl = "https://zvoqrqdnuupdefsuiurt.supabase.co/storage/v1/object/public/LOGO/icon_192.png";
  const amount = `N$ ${Number(feeAmount || 0).toFixed(2)}`;
  const name = businessName || "Merchant";
  const due = dueDate ? new Date(dueDate).toLocaleDateString("en-GB") : "Due now";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;padding:28px 14px;">
      <div style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 14px 38px rgba(17,24,39,0.10);">
        <div style="background:#262b28;padding:30px 28px;text-align:center;border-bottom:5px solid #f6c431;">
          <img src="${logoUrl}" alt="PaySME - Bridging Wallets, Apps & Websites" style="display:block;margin:0 auto;max-width:300px;width:82%;height:auto;" />
        </div>
        <div style="padding:34px 34px 30px;">
          <h1 style="margin:0 0 10px;font-size:28px;line-height:1.2;text-align:center;color:#111827;">PaySME fee invoice</h1>
          <p style="margin:0 auto 26px;max-width:500px;font-size:15px;line-height:1.65;text-align:center;color:#4b5563;">
            Hi ${name}, your PaySME transaction fee invoice is ready. Please settle it by the due date to keep your merchant portal and payment options active.
          </p>
          <div style="background:#fff8df;border:1px solid #f6c431;border-radius:10px;padding:18px 20px;margin:0 0 26px;">
            <p style="margin:0 0 10px;font-size:12px;letter-spacing:1.8px;font-weight:700;color:#6b5a20;text-transform:uppercase;">Invoice details</p>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#374151;">USV ID: <strong style="color:#111827;">${vendorId || "-"}</strong></p>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#374151;">Email: <strong style="color:#111827;">${email}</strong></p>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#374151;">Invoice: <strong style="color:#111827;">${invoiceNumber}</strong></p>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#374151;">Amount due: <strong style="color:#111827;">${amount}</strong></p>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#374151;">PaySME code: <strong style="color:#111827;">${generatedCode}</strong></p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">Due date: <strong style="color:#111827;">${due}</strong></p>
          </div>
          <div style="text-align:center;margin:30px 0;">
            <a href="${paymentLink}" style="display:inline-block;background:#f6c431;color:#161b18;text-decoration:none;font-weight:800;font-size:16px;line-height:1;padding:17px 36px;border-radius:9px;border:1px solid #d9a900;">
              Pay Now
            </a>
          </div>
          <p style="margin:0 auto 18px;max-width:500px;font-size:13px;line-height:1.6;text-align:center;color:#6b7280;">
            You can also present the PaySME code above at a participating PaySME vendor.
          </p>
        </div>
        <div style="background:#151827;padding:22px 30px;text-align:center;">
          <img src="${iconUrl}" alt="PaySME" style="display:block;margin:0 auto 8px;width:42px;height:42px;object-fit:contain;" />
          <p style="margin:14px 0 0;font-size:11px;color:#8d97aa;">&copy; ${yr} PaySME. All rights reserved.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function money(value: number | string | null | undefined): string {
  const amount = Number(value || 0);
  return `N$${amount.toLocaleString("en-NA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function paymentStatusForRow(row: TransactionReportRow): "Paid" | "Pending" {
  const isPaid = String(row.status || "").toLowerCase() === "paid" ||
    Number(row.amount_paid || 0) > 0 ||
    Boolean(row.paid_date);
  return isPaid ? "Paid" : "Pending";
}

function isPaysmeVendorRow(row: TransactionReportRow): boolean {
  const paymentType = String(row.payment_type || "").toLowerCase();
  return paymentType.includes("paysme") || paymentType.includes("vendor");
}

function payoutStatusLabel(status: string): string {
  return String(status || "pending")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function buildTransactionReportCsv(rows: TransactionReportRow[], stats: Record<string, number>): string {
  const headers = [
    "Generated Code",
    "Transaction ID",
    "Invoice ID",
    "Paycode Status",
    "Payout Status",
    "Type",
    "Payment Type",
    "Amount",
    "Amount Paid",
    "Fee",
    "PaySME Vendor Sale",
    "PaySME Vendor Fee",
    "Client Type",
    "Email",
    "Mobile",
    "Generated Date",
    "Paid Date",
    "Total Paid to Date",
  ];

  const body = rows.map((row, index) => [
    row.generated_code,
    row.transaction_id,
    row.invoice_id,
    row.status,
    row.payout_status || "N/A",
    row.type,
    row.payment_type,
    row.amount,
    row.amount_paid,
    row.fee ?? "",
    isPaysmeVendorRow(row) && paymentStatusForRow(row) === "Paid" ? row.amount_paid || row.amount : "",
    isPaysmeVendorRow(row) && paymentStatusForRow(row) === "Paid" ? row.fee ?? 0 : "",
    row.client_type,
    row.email,
    row.mobile,
    row.generated_date,
    row.paid_date,
    index === 0 ? Number(stats?.totalPaid || 0) : "",
  ].map(csvEscape).join(","));

  return [headers.map(csvEscape).join(","), ...body].join("\n");
}

function countBy(rows: TransactionReportRow[], key: keyof TransactionReportRow): Record<string, number> {
  return rows.reduce((acc, row) => {
    const label = String(row[key] || "Unknown");
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function percentOf(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

function reportPeriodFromFilters(filters: Record<string, string> | undefined, fallback = "All available transactions"): string {
  if (!filters) return fallback;
  const from = filters.date_from && filters.date_from !== "Not set" ? filters.date_from : "";
  const to = filters.date_to && filters.date_to !== "Not set" ? filters.date_to : "";
  if (from && to) return `${from} - ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Through ${to}`;
  return filters.period && filters.period !== "All Months" ? filters.period : fallback;
}

function buildTransactionReportEmail(
  businessName: string,
  filters: Record<string, string>,
  stats: Record<string, number>,
  rowCount: number,
  periodLabel: string,
): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:680px;margin:0 auto;padding:28px 14px;">
      <div style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 14px 38px rgba(17,24,39,0.10);">
        <div style="background:#262b28;padding:28px 34px;text-align:center;border-bottom:5px solid #f6c431;">
          <img src="https://paysme.site/images/paysme-logo-email.png" alt="PaySME" style="display:block;margin:0 auto;max-width:250px;width:78%;height:auto;" />
        </div>
        <div style="padding:34px;">
          <h1 style="margin:0 0 8px;font-size:26px;line-height:1.2;text-align:center;color:#111827;">Transaction Report</h1>
          <p style="margin:0 auto 24px;max-width:520px;font-size:15px;line-height:1.6;text-align:center;color:#4b5563;">
            Your transaction report for ${businessName || "your PaySME account"} is attached as a PDF and Excel-compatible CSV.
          </p>

          <div style="background:#fff8df;border:1px solid #f6c431;border-radius:10px;padding:18px 20px;margin:0 0 22px;">
            <p style="margin:0 0 12px;font-size:12px;letter-spacing:1.8px;font-weight:700;color:#6b5a20;text-transform:uppercase;">Report summary</p>
            <p style="margin:0 0 8px;font-size:14px;color:#374151;">Period: <strong>${periodLabel}</strong></p>
            <p style="margin:0 0 8px;font-size:14px;color:#374151;">Rows included: <strong>${rowCount}</strong></p>
            <p style="margin:0 0 8px;font-size:14px;color:#374151;">Revenue generated: <strong>${money(stats?.revenueGenerated)}</strong></p>
            <p style="margin:0 0 8px;font-size:14px;color:#374151;">Total fees: <strong>${money(stats?.totalFees)}</strong></p>
            <p style="margin:0 0 8px;font-size:14px;color:#374151;">PaySME Vendor sales: <strong>${money(stats?.paysmeVendorReceivable)}</strong></p>
            <p style="margin:0 0 8px;font-size:14px;color:#374151;">PaySME Vendor fees: <strong>${money(stats?.paysmeVendorFees)}</strong></p>
            <p style="margin:0 0 8px;font-size:14px;color:#374151;">Due to you less fees: <strong>${money(stats?.totalDue)}</strong></p>
            <p style="margin:0 0 8px;font-size:14px;color:#374151;">Total paid to date: <strong>${money(stats?.totalPaid)}</strong></p>
            <p style="margin:0;font-size:14px;color:#374151;">Total invoiced: <strong>${money(stats?.totalInvoiced)}</strong></p>
          </div>
        </div>
        <div style="background:#151827;padding:22px 30px;text-align:center;">
          <p style="margin:0 0 6px;font-size:13px;color:#f9fafb;font-weight:700;">PaySME</p>
          <p style="margin:0;font-size:12px;color:#b7c2d6;">Bridging Wallets, Apps &amp; Websites</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

async function buildTransactionReportPdf(
  businessName: string,
  filters: Record<string, string>,
  stats: Record<string, number>,
  rows: TransactionReportRow[],
  periodLabel: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const monospace = await pdf.embedFont(StandardFonts.Courier);
  const charcoal = rgb(0.09, 0.12, 0.10);
  const charcoalSoft = rgb(0.14, 0.17, 0.14);
  const gold = rgb(0.96, 0.77, 0.19);
  const goldText = rgb(0.54, 0.42, 0);
  const cream = rgb(0.98, 0.97, 0.94);
  const ink = rgb(0.13, 0.14, 0.12);
  const muted = rgb(0.48, 0.51, 0.47);
  const line = rgb(0.89, 0.88, 0.85);
  const rowAlt = rgb(0.96, 0.95, 0.93);
  const green = rgb(0.18, 0.62, 0.35);
  const greenBg = rgb(0.91, 0.96, 0.93);
  const amber = rgb(0.73, 0.50, 0.05);
  const amberBg = rgb(0.98, 0.94, 0.84);
  const red = rgb(0.75, 0.22, 0.17);
  const redBg = rgb(0.98, 0.91, 0.89);

  const width = 595.28;
  const height = 841.89;
  const margin = 28;
  const contentWidth = width - margin * 2;
  let logoImage: PDFImage | null = null;

  try {
    const logoResponse = await fetch("https://paysme.site/images/paysme-logo-email.png");
    const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
    const contentType = logoResponse.headers.get("content-type") || "";
    logoImage = contentType.includes("jpeg") || contentType.includes("jpg")
      ? await pdf.embedJpg(logoBytes)
      : await pdf.embedPng(logoBytes);
  } catch (_error) {
    logoImage = null;
  }

  let page = pdf.addPage([width, height]);
  let y = 720;

  const safeText = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  const fitText = (text: string, maxWidth: number, size: number, useBold = false): string => {
    const activeFont = useBold ? bold : font;
    let value = safeText(text);
    while (value.length > 0 && activeFont.widthOfTextAtSize(value, size) > maxWidth) {
      value = value.slice(0, -1);
    }
    return value.length < safeText(text).length ? `${value.slice(0, Math.max(0, value.length - 1))}...` : value;
  };

  const drawHeader = () => {
    page.drawRectangle({ x: 0, y: height - 64, width, height: 64, color: charcoal });
    page.drawRectangle({ x: 0, y: height - 67, width, height: 3, color: gold });
    if (logoImage) {
      const logoBox = { x: margin, y: height - 58, width: 145, height: 46 };
      const logoSize = logoImage.scaleToFit(logoBox.width, logoBox.height);
      page.drawImage(logoImage, {
        x: logoBox.x + (logoBox.width - logoSize.width) / 2,
        y: logoBox.y + (logoBox.height - logoSize.height) / 2,
        width: logoSize.width,
        height: logoSize.height,
      });
    } else {
      page.drawText("PaySME", { x: margin, y: height - 40, size: 20, font: bold, color: rgb(1, 1, 1) });
    }
    page.drawText("Transaction Report", { x: margin + 158, y: height - 38, size: 16, font: bold, color: gold });
    page.drawText(fitText(`Prepared for ${businessName || "Merchant account"}`, 250, 9), { x: margin + 158, y: height - 52, size: 9, font, color: rgb(0.79, 0.80, 0.78) });
    page.drawRectangle({ x: width - 166, y: height - 47, width: 138, height: 20, color: charcoalSoft });
    page.drawText(fitText(new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }), 118, 8), {
      x: width - 156,
      y: height - 40,
      size: 8,
      font: bold,
      color: rgb(0.97, 0.85, 0.51),
    });
  };

  const addPage = () => {
    page = pdf.addPage([width, height]);
    drawHeader();
    y = 720;
  };

  const newPageIfNeeded = (needed = 60) => {
    if (y < needed) addPage();
  };

  const drawSectionTitle = (title: string) => {
    newPageIfNeeded(86);
    page.drawText(title.toUpperCase(), { x: margin, y, size: 13, font: bold, color: ink });
    y -= 10;
    page.drawRectangle({ x: margin, y, width: contentWidth, height: 2, color: gold });
    y -= 18;
  };

  const drawBadge = (label: string, x: number, badgeY: number) => {
    const normalized = label.toLowerCase();
    const bg = normalized === "paid" ? greenBg : normalized === "failed" || normalized === "expired" ? redBg : amberBg;
    const fg = normalized === "paid" ? green : normalized === "failed" || normalized === "expired" ? red : amber;
    page.drawRectangle({ x, y: badgeY - 2, width: 62, height: 16, color: bg });
    page.drawText(fitText(label.toUpperCase(), 52, 7, true), { x: x + 5, y: badgeY + 3, size: 7, font: bold, color: fg });
  };

  drawHeader();
  drawSectionTitle("Summary");

  const summary = [
    { label: "Revenue generated", value: money(stats?.revenueGenerated), accent: false },
    { label: "Total fees", value: money(stats?.totalFees), accent: false },
    { label: "Total invoiced", value: money(stats?.totalInvoiced), accent: false },
    { label: "Codes generated", value: String(stats?.codesGenerated ?? rows.length), accent: false },
    { label: "PaySME Vendor sales", value: money(stats?.paysmeVendorReceivable), accent: false },
    { label: "PaySME Vendor fees", value: money(stats?.paysmeVendorFees), accent: false },
    { label: "Due to you (less fees)", value: money(stats?.totalDue), accent: true },
    { label: "Total paid to date", value: money(stats?.totalPaid), accent: false },
  ];

  const cardGap = 8;
  const cardWidth = (contentWidth - cardGap * 3) / 4;
  const cardHeight = 58;
  summary.forEach((item, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = margin + col * (cardWidth + cardGap);
    const cardY = y - row * (cardHeight + 8) - cardHeight;
    page.drawRectangle({ x, y: cardY, width: cardWidth, height: cardHeight, color: item.accent ? cream : rgb(1, 1, 1), borderColor: line, borderWidth: 1 });
    page.drawRectangle({ x, y: cardY, width: 3, height: cardHeight, color: item.accent ? gold : line });
    page.drawText(fitText(item.label.toUpperCase(), cardWidth - 18, 7, true), { x: x + 11, y: cardY + 36, size: 7, font: bold, color: muted });
    page.drawText(fitText(item.value, cardWidth - 18, 16, true), { x: x + 11, y: cardY + 14, size: 16, font: bold, color: item.accent ? goldText : ink });
  });
  y -= 132;
  page.drawText(fitText(`Report period: ${periodLabel}`, contentWidth, 9), { x: margin, y, size: 9, font, color: muted });
  y -= 28;

  drawSectionTitle("Breakdown");
  const statusCounts = countBy(rows, "status");
  const paidRows = rows.filter(row => paymentStatusForRow(row) === "Paid");
  const paymentCounts = countBy(paidRows, "payment_type");

  const drawBreakdown = (title: string, counts: Record<string, number>, x: number) => {
    const entries = Object.entries(counts);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    page.drawText(title, { x, y, size: 11, font: bold, color: ink });
    if (!entries.length) {
      page.drawText("No paid transactions", { x, y: y - 24, size: 9, font, color: muted });
      return;
    }
    let barX = x;
    const barY = y - 24;
    const barWidth = (contentWidth - 28) / 2;
    const palette = [amber, green, red, charcoalSoft, gold];
    entries.forEach(([, value], index) => {
      const segmentWidth = barWidth * percentOf(value, total);
      page.drawRectangle({ x: barX, y: barY, width: segmentWidth, height: 14, color: palette[index % palette.length] });
      barX += segmentWidth;
    });
    let legendY = y - 46;
    entries.forEach(([label, value], index) => {
      const pct = Math.round(percentOf(value, total) * 100);
      page.drawRectangle({ x, y: legendY, width: 9, height: 9, color: palette[index % palette.length] });
      page.drawText(fitText(`${label} ${value} (${pct}%)`, barWidth - 18, 9), { x: x + 16, y: legendY, size: 9, font, color: ink });
      legendY -= 15;
    });
  };

  drawBreakdown("By paycode status", statusCounts, margin);
  drawBreakdown("By payment type", paymentCounts, margin + (contentWidth + 28) / 2);
  y -= 110;

  drawSectionTitle("Transactions");
  page.drawText(`Showing ${rows.length} of ${rows.length} records`, { x: margin, y: y + 7, size: 9, font, color: muted });
  y -= 8;

  const drawTableHeader = () => {
    page.drawRectangle({ x: margin, y: y - 21, width: contentWidth, height: 24, color: charcoal });
    page.drawText("GENERATED CODE", { x: margin + 10, y: y - 12, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText("PAYCODE STATUS", { x: margin + 135, y: y - 12, size: 7, font: bold, color: rgb(1, 1, 1) });
    page.drawText("PAYOUT STATUS", { x: margin + 205, y: y - 12, size: 7, font: bold, color: rgb(1, 1, 1) });
    page.drawText("PAYMENT TYPE", { x: margin + 275, y: y - 12, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText("AMOUNT", { x: margin + 405, y: y - 12, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText("FEE", { x: margin + 480, y: y - 12, size: 8, font: bold, color: rgb(1, 1, 1) });
    y -= 24;
  };

  drawTableHeader();
  rows.forEach((row, index) => {
    newPageIfNeeded(76);
    if (y > 719) drawTableHeader();
    const rowHeight = 28;
    if (index % 2 === 1) {
      page.drawRectangle({ x: margin, y: y - rowHeight + 4, width: contentWidth, height: rowHeight, color: rowAlt });
    }
    page.drawLine({ start: { x: margin, y: y - rowHeight + 4 }, end: { x: margin + contentWidth, y: y - rowHeight + 4 }, thickness: 0.5, color: line });
    page.drawText(fitText(row.generated_code, 115, 9), { x: margin + 10, y: y - 14, size: 9, font: monospace, color: ink });
    drawBadge(row.status || "Pending", margin + 135, y - 18);
    drawBadge(row.payout_status || "N/A", margin + 205, y - 18);
    page.drawText(fitText(row.payment_type || "Payment pending", 118, 9), { x: margin + 275, y: y - 14, size: 9, font, color: ink });
    page.drawText(fitText(money(row.amount), 65, 9, true), { x: margin + 405, y: y - 14, size: 9, font: bold, color: ink });
    page.drawText(fitText(row.fee === null ? "Pending" : money(row.fee), 50, 9), { x: margin + 480, y: y - 14, size: 9, font, color: row.fee === null ? muted : ink });
    y -= rowHeight;
  });

  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawLine({ start: { x: margin, y: 34 }, end: { x: width - margin, y: 34 }, thickness: 0.5, color: line });
    pdfPage.drawText(fitText(`PaySME - Confidential transaction report for ${businessName || "Merchant account"}`, 360, 8), {
      x: margin,
      y: 20,
      size: 8,
      font,
      color: muted,
    });
    pdfPage.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: width - 94,
      y: 20,
      size: 8,
      font,
      color: muted,
    });
  });

  return await pdf.save();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      type,
      merchant_id,
      email,
      reset_link,
      invoice_number,
      fee_amount,
      generated_code,
      payment_link,
      due_date,
      filters,
      stats,
      period_label,
      rows,
    } =
      (await req.json()) as EmailRequest;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let merchantData: MerchantData | null = null;

    if (merchant_id) {
      const { data } = await supabaseAdmin
        .from("merchants")
        .select("merchant_id, vendor_id, email, business_name")
        .eq("merchant_id", merchant_id)
        .single();
      merchantData = data;
    } else if (email) {
      const { data } = await supabaseAdmin
        .from("merchants")
        .select("merchant_id, vendor_id, email, business_name")
        .eq("email", email)
        .single();
      merchantData = data;
    }

    if (!merchantData) {
      return new Response(
        JSON.stringify({ error: "Merchant not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { business_name, email: merchantEmail, merchant_id: mId, vendor_id } = merchantData;

    if (type === "welcome") {
      const html = buildWelcomeEmail(business_name, merchantEmail, mId, vendor_id);
      await sendSmtpEmail(merchantEmail, "Welcome to PaySME – Your Account Details", html);
    } else if (type === "password_reset" || type === "admin_password_reset") {
      if (!reset_link) {
        return new Response(
          JSON.stringify({ error: "reset_link is required for password reset emails" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const subject = type === "admin_password_reset" 
        ? "PaySME – Admin Password Reset" 
        : "PaySME – Password Reset Request";
      const html = buildPasswordResetEmail(business_name, merchantEmail, mId, vendor_id, reset_link);
      await sendSmtpEmail(merchantEmail, subject, html);
    } else if (type === "password_change_otp") {
      if (!otp) {
        return new Response(
          JSON.stringify({ error: "otp is required for password change OTP emails" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const html = buildPasswordChangeOtpEmail(business_name, merchantEmail, vendor_id, otp);
      await sendSmtpEmail(merchantEmail, "PaySME password change OTP", html);
    } else if (type === "merchant_fee_invoice") {
      if (!invoice_number || !fee_amount || !generated_code || !payment_link) {
        return new Response(
          JSON.stringify({ error: "invoice_number, fee_amount, generated_code and payment_link are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const html = buildMerchantFeeInvoiceEmail(
        business_name,
        merchantEmail,
        vendor_id,
        invoice_number,
        fee_amount,
        generated_code,
        payment_link,
        due_date || ""
      );
      await sendSmtpEmail(merchantEmail, `PaySME fee invoice ${invoice_number}`, html);
    } else if (type === "transaction_report") {
      if (!Array.isArray(rows) || !stats || !filters) {
        return new Response(
          JSON.stringify({ error: "filters, stats and rows are required for transaction reports" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const reportDate = new Date().toISOString().slice(0, 10);
      const safeName = (business_name || "merchant")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "merchant";
      const transactionIds = Array.from(new Set(
        rows.map((row) => String(row.transaction_id || "").trim()).filter(Boolean),
      ));
      const payoutRecords: Array<{
        payout_id: string;
        source_transaction_id: string | null;
        transaction_ids: string[] | null;
        status: string;
        created_at: string;
      }> = [];

      for (let index = 0; index < transactionIds.length; index += 200) {
        const transactionIdBatch = transactionIds.slice(index, index + 200);
        const [sourceResult, legacyResult] = await Promise.all([
          supabaseAdmin
            .from("merchant_payouts")
            .select("payout_id, source_transaction_id, transaction_ids, status, created_at")
            .eq("merchant_id", mId)
            .in("source_transaction_id", transactionIdBatch),
          supabaseAdmin
            .from("merchant_payouts")
            .select("payout_id, source_transaction_id, transaction_ids, status, created_at")
            .eq("merchant_id", mId)
            .overlaps("transaction_ids", transactionIdBatch),
        ]);

        if (sourceResult.error) throw sourceResult.error;
        if (legacyResult.error) throw legacyResult.error;
        payoutRecords.push(...(sourceResult.data || []), ...(legacyResult.data || []));
      }

      const uniquePayouts = Array.from(
        new Map(payoutRecords.map((payout) => [payout.payout_id, payout])).values(),
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const payoutStatusByTransaction = new Map<string, string>();

      uniquePayouts.forEach((payout) => {
        const linkedTransactionIds = new Set([
          payout.source_transaction_id,
          ...(payout.transaction_ids || []),
        ].filter((transactionId): transactionId is string => Boolean(transactionId)));

        linkedTransactionIds.forEach((transactionId) => {
          const key = transactionId.trim().toLowerCase();
          if (key && !payoutStatusByTransaction.has(key)) {
            payoutStatusByTransaction.set(key, payoutStatusLabel(payout.status));
          }
        });
      });

      const reportRows = rows.map((row) => {
        const linkedStatus = payoutStatusByTransaction.get(String(row.transaction_id || "").trim().toLowerCase());
        const fallbackStatus = isPaysmeVendorRow(row) && paymentStatusForRow(row) === "Paid"
          ? "Not queued"
          : "N/A";

        return {
          ...row,
          payout_status: linkedStatus || (row.payout_status && row.payout_status !== "N/A" ? row.payout_status : fallbackStatus),
        };
      });
      const periodLabel = period_label || reportPeriodFromFilters(filters);
      const csv = buildTransactionReportCsv(reportRows, stats);
      const pdf = await buildTransactionReportPdf(business_name, filters, stats, reportRows, periodLabel);
      const html = buildTransactionReportEmail(business_name, filters, stats, rows.length, periodLabel);

      await sendSmtpEmail(
        merchantEmail,
        `PaySME transaction report - ${reportDate}`,
        html,
        [
          {
            filename: `paysme-${safeName}-transactions-${reportDate}.csv`,
            content: textToBase64(csv),
            encoding: "base64",
            contentType: "text/csv; charset=utf-8",
          },
          {
            filename: `paysme-${safeName}-transactions-${reportDate}.pdf`,
            content: bytesToBase64(pdf),
            encoding: "base64",
            contentType: "application/pdf",
          },
        ],
      );
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid email type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: `${type} email sent to ${merchantEmail}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Email sending error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
