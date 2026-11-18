import { ArrowUpRight, Smartphone } from "lucide-react";
import { useSearchParams } from "react-router-dom";

type ReturnApp = {
  invoicePrefix: string;
  name: string;
  icon: string;
  openUrl: string;
};

// Each app's invoice IDs start with its registered prefix followed by a hyphen.
const returnApps: readonly ReturnApp[] = [
  {
    invoicePrefix: "SEEKGRN",
    name: "SeekGRNJobs",
    icon: "https://seek-grn.vercel.app/icon.svg",
    openUrl: "https://seek-grn.vercel.app/#subscription",
  },
];

const paysmeLogo = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";

function getAppHref(app: ReturnApp, invoiceId?: string) {
  const url = new URL(app.openUrl);
  if (invoiceId) url.searchParams.set("invoice_id", invoiceId);
  return url.toString();
}

export default function PaymentReturn() {
  const [searchParams] = useSearchParams();
  const reference = searchParams.get("invoice_id") || "";
  const invoiceId = /^[A-Z0-9][A-Z0-9._-]{0,95}$/i.test(reference) ? reference : "";
  const prefix = /^([A-Z][A-Z0-9]{1,11})-/.exec(invoiceId)?.[1];
  const matchedApp = returnApps.find((app) => app.invoicePrefix === prefix);
  const availableApps = matchedApp ? [matchedApp] : returnApps;

  return (
    <main className="relative isolate flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#111612] px-5 py-12 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute -top-44 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-[#f4c430]/10 blur-3xl" />
      <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-[#202621] p-6 shadow-2xl sm:p-9">
        <img src={paysmeLogo} alt="PaySME" className="mb-9 h-9 w-auto object-contain" />
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f4c430]/15 text-[#f4c430]">
          <Smartphone aria-hidden="true" className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Return to your app</h1>
        <p className="mt-3 leading-relaxed text-white/75">
          {matchedApp
            ? `Open ${matchedApp.name} to check your payment status.`
            : availableApps.length > 0
              ? "Choose the app you used to start your payment."
              : "Open the app where you started your payment to check its status."}
        </p>

        {invoiceId && (
          <dl className="mt-6 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <dt className="text-sm text-white/65">Invoice reference</dt>
            <dd className="mt-1 break-all font-mono text-sm text-white">{invoiceId}</dd>
          </dl>
        )}

        {availableApps.length > 0 && (
          <ul aria-label="Apps" className="mt-6 grid gap-3">
            {availableApps.map((app) => (
              <li key={app.invoicePrefix}>
                <a
                  href={getAppHref(app, app === matchedApp ? invoiceId : undefined)}
                  rel="noreferrer"
                  className="flex min-h-16 items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3 text-white transition-colors hover:border-[#f4c430]/50 hover:bg-[#f4c430]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4c430]"
                >
                  <img src={app.icon} alt="" width={42} height={42} className="h-[42px] w-[42px] shrink-0 rounded-lg object-contain" />
                  <span className="flex-1 font-semibold">Open {app.name}</span>
                  <ArrowUpRight aria-hidden="true" className="mr-1 h-5 w-5 shrink-0 text-[#f4c430]" />
                </a>
              </li>
            ))}
          </ul>
        )}

        <a href="https://www.paysme.site/" rel="noreferrer" className="mt-7 inline-block text-sm font-semibold text-[#f4c430] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4c430]">
          PaySME home
        </a>
      </div>
    </main>
  );
}
