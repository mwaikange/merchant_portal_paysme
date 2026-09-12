import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  QrCode,
  RefreshCw,
  ShoppingBasket,
  Trash2,
  Upload,
  Users,
  UserPlus,
  KeyRound,
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatNad } from "@/lib/formatters";
import { useAuth } from "@/contexts/AuthContext";
import { QrEmailDialog } from "@/components/QrEmailDialog";
import {
  createMerchantQrLinksBulk,
  deleteMerchantQrLink,
  downloadQrSvg,
  getMerchantQrLink,
  listMerchantQrLinks,
  MerchantQrPaymentLink,
  qrSvgDataUri,
  setMerchantQrLinkStatus,
} from "@/lib/merchantQrLinks";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type BasketUser = { basket_user_id: string; name: string; mobile_number: string; status: "active" | "inactive"; created_at: string; last_sign_in_at?: string | null };

const QrPaymentLinks = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { merchant } = useAuth();
  const [links, setLinks] = useState<MerchantQrPaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MerchantQrPaymentLink | null>(null);
  const [emailLink, setEmailLink] = useState<MerchantQrPaymentLink | null>(null);
  const [activeSection, setActiveSection] = useState<"links" | "basket">("links");
  const [importing, setImporting] = useState(false);
  const [basketUsers, setBasketUsers] = useState<BasketUser[]>([]);
  const [tellerName, setTellerName] = useState("");
  const [tellerMobile, setTellerMobile] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; mobile: string; password: string } | null>(null);
  const [savingTeller, setSavingTeller] = useState(false);
  const basketAppUrl = String(import.meta.env.VITE_QR_BASKET_APP_URL || "").trim();
  const basketAppReady = /^https:\/\//i.test(basketAppUrl) || /^paysme-qrbasket:\/\//i.test(basketAppUrl);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      setLinks(await listMerchantQrLinks());
    } catch (error) {
      toast({
        title: "Could not load QR payment links",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const invokeTellers = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("merchant-basket-users", { body });
    if (error || !data?.ok) throw new Error(data?.error || error?.message || "Teller request failed");
    return data;
  };

  const loadTellers = useCallback(async () => {
    try { const data = await invokeTellers({ action: "list" }); setBasketUsers(data.users || []); }
    catch (error) { console.warn("Could not load QR Basket tellers", error); }
  }, []);

  useEffect(() => { if (activeSection === "basket") void loadTellers(); }, [activeSection, loadTellers]);

  const downloadTemplate = () => {
    const csv = "invoice_id,amount,product_description,limit_per_qr_code\nEVENT-001,100.00,Event ticket,10\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "paysme-qr-products-template.csv"; anchor.click(); URL.revokeObjectURL(url);
  };

  const importProducts = async (file: File) => {
    setImporting(true);
    try {
      let rows: Record<string, unknown>[] = [];
      if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsxFile } = await import("read-excel-file");
        const sheetRows = await readXlsxFile(file);
        const headers = (sheetRows.shift() || []).map((header) => String(header || "").toLowerCase().trim());
        rows = sheetRows.filter((row) => row.some((value) => value !== null && String(value).trim())).map((row) => Object.fromEntries(row.map((value, index) => [headers[index], value ?? ""])));
      } else {
        const text = await file.text();
        const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
        const parse = (line: string) => { const values: string[] = []; let value = ""; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { values.push(value.trim()); value = ""; } else value += char; } values.push(value.trim()); return values; };
        const headers = parse(lines.shift() || "").map((header) => header.toLowerCase().trim());
        rows = lines.map((line) => Object.fromEntries(parse(line).map((value, index) => [headers[index], value])));
      }
      const products = rows.map((row) => { const limit = Number(row.limit_per_qr_code || 1); return { product_reference: row.invoice_id, amount: row.amount, description: row.product_description, allow_quantity: limit > 1, max_quantity: limit > 1 ? limit : 1 }; });
      const created = await createMerchantQrLinksBulk(products);
      toast({ title: `${created.length} QR products imported`, description: "They are now available in QR Payments and the QR Basket App." });
      await loadLinks();
    } catch (error) { toast({ title: "Product import failed", description: error instanceof Error ? error.message : "Check the template and try again.", variant: "destructive" }); }
    finally { setImporting(false); }
  };

  const createTeller = async () => {
    setSavingTeller(true);
    try {
      await invokeTellers({ action: "create", name: tellerName, mobile_number: tellerMobile, temporary_password: temporaryPassword });
      setCreatedCredentials({ name: tellerName, mobile: tellerMobile, password: temporaryPassword });
      setTellerName(""); setTellerMobile(""); setTemporaryPassword(""); await loadTellers();
      toast({ title: "QR Basket teller created", description: "Copy the temporary login details and give them to the teller manually." });
    } catch (error) { toast({ title: "Teller was not created", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); }
    finally { setSavingTeller(false); }
  };

  const copyLink = async (link: MerchantQrPaymentLink) => {
    try {
      await navigator.clipboard.writeText(link.hosted_url);
      toast({ title: "Payment link copied" });
    } catch {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "destructive" });
    }
  };

  const viewQr = async (link: MerchantQrPaymentLink) => {
    setBusyId(link.qr_payment_link_id);
    try {
      setPreview(await getMerchantQrLink(link.qr_payment_link_id));
    } catch (error) {
      toast({
        title: "Could not open QR code",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const changeStatus = async (link: MerchantQrPaymentLink) => {
    const status = link.status === "active" ? "inactive" : "active";
    setBusyId(link.qr_payment_link_id);
    try {
      const updated = await setMerchantQrLinkStatus(link.qr_payment_link_id, status);
      setLinks((current) => current.map((item) =>
        item.qr_payment_link_id === link.qr_payment_link_id
          ? {
              ...item,
              ...updated,
              scheduled_deletion_at: status === "inactive" && !item.has_payment_history && updated.deactivated_at
                ? new Date(new Date(updated.deactivated_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
                : null,
            }
          : item
      ));
      toast({
        title: status === "active" ? "QR payment link reactivated" : "QR payment link archived",
        description: status === "inactive"
          ? "It is hidden from active products and scheduled for deletion after 30 days if it has no payment history."
          : "Customers can use this QR payment link again.",
      });
    } catch (error) {
      toast({
        title: "Could not update QR payment link",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const deleteLink = async (link: MerchantQrPaymentLink) => {
    if (link.has_payment_history) {
      toast({
        title: "This QR product cannot be deleted",
        description: "It has payment history and must remain archived to protect transaction records.",
        variant: "destructive",
      });
      return;
    }
    if (!window.confirm(`Delete “${link.product_reference}” permanently? This cannot be undone.`)) return;

    setBusyId(link.qr_payment_link_id);
    try {
      await deleteMerchantQrLink(link.qr_payment_link_id);
      setLinks((current) => current.filter((item) => item.qr_payment_link_id !== link.qr_payment_link_id));
      toast({ title: "QR payment link deleted" });
    } catch (error) {
      toast({
        title: "Could not delete QR payment link",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const openBasketApp = () => {
    if (!basketAppReady) return;
    if (/^https:\/\//i.test(basketAppUrl)) {
      window.open(basketAppUrl, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.assign(basketAppUrl);
  };

  const activeLinks = links.filter((link) => link.status === "active");
  const archivedLinks = links.filter((link) => link.status === "inactive");

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100 p-6 md:p-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="grid max-w-xl grid-cols-2 overflow-hidden rounded-md border border-[#f6c431]/70">
            <button
              type="button"
              onClick={() => setActiveSection("links")}
              aria-pressed={activeSection === "links"}
              className={`flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition ${
                activeSection === "links"
                  ? "bg-[#f6c431] text-[#171d19]"
                  : "bg-[#202720] text-white hover:bg-[#2b332c]"
              }`}
            >
              <QrCode className="h-4 w-4" />
              QR Payments
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("basket")}
              aria-pressed={activeSection === "basket"}
              className={`flex items-center justify-center gap-2 border-l border-[#f6c431]/70 px-5 py-3 text-sm font-semibold transition ${
                activeSection === "basket"
                  ? "bg-[#f6c431] text-[#171d19]"
                  : "bg-[#202720] text-white hover:bg-[#2b332c]"
              }`}
            >
              <ShoppingBasket className="h-4 w-4" />
              QR Basket
            </button>
          </div>

          <div className={activeSection === "links" ? "space-y-6" : "hidden"}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-950">QR Payments</h1>
              <p className="mt-1 text-sm text-gray-600">
                Manage reusable product QR codes. Every customer payment remains visible under Track Transactions.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void loadLinks()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button onClick={() => navigate("/portal/api-integration")} className="bg-[#f6c431] text-[#171d19] hover:bg-[#eab72b]">
                <QrCode className="mr-2 h-4 w-4" />
                Create QR link
              </Button>
            </div>
          </div>

          {loading ? (
            <Card><CardContent className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></CardContent></Card>
          ) : links.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No QR payment links yet</CardTitle>
                <CardDescription>Enable “Generate a reusable QR payment link” when generating an integration.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => navigate("/portal/api-integration")}>Create your first QR link</Button>
              </CardContent>
            </Card>
          ) : activeLinks.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No active QR payment links</CardTitle>
                <CardDescription>Reactivate a product from the archive or create a new QR link.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {activeLinks.map((link) => {
                const busy = busyId === link.qr_payment_link_id;
                return (
                  <Card key={link.qr_payment_link_id} className="overflow-hidden">
                    <CardHeader className="border-b bg-white">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="break-words">{link.product_reference}</CardTitle>
                          <CardDescription>{link.description || "Reusable hosted payment QR"}</CardDescription>
                        </div>
                        <Badge className="bg-green-600 text-white">Active</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 p-5">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg bg-gray-50 p-3">
                          <p className="text-xs text-gray-500">{link.allow_quantity ? "Unit price" : "Price"}</p>
                          <p className="mt-1 font-bold">{formatNad(Number(link.amount))}</p>
                          {link.allow_quantity && (
                            <p className="mt-1 text-xs text-gray-500">Customer selects 1–{link.max_quantity}</p>
                          )}
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3">
                          <p className="text-xs text-gray-500">Payments</p>
                          <p className="mt-1 font-bold">{link.paid_count || 0}</p>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3">
                          <p className="text-xs text-gray-500">Received</p>
                          <p className="mt-1 font-bold">{formatNad(Number(link.total_received || 0))}</p>
                        </div>
                      </div>
                      <p className="break-all rounded-lg border bg-gray-50 p-3 font-mono text-xs text-gray-600">{link.hosted_url}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => void viewQr(link)} disabled={busy}>
                          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                          View QR
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void copyLink(link)}>
                          <Copy className="mr-2 h-4 w-4" /> Copy link
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEmailLink(link)} disabled={busy}>
                          <Mail className="mr-2 h-4 w-4" /> Email QR
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void changeStatus(link)}
                          disabled={busy}
                          className="text-amber-700"
                        >
                          <Archive className="mr-2 h-4 w-4" /> Archive
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void deleteLink(link)}
                          disabled={busy || link.has_payment_history}
                          title={link.has_payment_history ? "Archive this product to preserve its payment history" : "Delete permanently"}
                          className="text-red-700"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {archivedLinks.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Archived QR products</CardTitle>
                <CardDescription>
                  Unused products are deleted automatically after 30 days. Products with payment history are retained.
                </CardDescription>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {archivedLinks.map((link) => {
                  const busy = busyId === link.qr_payment_link_id;
                  return (
                    <div
                      key={link.qr_payment_link_id}
                      className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-950">{link.product_reference}</p>
                          <Badge variant="secondary">Archived</Badge>
                          <span className="text-sm font-medium text-gray-700">{formatNad(Number(link.amount))}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {link.has_payment_history
                            ? `${link.paid_count || 0} payment${link.paid_count === 1 ? "" : "s"} · retained to protect transaction history`
                            : link.scheduled_deletion_at
                              ? `Deletes automatically on ${new Date(link.scheduled_deletion_at).toLocaleDateString()}`
                              : "Scheduled for automatic deletion after 30 days"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="outline" onClick={() => void changeStatus(link)} disabled={busy}>
                          <ArchiveRestore className="mr-2 h-4 w-4" /> Reactivate
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void deleteLink(link)}
                          disabled={busy || link.has_payment_history}
                          title={link.has_payment_history ? "Cannot delete a product with payment history" : "Delete permanently"}
                          className="text-red-700"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
          </div>

          {activeSection === "basket" && (
            <Card className="overflow-hidden border-[#f6c431]/45">
              <CardHeader className="border-b bg-[#202720] text-white">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-[#f6c431] p-2 text-[#171d19]">
                    <ShoppingBasket className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-white">PaySME QR Basket App</CardTitle>
                    <CardDescription className="mt-1 text-white/70">
                      Build a multi-product customer basket and display one payment QR from your phone.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 p-6">
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border p-5" style={{ background: "#293229", borderColor: "rgba(255,255,255,0.2)", color: "white" }}>
                    <div className="flex items-start gap-3"><Upload className="mt-0.5 h-5 w-5 text-[#f6c431]" /><div><p className="font-bold text-white">Bulk product upload</p><p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.74)" }}>Create up to 500 reusable QR products from Excel or CSV. This uses the same validation and product endpoint as single QR creation.</p></div></div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={downloadTemplate}>Download CSV template</Button>
                      <Label className="inline-flex cursor-pointer items-center rounded-md bg-[#f6c431] px-4 py-2 text-sm font-semibold text-[#171d19] hover:bg-[#eab72b]">
                        {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        {importing ? "Importing…" : "Upload Excel or CSV"}
                        <Input type="file" accept=".csv,.xlsx" disabled={importing} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProducts(file); event.currentTarget.value = ""; }} />
                      </Label>
                    </div>
                    <p className="mt-3 text-xs" style={{ color: "rgba(255,255,255,0.62)" }}>Columns: invoice_id, amount, product_description, limit_per_qr_code. Every row automatically creates a reusable QR product.</p>
                  </div>

                  <div className="rounded-xl border p-5" style={{ background: "#293229", borderColor: "rgba(255,255,255,0.2)", color: "white" }}>
                    <div className="flex items-start gap-3"><UserPlus className="mt-0.5 h-5 w-5 text-[#f6c431]" /><div><p className="font-bold text-white">Add an event teller</p><p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.74)" }}>Tellers can sign in to the QR Basket App only. They cannot access the merchant portal, reports, settings or integrations.</p></div></div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3"><div><Label htmlFor="teller-name" className="text-white">Name</Label><Input id="teller-name" className="mt-1 border-white/25 bg-[#202720] text-white" value={tellerName} onChange={(e) => setTellerName(e.target.value)} /></div><div><Label htmlFor="teller-mobile" className="text-white">Mobile number</Label><Input id="teller-mobile" className="mt-1 border-white/25 bg-[#202720] text-white placeholder:text-white/40" placeholder="081…" value={tellerMobile} onChange={(e) => setTellerMobile(e.target.value)} /></div><div><Label htmlFor="teller-password" className="text-white">Temporary password</Label><Input id="teller-password" className="mt-1 border-white/25 bg-[#202720] text-white" type="text" minLength={8} value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} /></div></div>
                    <Button type="button" className="mt-3" disabled={savingTeller || tellerName.trim().length < 2 || temporaryPassword.length < 8} onClick={() => void createTeller()}>{savingTeller && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create teller login</Button>
                  </div>
                </div>

                {createdCredentials && <div className="rounded-xl border-2 border-green-400 bg-green-50 p-5"><p className="font-bold text-green-950">Give these login details to the teller now</p><p className="mt-1 text-sm text-green-800">The temporary password is displayed here only and is never stored in readable form.</p><div className="mt-3 grid gap-2 rounded-lg bg-white p-4 font-mono text-sm sm:grid-cols-3"><span>Name: <strong>{createdCredentials.name}</strong></span><span>Mobile: <strong>{createdCredentials.mobile}</strong></span><span>Password: <strong>{createdCredentials.password}</strong></span></div><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => { void navigator.clipboard.writeText(`PaySME QR Basket login\nName: ${createdCredentials.name}\nMobile: ${createdCredentials.mobile}\nTemporary password: ${createdCredentials.password}`); toast({ title: "Teller login copied" }); }}><Copy className="mr-2 h-4 w-4" />Copy login</Button></div>}

                <div className="rounded-xl border p-5" style={{ background: "#293229", borderColor: "rgba(255,255,255,0.2)", color: "white" }}>
                  <div className="flex items-center gap-2 text-white"><Users className="h-5 w-5 text-[#f6c431]" /><p className="font-bold">QR Basket tellers ({basketUsers.length})</p></div>
                  {basketUsers.length === 0 ? <p className="mt-3 text-sm" style={{ color: "rgba(255,255,255,0.66)" }}>No teller logins yet.</p> : <div className="mt-3 divide-y divide-white/15">{basketUsers.map((user) => <div key={user.basket_user_id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold text-white">{user.name}</p><p className="text-sm" style={{ color: "rgba(255,255,255,0.66)" }}>{user.mobile_number} · {user.last_sign_in_at ? `Last used ${new Date(user.last_sign_in_at).toLocaleString()}` : "Not used yet"}</p></div><div className="flex items-center gap-2"><Badge className={user.status === "active" ? "bg-green-600 text-white" : "bg-gray-500 text-white"}>{user.status}</Badge><Button size="sm" variant="outline" onClick={async () => { try { await invokeTellers({ action: "set_status", basket_user_id: user.basket_user_id, status: user.status === "active" ? "inactive" : "active" }); await loadTellers(); } catch (error) { toast({ title: "Teller status was not changed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); } }}>{user.status === "active" ? "Disable" : "Enable"}</Button><Button size="sm" variant="outline" title="Create a new temporary password" onClick={async () => { const password = window.prompt("Enter a new temporary password (at least 8 characters)"); if (!password) return; try { await invokeTellers({ action: "reset_password", basket_user_id: user.basket_user_id, temporary_password: password }); setCreatedCredentials({ name: user.name, mobile: user.mobile_number, password }); } catch (error) { toast({ title: "Password was not reset", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); } }}><KeyRound className="h-4 w-4" /></Button></div></div>)}</div>}
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border p-4" style={{ background: "#313b31", borderColor: "rgba(246,196,49,0.3)" }}>
                    <p className="font-semibold text-white">Choose products</p>
                    <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>Use active products already configured under QR Payments.</p>
                  </div>
                  <div className="rounded-lg border p-4" style={{ background: "#313b31", borderColor: "rgba(246,196,49,0.3)" }}>
                    <p className="font-semibold text-white">Set quantities</p>
                    <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>Build one order containing several products and quantities.</p>
                  </div>
                  <div className="rounded-lg border p-4" style={{ background: "#313b31", borderColor: "rgba(246,196,49,0.3)" }}>
                    <p className="font-semibold text-white">Show one QR</p>
                    <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>Let the customer scan and pay the server-calculated basket total.</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    onClick={openBasketApp}
                    disabled={!basketAppReady}
                    className="bg-[#f6c431] text-[#171d19] hover:bg-[#eab72b]"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {basketAppReady ? "Open QR Basket App" : "QR Basket App coming soon"}
                  </Button>
                  {!basketAppReady && (
                    <p className="text-sm text-gray-600">
                      The launch button will activate when the Basket App has a production download or launch URL.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{preview?.product_reference}</DialogTitle>
              <DialogDescription>
                {preview
                  ? `${formatNad(Number(preview.amount))}${preview.allow_quantity ? ` per unit · quantity 1–${preview.max_quantity}` : ""} reusable hosted payment QR`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            {preview?.qr_svg ? (
              <div className="space-y-4">
                <img src={qrSvgDataUri(preview.qr_svg)} alt={`QR code for ${preview.product_reference}`} className="mx-auto w-full max-w-72 rounded-xl border bg-white p-3" />
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => downloadQrSvg(preview)}>
                    <QrCode className="mr-2 h-4 w-4" /> Download QR
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={preview.hosted_url} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" /> Open page
                    </a>
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
        <QrEmailDialog
          link={emailLink}
          defaultEmail={merchant?.email || ""}
          onClose={() => setEmailLink(null)}
        />
      </div>
    </ProtectedRoute>
  );
};

export default QrPaymentLinks;
