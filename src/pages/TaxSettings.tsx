import { useEffect, useMemo, useState } from "react";
import { Calculator, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type TaxMode = "not_registered" | "vat_inclusive" | "vat_exclusive";
const NAMIBIA_VAT_RATE = 15;

const options: Array<{ value: TaxMode; title: string; description: string; customerMessage: string }> = [
  {
    value: "not_registered",
    title: "I do not charge VAT",
    description: "PaySME will not calculate or show VAT on your payment modals.",
    customerMessage: "No VAT line is shown. The paycode amount stays exactly as entered.",
  },
  {
    value: "vat_inclusive",
    title: "My prices already include VAT",
    description: "The amount entered when creating a paycode is the final customer total.",
    customerMessage: "Payment modals show “VAT included” and the VAT portion for clarity. Nothing is added.",
  },
  {
    value: "vat_exclusive",
    title: "Add VAT to my prices",
    description: "The amount entered when creating a paycode is before VAT.",
    customerMessage: "PaySME calculates VAT and adds it to the final amount on every payment modal.",
  },
];

const TaxSettings = () => {
  const { merchant, refreshMerchant } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<TaxMode>("not_registered");
  const [vatNumber, setVatNumber] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode((merchant?.tax_mode as TaxMode) || "not_registered");
    setVatNumber(merchant?.vat_registration_number || "");
  }, [merchant]);

  const preview = useMemo(() => {
    const base = 100;
    const percentage = NAMIBIA_VAT_RATE / 100;
    if (mode === "vat_inclusive") {
      const vat = base - base / (1 + percentage);
      return { price: base - vat, vat, total: base };
    }
    if (mode === "vat_exclusive") return { price: base, vat: base * percentage, total: base * (1 + percentage) };
    return { price: base, vat: 0, total: base };
  }, [mode]);

  const save = async () => {
    if (!merchant?.merchant_id) return;
    setSaving(true);
    const { error } = await supabase.from("merchants").update({
      tax_mode: mode,
      vat_rate: mode === "not_registered" ? 0 : NAMIBIA_VAT_RATE,
      vat_registration_number: mode === "not_registered" ? null : vatNumber.trim() || null,
      tax_settings_completed_at: new Date().toISOString(),
    }).eq("merchant_id", merchant.merchant_id);
    setSaving(false);
    if (error) {
      toast({ title: "Tax settings were not saved", description: error.message, variant: "destructive" });
      return;
    }
    await refreshMerchant();
    toast({ title: "Tax settings saved", description: "New paycodes and payment modals will use this VAT treatment." });
  };

  const selected = options.find((option) => option.value === mode)!;
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100 p-6 md:p-10">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-950">Tax settings</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-600">One clear VAT rule applies to Request to Pay, hosted links, snippets, API paycodes, subscription uploads, QR products and QR Baskets.</p>
          </div>
          <Card style={{ borderColor: "rgba(246,196,49,0.55)", background: "#283128" }}>
            <CardContent className="flex gap-3 p-5 text-sm" style={{ color: "#f8faf8" }}><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#f6c431]" /><p><strong className="text-white">Choose the option that matches your legal tax position.</strong> <span style={{ color: "rgba(255,255,255,0.76)" }}>PaySME displays and calculates VAT from this setting; it does not determine whether your business is required to register or charge VAT.</span></p></CardContent>
          </Card>
          <div className="grid gap-4">
            {options.map((option) => (
              <button key={option.value} type="button" onClick={() => setMode(option.value)} className="rounded-xl border-2 p-5 text-left transition" style={mode === option.value ? { borderColor: "#f6c431", background: "#fff8d8", color: "#171d19", boxShadow: "0 8px 24px rgba(246,196,49,0.12)" } : { borderColor: "rgba(246,196,49,0.42)", background: "#283128", color: "#ffffff" }}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 ${mode === option.value ? "border-[#202720] bg-[#f6c431]" : "border-gray-300"}`}>{mode === option.value && <CheckCircle2 className="h-4 w-4" />}</span>
                  <span><span className="block text-base font-bold" style={{ color: mode === option.value ? "#171d19" : "#ffffff" }}>{option.title}</span><span className="mt-1 block text-sm" style={{ color: mode === option.value ? "#4b5563" : "rgba(255,255,255,0.76)" }}>{option.description}</span><span className="mt-2 block text-sm font-medium" style={{ color: mode === option.value ? "#273027" : "#f7df87" }}>Customer sees: {option.customerMessage}</span></span>
                </div>
              </button>
            ))}
          </div>
          {mode !== "not_registered" && <Card style={{ background: "#283128", borderColor: "rgba(255,255,255,0.18)", color: "white" }}><CardHeader><CardTitle className="text-white">VAT details</CardTitle><CardDescription style={{ color: "rgba(255,255,255,0.72)" }}>Namibia VAT is fixed at 15% throughout PaySME.</CardDescription></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><div className="rounded-lg border border-[#f6c431]/40 bg-[#202720] p-4"><Label style={{ color: "rgba(255,255,255,0.72)" }}>VAT rate</Label><p className="mt-1 text-xl font-bold text-white">15%</p><p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.62)" }}>Fixed Namibian VAT rate</p></div><div className="space-y-2"><Label htmlFor="vat-number" className="text-white">VAT registration number (optional)</Label><Input id="vat-number" maxLength={60} value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="Enter registration number" className="border-white/25 bg-[#202720] text-white placeholder:text-white/40" /></div></CardContent></Card>}
          <Card className="overflow-hidden" style={{ background: "#283128", borderColor: "rgba(255,255,255,0.18)", color: "white" }}><CardHeader className="bg-[#202720] text-white"><CardTitle className="flex items-center gap-2 text-white"><Calculator className="h-5 w-5 text-[#f6c431]" />Payment modal preview</CardTitle><CardDescription style={{ color: "rgba(255,255,255,0.72)" }}>Example when you enter N$100.00 while generating a paycode.</CardDescription></CardHeader><CardContent className="space-y-3 p-6"><div className="flex justify-between text-white"><span>{mode === "not_registered" ? "Price" : "Price before VAT"}</span><strong>N$ {preview.price.toFixed(2)}</strong></div>{mode !== "not_registered" && <div className="flex justify-between text-white"><span>VAT (15%) {mode === "vat_inclusive" ? "— included" : ""}</span><strong>N$ {preview.vat.toFixed(2)}</strong></div>}<div className="flex justify-between border-t border-white/20 pt-3 text-lg text-white"><span>Customer pays</span><strong>N$ {preview.total.toFixed(2)}</strong></div><p className="rounded-lg border border-[#f6c431]/25 bg-[#202720] p-3 text-sm" style={{ color: "#f7df87" }}>{selected.customerMessage}</p></CardContent></Card>
          <div className="flex justify-end"><Button onClick={save} disabled={saving} className="min-w-44 bg-[#f6c431] text-[#171d19] hover:bg-[#eab72b]">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save tax settings</Button></div>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default TaxSettings;
