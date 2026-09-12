import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, FileSignature, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const paysmeLogo = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";

const TokenAdvances = () => (
  <div className="min-h-screen bg-[#252a26] text-white">
    <header className="border-b border-white/10 bg-[#202420]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/"><img src={paysmeLogo} alt="PaySME" className="h-11 w-auto" /></Link>
        <Link className="text-sm font-semibold text-[#f0b429]" to="/">Back to website</Link>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
      <div className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#f0b429]">PaySME Vendors</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">KYC and Token Advance applications</h1>
        <p className="mt-5 text-lg leading-relaxed text-white/70">Registered PaySME Vendors can complete identity verification and prepare a Token Advance application from a phone, tablet, or desktop browser.</p>
      </div>
      <div className="mt-9 grid gap-4 md:grid-cols-3">
        {[
          [ShieldCheck, "Verify securely", "Enter your Vendor ID and current password. This does not open a Vendor Portal."],
          [BadgeCheck, "Complete KYC", "Provide business, Key Person, Guarantor and required private documents."],
          [FileSignature, "Digital Signatures", "The Key Person and separate Guarantor, when applicable, sign using time-limited SMS codes."],
        ].map(([Icon, title, copy]) => {
          const FeatureIcon = Icon as typeof ShieldCheck;
          return <section key={String(title)} className="rounded-2xl border border-white/12 bg-[#343a35] p-5"><FeatureIcon className="h-7 w-7 text-[#f0b429]" /><h2 className="mt-4 text-xl font-bold">{String(title)}</h2><p className="mt-2 text-sm leading-relaxed text-white/65">{String(copy)}</p></section>;
        })}
      </div>
      <div className="mt-9 rounded-2xl border border-[#f0b429]/35 bg-[#f0b429]/10 p-6">
        <p className="font-semibold text-[#f0b429]">Responsibility notice</p>
        <p className="mt-2 max-w-3xl text-white/80">The Key Person or nominated Guarantor is ultimately responsible for the monthly Token Advance payments. Download, complete, sign and stamp the Guarantor Agreement before starting the document step.</p>
      </div>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild className="vendor-yellow-button min-h-12 px-6"><Link to="/vendor-kyc">Complete Vendor KYC <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        <Button asChild variant="outline" className="min-h-12 border-white/25 bg-white/5 text-white"><Link to="/vendor-registration">Register as a Vendor</Link></Button>
      </div>
    </main>
  </div>
);

export default TokenAdvances;
