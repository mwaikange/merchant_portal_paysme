import { Button } from "@/components/ui/button";
import { Check, CreditCard, ShieldCheck, TrendingUp, WalletCards, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

type PlanAccent = "red" | "yellow" | "gold" | "green";

interface PricingPlan {
  name: string;
  monthly: string;
  rate: string;
  accent: PlanAccent;
  badge?: string;
  summary: string;
  terms: Array<{ label: string; total: string }>;
  paymentRules: string[];
  features: string[];
  unavailable?: string[];
}

const Pricing = () => {
  const navigate = useNavigate();

  const selectPlan = (planName: string, term: string) => {
    navigate(`/login?tab=signup&plan=${encodeURIComponent(`${planName} - ${term}`)}`);
  };

  const plans: PricingPlan[] = [
    {
      name: "Starter",
      monthly: "N$200",
      rate: "2%",
      accent: "red",
      summary: "Best for new merchants testing PaySME without card processing.",
      terms: [
        { label: "3 Months", total: "N$600" },
        { label: "6 Months", total: "N$1,200" },
        { label: "9 Months", total: "N$1,800" },
        { label: "12 Months", total: "N$2,400" },
      ],
      paymentRules: [
        "No card payments",
        "All other payment types available",
        "Other payment types: unlimited transaction value",
        "PaySME transaction fee: 2%",
      ],
      features: [
        "API activation",
        "Vendor ID",
        "All basic services",
        "Setup support",
        "Basic dashboard and analytics",
        "Email support",
        "Payment widget integration",
        "Payment request links by email, SMS, and WhatsApp",
        "Real-time payment notifications",
        "24-48 hour settlement guidance",
      ],
      unavailable: ["Free Card Payment Integration", "Bulk invoice / PayCode generation"],
    },
    {
      name: "Growth",
      monthly: "N$500",
      rate: "1.85%",
      accent: "yellow",
      badge: "Most Popular",
      summary: "A stronger fit for growing businesses that need card access and more support.",
      terms: [
        { label: "3 Months", total: "N$1,500" },
        { label: "6 Months", total: "N$3,000" },
        { label: "9 Months", total: "N$4,500" },
        { label: "12 Months", total: "N$6,000" },
      ],
      paymentRules: [
        "Card payments available",
        "Card Payments: Fee Free",
        "Card payment max: N$10,000 pm",
        "All other payment types available",
        "Other payment types: unlimited transaction value",
        "PaySME transaction fee: 1.85%",
      ],
      features: [
        "Everything in Starter",
        "Free Card Payment Integration",
        "Priority support",
        "API integration assistance",
        "Advanced dashboard and analytics",
      ],
      unavailable: ["Bulk invoice / PayCode generation"],
    },
    {
      name: "Scale",
      monthly: "N$1,000",
      rate: "1.5%",
      accent: "gold",
      summary: "Built for merchants sending regular payment requests and larger card payments.",
      terms: [
        { label: "3 Months", total: "N$3,000" },
        { label: "6 Months", total: "N$6,000" },
        { label: "9 Months", total: "N$9,000" },
        { label: "12 Months", total: "N$12,000" },
      ],
      paymentRules: [
        "Card payments available",
        "Card Payments: Fee Free",
        "Card payment max: N$50,000 pm",
        "All other payment types available",
        "Other payment types: unlimited transaction value",
        "PaySME transaction fee: 1.5%",
      ],
      features: [
        "Everything in Growth",
        "Free Card Payment Integration",
        "Bulk invoice / PayCode generation",
        "Request-to-Pay",
        "Product performance tracking",
        "Paycode Payment Tracking",
        "Priority processing support",
      ],
    },
    {
      name: "Corporate",
      monthly: "N$3,000",
      rate: "1%",
      accent: "green",
      badge: "Best Value",
      summary: "The lowest PaySME transaction rate for established merchants and partners.",
      terms: [
        { label: "3 Months", total: "N$9,000" },
        { label: "6 Months", total: "N$18,000" },
        { label: "9 Months", total: "N$27,000" },
        { label: "12 Months", total: "N$36,000" },
      ],
      paymentRules: [
        "Card payments available",
        "Card Payments: Fee Free",
        "Card payment max: unlimited",
        "All other payment types available",
        "Other payment types: unlimited transaction value",
        "PaySME transaction fee: 1%",
      ],
      features: [
        "Everything in Scale",
        "Free Card Payment Integration",
        "Bulk invoice / PayCode generation",
        "Request-to-Pay",
        "Dedicated onboarding assistance",
        "Custom reporting support",
        "Annual account review",
        "25% discount on Bulk SMS",
        "Personalized Bulk SMS Sender ID",
      ],
    },
  ];

  const accentStyles = {
    red: {
      ring: "border-red-400/45",
      glow: "shadow-[0_0_32px_rgba(248,113,113,0.14)]",
      pill: "bg-red-500/15 text-red-100 border-red-300/35",
      check: "text-red-300",
      bar: "from-red-500 to-red-300",
    },
    yellow: {
      ring: "border-marketing-yellow/60",
      glow: "shadow-[0_0_36px_rgba(250,204,21,0.16)]",
      pill: "bg-marketing-yellow/15 text-marketing-yellow border-marketing-yellow/45",
      check: "text-marketing-yellow",
      bar: "from-marketing-yellow to-yellow-200",
    },
    gold: {
      ring: "border-amber-400/60",
      glow: "shadow-[0_0_36px_rgba(245,158,11,0.16)]",
      pill: "bg-amber-500/15 text-amber-200 border-amber-300/40",
      check: "text-amber-300",
      bar: "from-amber-400 to-yellow-200",
    },
    green: {
      ring: "border-emerald-400/60",
      glow: "shadow-[0_0_36px_rgba(52,211,153,0.16)]",
      pill: "bg-emerald-500/15 text-emerald-200 border-emerald-300/40",
      check: "text-emerald-300",
      bar: "from-emerald-400 to-lime-200",
    },
  } as const;

  return (
    <div
      className="min-h-screen"
      style={{
        background: "hsl(var(--marketing-bg))",
      }}
    >
      <div className="container mx-auto px-4 py-8 lg:py-12">
        <div className="mb-10 text-center">
          <Button
            variant="link"
            onClick={() => navigate("/")}
            className="mb-4 text-white hover:text-marketing-yellow"
          >
            Back to Home
          </Button>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-marketing-yellow/50 bg-black/30">
            <WalletCards className="h-6 w-6 text-marketing-yellow" />
          </div>
          <h1 className="mb-4 text-4xl font-handwritten text-white md:text-5xl">Choose Your PaySME Plan</h1>
          <p className="mx-auto max-w-3xl text-base text-white/75 md:text-lg">
            Choose a plan tier first, then pick a 3, 6, 9, or 12 month payment term. Card payments have no PaySME percentage fee; PaySME transaction rates apply to PaySME and facilitator payment types.
          </p>
          <p className="mt-3 text-xs font-semibold text-marketing-yellow">**Prices exclude VAT</p>
        </div>

        <div className="pricing-plan-grid mx-auto mb-10 grid max-w-7xl gap-5">
          {plans.map((plan) => {
            const style = accentStyles[plan.accent];

            return (
              <article
                key={plan.name}
                className={`relative flex min-h-full flex-col overflow-hidden rounded-lg border bg-[#3a3a3a] text-white transition duration-200 hover:-translate-y-1 hover:border-marketing-yellow/80 hover:shadow-[0_0_44px_rgba(250,204,21,0.18)] ${style.ring} ${style.glow}`}
              >
                {plan.badge && (
                  <div className="absolute right-4 top-4 rounded-full bg-marketing-yellow px-3 py-1 text-xs font-bold text-marketing-bg-deep">
                    {plan.badge}
                  </div>
                )}

                <div className={`h-1.5 bg-gradient-to-r ${style.bar}`} />

                <div className="space-y-5 p-6">
                  <div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${style.pill}`}>
                      {plan.name}
                    </span>
                    <h2 className="mt-5 text-2xl font-handwritten text-white">{plan.name}</h2>
                    <p className="mt-2 min-h-[4rem] text-sm leading-relaxed text-white/68">{plan.summary}</p>
                  </div>

                  <div className="rounded-lg border border-white/12 bg-black/20 p-4">
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-black text-marketing-yellow">{plan.monthly}</span>
                      <span className="pb-1 text-sm font-semibold text-white/70">pm</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-sm">
                      <span className="text-white/65">PaySME transaction fee</span>
                      <span className="font-bold text-white">{plan.rate}</span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/12 bg-black/15 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-white/55">Payment Terms</p>
                    <div className="grid grid-cols-2 gap-2">
                      {plan.terms.map((term) => (
                        <Button
                          key={term.label}
                          onClick={() => selectPlan(plan.name, term.label)}
                          className="h-auto flex-col gap-1 bg-marketing-yellow px-3 py-3 text-marketing-bg-deep hover:bg-marketing-yellow-deep"
                        >
                          <span className="text-xs font-bold">{term.label}</span>
                          <span className="text-sm font-black">{term.total}</span>
                        </Button>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] font-semibold text-white/60">**Prices exclude VAT</p>
                  </div>
                </div>

                <div className="flex flex-1 flex-col px-6 pb-6">
                  <div className="mb-6 rounded-lg border border-white/12 bg-white/[0.04] p-4">
                    <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/55">
                      <CreditCard className="h-4 w-4 text-marketing-yellow" />
                      Payment Access
                    </p>
                    <ul className="space-y-2">
                      {plan.paymentRules.map((rule) => (
                        <li key={rule} className="flex gap-3 text-sm leading-relaxed text-white/88">
                          <Check className={`mt-0.5 h-4 w-4 shrink-0 ${style.check}`} />
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-white/55">Includes</p>
                  <ul className="mb-6 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm leading-relaxed text-white/88">
                        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${style.check}`} />
                        <span>{feature}</span>
                      </li>
                    ))}
                    {plan.unavailable?.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm leading-relaxed text-white/45">
                        <X className="mt-0.5 h-4 w-4 shrink-0 text-red-300/80" />
                        <span>{feature} not available</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>

        <section className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
          <div className="rounded-lg border border-white/15 bg-[#3d3d3d] p-5 text-white">
            <ShieldCheck className="mb-4 h-7 w-7 text-marketing-yellow" />
            <h3 className="mb-2 text-lg font-semibold">Card payments carry no PaySME percentage fee</h3>
            <p className="text-sm leading-relaxed text-white/70">
              Growth, Scale, and Corporate include card payments with no PaySME percentage charge on card transactions.
            </p>
          </div>

          <div className="rounded-lg border border-white/15 bg-[#3d3d3d] p-5 text-white">
            <TrendingUp className="mb-4 h-7 w-7 text-marketing-yellow" />
            <h3 className="mb-2 text-lg font-semibold">PaySME rates improve by plan tier</h3>
            <p className="text-sm leading-relaxed text-white/70">
              PaySME and facilitator payment types use tiered PaySME rates from 2% down to 1%, depending on the selected plan.
            </p>
          </div>

          <div className="rounded-lg border border-white/15 bg-[#3d3d3d] p-5 text-white">
            <WalletCards className="mb-4 h-7 w-7 text-marketing-yellow" />
            <h3 className="mb-2 text-lg font-semibold">Other payment types stay unlimited</h3>
            <p className="text-sm leading-relaxed text-white/70">
              PaySME, MTC Maris, WayaMe, and future facilitator payment types can support unlimited transaction value by plan.
            </p>
          </div>
        </section>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-center">
          <Button
            variant="outline"
            onClick={() => navigate("/faq")}
            className="border-marketing-yellow/70 text-white hover:bg-white hover:text-marketing-bg-deep"
          >
            View FAQ
          </Button>
          <Button
            onClick={() => navigate("/contact")}
            className="bg-marketing-yellow text-marketing-bg-deep hover:bg-marketing-yellow-deep"
          >
            Contact Sales
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
