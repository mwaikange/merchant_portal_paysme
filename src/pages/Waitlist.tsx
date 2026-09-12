import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Rocket,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const paysmeLogo = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";
const merchantImages = [
  "/pay-home/merchants/merchant-store-ai.png",
  "/pay-home/merchants/merchant-bakery-ai.png",
  "/pay-home/merchants/merchant-grill-ai.png",
];

type WaitlistResponse = {
  ok?: boolean;
  already_joined?: boolean;
  waitlist_count?: number;
  error?: string;
};

const initialForm = {
  key_person_name: "",
  company_name: "",
  industry: "",
  town: "",
  email: "",
  mobile: "",
  website: "",
};

const Waitlist = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<WaitlistResponse | null>(null);

  const updateField = (field: keyof typeof initialForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errorMessage) setErrorMessage("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!consent) {
      setErrorMessage("Please confirm that PaySME may contact you about the launch.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase.functions.invoke<WaitlistResponse>("merchant-waitlist", {
        body: form,
      });
      if (error || !data?.ok) {
        let message = data?.error || error?.message || "Could not join the waitlist. Please try again.";
        const context = error && "context" in error ? error.context : null;
        if (context instanceof Response) {
          try {
            const details = await context.clone().json();
            if (details?.error) message = details.error;
          } catch {
            // Keep the safe fallback message.
          }
        }
        throw new Error(message);
      }
      setResult(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not join the waitlist. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#131a15] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-32 -top-36 h-96 w-96 rounded-full bg-[#f6c431]/10 blur-3xl" />
        <div className="absolute -bottom-44 right-[-5rem] h-[30rem] w-[30rem] rounded-full bg-emerald-600/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-white/[0.03] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <button type="button" onClick={() => navigate("/")} aria-label="PaySME home">
            <img src={paysmeLogo} alt="PaySME" className="h-10 w-auto md:h-12" />
          </button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/login")}
            className="text-white hover:bg-white/10 hover:text-[#f6c431]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Merchant sign in
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-81px)] max-w-7xl items-center gap-10 px-5 py-10 md:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-14">
        <section className="space-y-8">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#f6c431]/40 bg-[#f6c431]/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#f6c431]">
              <Sparkles className="h-4 w-4" />
              Launching soon
            </div>
            <h1 className="max-w-2xl text-4xl font-black leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl">
              Your business deserves
              <span className="block text-[#f6c431]">simpler payments.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              Join forward-thinking Namibian merchants preparing to accept smarter digital payments with PaySME.
              Tell us about your business and we’ll notify you when we launch.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: Rocket, title: "Early access", text: "Be among the first merchants invited." },
              { icon: BellRing, title: "Launch updates", text: "Know as soon as PaySME is ready." },
              { icon: ShieldCheck, title: "No commitment", text: "Joining the waitlist is completely free." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 backdrop-blur">
                <Icon className="mb-3 h-5 w-5 text-[#f6c431]" />
                <p className="font-bold">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/55">{text}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center">
            {merchantImages.map((src, index) => (
              <div
                key={src}
                className="-ml-3 first:ml-0 overflow-hidden rounded-full border-4 border-[#131a15] bg-[#202a22]"
                style={{ width: 64, height: 64, zIndex: merchantImages.length - index }}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
            <div className="ml-4">
              <p className="text-sm font-bold">Built for real businesses</p>
              <p className="text-xs text-white/55">From market stalls to growing companies</p>
            </div>
          </div>
        </section>

        <section className="lg:pl-4">
          <div className="relative overflow-hidden rounded-[28px] border border-white/15 bg-[#f7f7f2] text-[#172018] shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="h-1.5 bg-gradient-to-r from-[#f6c431] via-[#ffdb5c] to-[#2d8b78]" />
            <div className="p-6 sm:p-8 lg:p-10">
              {result ? (
                <div className="flex min-h-[580px] flex-col items-center justify-center text-center">
                  <div className="relative">
                    <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20" />
                    <div className="relative rounded-full bg-emerald-100 p-5 text-emerald-700">
                      <CheckCircle2 className="h-12 w-12" />
                    </div>
                  </div>
                  <p className="mt-8 text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                    {result.already_joined ? "You’re already on the list" : "Your place is saved"}
                  </p>
                  <h2 className="mt-3 text-3xl font-black sm:text-4xl">
                    We’ll see you at launch.
                  </h2>
                  <p className="mt-4 max-w-md leading-relaxed text-gray-600">
                    Thanks for your interest in PaySME. We’ll notify you using the contact details supplied when merchant access opens.
                  </p>
                  {Number(result.waitlist_count) > 0 && (
                    <div className="mt-8 rounded-2xl border border-[#f6c431]/50 bg-[#fff8dc] px-8 py-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#806500]">Merchant interest</p>
                      <p className="mt-1 text-3xl font-black">{result.waitlist_count}</p>
                      <p className="text-sm text-gray-600">business{result.waitlist_count === 1 ? "" : "es"} waiting for launch</p>
                    </div>
                  )}
                  <Button type="button" onClick={() => navigate("/")} className="mt-8 bg-[#172018] text-white hover:bg-[#263229]">
                    Explore PaySME
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="mb-7">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#a17b00]">Reserve your place</p>
                    <h2 className="mt-2 text-3xl font-black">Join the merchant waitlist</h2>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                      It takes less than a minute. We’ll notify you when PaySME launches.
                    </p>
                  </div>

                  <form onSubmit={submit} className="space-y-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="waitlist-person" className="flex items-center gap-2 font-bold">
                          <UserRound className="h-4 w-4 text-[#9b7600]" /> Key person name
                        </Label>
                        <Input
                          id="waitlist-person"
                          value={form.key_person_name}
                          onChange={(event) => updateField("key_person_name", event.target.value)}
                          placeholder="Your full name"
                          autoComplete="name"
                          maxLength={160}
                          required
                          className="h-12 border-gray-300 bg-white focus-visible:ring-[#f6c431]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="waitlist-company" className="flex items-center gap-2 font-bold">
                          <Building2 className="h-4 w-4 text-[#9b7600]" /> Company name
                        </Label>
                        <Input
                          id="waitlist-company"
                          value={form.company_name}
                          onChange={(event) => updateField("company_name", event.target.value)}
                          placeholder="Your business"
                          autoComplete="organization"
                          maxLength={180}
                          required
                          className="h-12 border-gray-300 bg-white focus-visible:ring-[#f6c431]"
                        />
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="waitlist-industry" className="flex items-center gap-2 font-bold">
                          <BriefcaseBusiness className="h-4 w-4 text-[#9b7600]" /> Industry
                        </Label>
                        <Input
                          id="waitlist-industry"
                          value={form.industry}
                          onChange={(event) => updateField("industry", event.target.value)}
                          placeholder="e.g. Retail, hospitality"
                          maxLength={140}
                          required
                          className="h-12 border-gray-300 bg-white focus-visible:ring-[#f6c431]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="waitlist-town" className="flex items-center gap-2 font-bold">
                          <MapPin className="h-4 w-4 text-[#9b7600]" /> Town
                        </Label>
                        <Input
                          id="waitlist-town"
                          value={form.town}
                          onChange={(event) => updateField("town", event.target.value)}
                          placeholder="Where you operate"
                          autoComplete="address-level2"
                          maxLength={120}
                          required
                          className="h-12 border-gray-300 bg-white focus-visible:ring-[#f6c431]"
                        />
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="waitlist-email" className="flex items-center gap-2 font-bold">
                          <Mail className="h-4 w-4 text-[#9b7600]" /> Email
                        </Label>
                        <Input
                          id="waitlist-email"
                          type="email"
                          value={form.email}
                          onChange={(event) => updateField("email", event.target.value)}
                          placeholder="you@company.com"
                          autoComplete="email"
                          maxLength={254}
                          required
                          className="h-12 border-gray-300 bg-white focus-visible:ring-[#f6c431]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="waitlist-mobile" className="flex items-center gap-2 font-bold">
                          <Phone className="h-4 w-4 text-[#9b7600]" /> Mobile <span className="font-normal text-gray-400">(optional)</span>
                        </Label>
                        <Input
                          id="waitlist-mobile"
                          type="tel"
                          value={form.mobile}
                          onChange={(event) => updateField("mobile", event.target.value)}
                          placeholder="+264 81 234 5678"
                          autoComplete="tel"
                          maxLength={32}
                          className="h-12 border-gray-300 bg-white focus-visible:ring-[#f6c431]"
                        />
                      </div>
                    </div>

                    <div className="hidden" aria-hidden="true">
                      <Label htmlFor="waitlist-website">Website</Label>
                      <Input
                        id="waitlist-website"
                        tabIndex={-1}
                        autoComplete="off"
                        value={form.website}
                        onChange={(event) => updateField("website", event.target.value)}
                      />
                    </div>

                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(event) => setConsent(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-[#d8a900]"
                      />
                      <span>
                        I agree that PaySME may contact me about merchant access and launch updates.
                      </span>
                    </label>

                    {errorMessage && (
                      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                        {errorMessage}
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={submitting}
                      className="h-14 w-full bg-[#f6c431] text-base font-black text-[#172018] shadow-lg shadow-[#f6c431]/20 hover:bg-[#e9b923]"
                    >
                      {submitting ? (
                        <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Saving your place…</>
                      ) : (
                        <>Join the waitlist <ArrowRight className="ml-2 h-5 w-5" /></>
                      )}
                    </Button>
                    <p className="text-center text-xs text-gray-400">
                      Your information is used only for PaySME launch communication.
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Waitlist;
