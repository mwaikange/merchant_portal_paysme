import { ArrowLeft, Monitor, ShieldAlert, Smartphone, Tablet } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { usePortalDeviceAccess } from "@/hooks/usePortalDeviceAccess";

const paysmeLogo = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";

const deviceNotice = {
  mobile: {
    label: "Mobile phone detected",
    Icon: Smartphone,
  },
  tablet: {
    label: "Tablet detected",
    Icon: Tablet,
  },
  compact: {
    label: "A smaller screen was detected",
    Icon: Smartphone,
  },
  desktop: {
    label: "Desktop detected",
    Icon: Monitor,
  },
} as const;

const DesktopAccessRequired = () => {
  const { desktopAllowed, deviceKind } = usePortalDeviceAccess();

  if (desktopAllowed) {
    return <Navigate to="/auth" replace />;
  }

  const { label, Icon } = deviceNotice[deviceKind];

  return (
    <main
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#101713] px-5 py-8 text-white"
      style={{
        backgroundImage:
          "linear-gradient(rgba(10,16,12,.76), rgba(10,16,12,.88)), url('/payments/paysme-secure-card-background-v3.png')",
        backgroundPosition: "right center",
        backgroundSize: "cover",
      }}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#d99511] via-[#f6c431] to-[#d99511]" />
      <div className="absolute -left-20 top-20 h-64 w-64 rounded-full bg-[#f6c431]/5 blur-3xl" />
      <div className="absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-[#f6c431]/10 blur-3xl" />

      <section className="relative w-full max-w-md rounded-[2rem] border border-white/15 bg-[#252c27]/95 px-6 py-8 text-center shadow-2xl backdrop-blur-md sm:px-10 sm:py-10">
        <img
          src={paysmeLogo}
          alt="PaySME - Bridging Wallets, Apps & Websites"
          className="mx-auto h-auto w-48 sm:w-56"
        />

        <div className="mx-auto mt-7 flex h-20 w-20 items-center justify-center rounded-full border border-[#f6c431]/30 bg-[#f6c431]/10 text-[#f6c431]">
          <ShieldAlert className="h-10 w-10" strokeWidth={1.8} />
        </div>

        <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.28em] text-[#f6c431]">
          Access restricted
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
          Desktop access required
        </h1>
        <p className="mx-auto mt-5 max-w-sm text-sm leading-7 text-white/70 sm:text-base">
          The PaySME Merchant Portal is only available on a desktop or laptop computer. Please sign in from your PC or laptop to continue.
        </p>

        <div className="mt-7 flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f6c431]/10 text-[#f6c431]">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-white">{label}</p>
            <p className="mt-1 text-xs leading-5 text-white/55">Mobile phones and tablets are not supported for portal access.</p>
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link
            to="/"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-bold text-white transition hover:bg-white/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Link>
          <Link
            to="/auth?tab=signup"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#f6c431] px-4 text-sm font-extrabold text-[#151b18] transition hover:bg-[#ffd65a]"
          >
            Signup as a Merchant
          </Link>
        </div>
      </section>
    </main>
  );
};

export default DesktopAccessRequired;
