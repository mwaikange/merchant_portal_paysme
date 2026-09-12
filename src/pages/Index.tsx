import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

declare global {
  interface Window {
    PaySME?: {
      init: (config: {
        vendor_uuid: string;
        api_key: string;
        amount_nad: number;
        invoice_id: string;
        product_name: string;
        recurring: boolean;
        redirect_url?: string;
        on_success?: (result: {
          transaction_id?: string;
          generated_code?: string;
          amount?: number;
          invoice_id?: string;
        }) => void;
        on_error?: (error: { message?: string }) => void;
        on_cancel?: () => void;
      }) => void;
    };
  }
}

const paysmeLogoMain = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";
const phoneMockup = "/pay-home/phone-mockup.png";
const checkoutConfig = {
  vendorUuid: "00000000-1986-0026-0000-000000000001",
  apiKey: "pk_b77a49c83d08f943a9442783956a89c420b37bb6083f8ea1",
  productName: "PAYSME Possibilities E-Book",
  amountNad: 10,
  invoiceId: "PAYSME-EBOOK-001",
};

const merchantImages = [
  "/pay-home/merchants/merchant-store-ai.png",
  "/pay-home/merchants/merchant-cafe-ai.png",
  "/pay-home/merchants/merchant-plants-ai.png",
  "/pay-home/merchants/merchant-bakery-ai.png",
  "/pay-home/merchants/merchant-grill-ai.png",
];

const facilitators = [
  { src: "/pay-home/facilitators/paysme-icon.png", alt: "PaySME", variant: "dark" },
  { src: "/pay-home/facilitators/adumo.png", alt: "Adumo" },
  { src: "/pay-home/facilitators/bwk.png", alt: "BWK" },
  { src: "/pay-home/facilitators/paypulse.png", alt: "PayPulse", variant: "wide-logo paypulse" },
  { src: "/pay-home/facilitators/paytoday.png", alt: "PayToday", variant: "wide-logo paytoday" },
  { src: "/pay-home/facilitators/wayame.jpg", alt: "WayaMe" },
];

const tickerFacilitators = Array.from({ length: 4 }).flatMap(() => facilitators);

const merchantIcons = [
  { src: "/pay-home/merchant-icons/watchman.png", alt: "Merchant" },
  { src: "/pay-home/merchant-icons/lens.png", alt: "Merchant" },
  { src: "/pay-home/merchant-icons/paysme.png", alt: "PaySME merchant" },
  { src: "/pay-home/merchant-icons/roulette.png", alt: "Merchant" },
  { src: "/pay-home/merchant-icons/stack.png", alt: "Merchant" },
  { src: "/pay-home/merchant-icons/skinnerbek.png", alt: "SkinnerBek" },
];

const tickerMerchantIcons = Array.from({ length: 4 }).flatMap(() => merchantIcons);

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
.paysme-home{--bg:#2c302d;--bg-deep:#1e2320;--yellow:#f0b429;--yellow-dk:#c47f00;--text:#f0ede8;--muted:#9a9e98;--strip:#363a37;height:100vh;overflow:hidden;font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);}
.paysme-home a{color:inherit;}
.paysme-home .shell{display:flex;flex-direction:column;width:111.111vw;height:111.111vh;overflow:hidden;position:relative;transform:scale(.9);transform-origin:top left;}
.paysme-home nav{background:var(--yellow);padding:11px 0;flex-shrink:0;position:relative;z-index:2;}
.paysme-home .nav-inner{display:flex;align-items:center;gap:12px;font-size:0.95rem;font-weight:600;color:var(--bg-deep);justify-content:flex-end;padding-right:220px;}
.paysme-home .nav-inner a{color:var(--bg-deep);text-decoration:underline;}
.paysme-home .nav-inner a:hover{opacity:0.7;}
.paysme-home .sep{opacity:0.35;} .paysme-home .dim{opacity:0.45;cursor:default;}
.paysme-home .body{flex:1;display:flex;flex-direction:column;position:relative;min-height:0;}
.paysme-home .strips{flex-shrink:0;display:flex;flex-direction:column;gap:3px;position:relative;z-index:1;}
.paysme-home .strip{background:var(--strip);height:54px;display:flex;align-items:center;overflow:hidden;position:relative;}
.paysme-home .strip::after{content:'';position:absolute;right:200px;top:0;bottom:0;width:50px;background:linear-gradient(to right,transparent,var(--strip));z-index:2;pointer-events:none;}
.paysme-home .strip-label{position:absolute;right:0;top:0;bottom:0;width:200px;display:flex;align-items:center;justify-content:flex-end;padding:0 14px;background:var(--strip);font-size:0.56rem;color:var(--muted);white-space:nowrap;letter-spacing:0.06em;text-transform:uppercase;z-index:3;border-left:1px solid rgba(255,255,255,0.07);}
.paysme-home .ticker-wrap{flex:1;overflow:hidden;}
.paysme-home .ticker-track{display:flex;align-items:center;gap:36px;width:max-content;animation:paysme-go-left 38s linear infinite;}
.paysme-home .ticker-track.rev{animation:paysme-go-right 44s linear infinite;}
@keyframes paysme-go-left{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes paysme-go-right{from{transform:translateX(-50%)}to{transform:translateX(0)}}
.paysme-home .fc{flex-shrink:0;height:38px;width:84px;border-radius:6px;background:#fff;display:flex;align-items:center;justify-content:center;padding:4px 7px;box-shadow:0 2px 6px rgba(0,0,0,0.2);font-size:.6rem;color:#1e2320;font-weight:700;overflow:hidden;}
.paysme-home .fc.dark{background:#070707;padding:4px 6px;}
.paysme-home .fc.dark img{width:70px;height:auto;max-width:none;max-height:none;}
.paysme-home .fc img{max-height:100%;max-width:100%;object-fit:contain;}
.paysme-home .fc.wide-logo{padding:1px 3px;}
.paysme-home .fc.wide-logo img{width:100%;height:100%;object-fit:contain;max-width:none;max-height:none;}
.paysme-home .fc.paypulse{justify-content:center;padding:2px 8px;}
.paysme-home .fc.paypulse img{object-position:center center;}
.paysme-home .fc.paytoday img{transform:scale(1.12);}
.paysme-home .mc{flex-shrink:0;width:38px;height:38px;border-radius:50%;background:#f8f8f8;border:2px solid rgba(255,255,255,0.2);overflow:hidden;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);}
.paysme-home .mc img{width:100%;height:100%;object-fit:cover;display:block;}
.paysme-home .hero{flex:1;position:relative;overflow:visible;min-height:0;}
.paysme-home .visual-stage{display:contents;}
.paysme-home .circles{position:absolute;left:0;top:-44px;width:560px;bottom:-115px;pointer-events:none;z-index:20;}
.paysme-home .circle{position:absolute;border-radius:50%;overflow:hidden;border:4px solid var(--bg);box-shadow:0 8px 32px rgba(0,0,0,0.55);}
.paysme-home .circle img{width:100%;height:100%;object-fit:cover;filter:brightness(0.85) saturate(0.88);display:block;}
.paysme-home .c1{width:195px;height:195px;top:0;left:80px;}
.paysme-home .c2{width:295px;height:295px;top:15px;left:215px;}
.paysme-home .c3{width:185px;height:185px;top:215px;left:5px;}
.paysme-home .c4{width:245px;height:245px;top:335px;left:70px;}
.paysme-home .c5{width:265px;height:265px;top:410px;left:275px;}
.paysme-home .content{position:absolute;left:430px;right:195px;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:center;gap:9px;z-index:5;padding:0 16px;transform:translateY(-2px);}
.paysme-home .logo{width:100%;max-width:390px;height:auto;}
.paysme-home h1{font-family:'Playfair Display',serif;font-size:1.72rem;line-height:1.25;font-weight:600;color:var(--text);max-width:560px;}
.paysme-home .copy{display:flex;flex-direction:column;gap:5px;max-width:430px;color:var(--muted);font-size:0.74rem;line-height:1.5;}
.paysme-home .copy strong{color:var(--text);}
.paysme-home .portal-actions{position:absolute;right:8px;top:22px;z-index:25;width:156px;display:flex;flex-direction:column;align-items:stretch;gap:7px;}
.paysme-home .cta{background:var(--yellow);color:var(--bg-deep);border:none;border-radius:8px;padding:9px 12px;font-size:0.82rem;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;transition:background 0.2s,transform 0.1s;text-decoration:none;display:block;text-align:center;position:relative;z-index:6;box-shadow:0 8px 24px rgba(0,0,0,0.28);white-space:nowrap;}
.paysme-home .cta.secondary{background:#1e2320;color:var(--text);border:1px solid rgba(240,180,41,0.7);}
.paysme-home .cta:hover{background:var(--yellow-dk);}
.paysme-home .cta.secondary:hover{background:#303630;}
.paysme-home .cta:active{transform:scale(0.98);}
.paysme-home .mobile-portal-fab{display:none;}
.paysme-home .phone-wrap{position:absolute;right:-112px;z-index:15;width:260px;top:50%;transform:translateY(-35%);pointer-events:none;}
.paysme-home .phone-wrap img{width:100%;height:auto;display:block;}
.paysme-home .checkout-widget{position:relative;z-index:6;width:230px;background:#1e2320;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px;box-shadow:0 8px 32px rgba(0,0,0,0.5);margin-top:4px;}
.paysme-home .cw-header{display:flex;align-items:center;gap:6px;min-width:0;}
.paysme-home .cw-icon{width:26px;height:26px;background:#2c302d;border:1px solid rgba(255,255,255,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#f0ede8;font-size:1rem;}
.paysme-home .cw-title{font-size:0.6rem;color:#f0ede8;font-weight:600;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.paysme-home .cw-btn{position:relative;z-index:1;background:#f0b429;color:#1e2320;border:none;border-radius:8px;padding:6px 10px;font-size:0.68rem;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;text-align:center;width:100%;letter-spacing:0.02em;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;}
.paysme-home .cw-btn:hover{background:#c47f00;}
.paysme-home .cw-note{font-size:0.55rem;color:#9a9e98;text-align:center;line-height:1.25;}
body:has(.paysme-home) .paysme-overlay{align-items:center!important;justify-content:center!important;padding:10px 0!important;overflow:hidden!important;}
body:has(.paysme-home) .paysme-modal{width:310px!important;max-width:88vw!important;max-height:calc(100vh - 20px)!important;overflow-y:auto!important;overflow-x:hidden!important;padding:8px 9px 10px!important;border-radius:8px!important;scrollbar-width:none!important;}
body:has(.paysme-home) .paysme-modal::-webkit-scrollbar{display:none!important;}
body:has(.paysme-home) .paysme-close{top:5px!important;right:7px!important;font-size:18px!important;}
body:has(.paysme-home) .paysme-header{margin-bottom:5px!important;}
body:has(.paysme-home) .paysme-header h3{font-size:14px!important;margin-bottom:1px!important;}
body:has(.paysme-home) .paysme-header p{font-size:10px!important;line-height:1.15!important;}
body:has(.paysme-home) .paysme-info{padding:6px!important;margin-bottom:6px!important;border-radius:5px!important;}
body:has(.paysme-home) .paysme-info-row{margin-bottom:2px!important;font-size:10px!important;gap:6px!important;}
body:has(.paysme-home) .paysme-info-value{font-size:10px!important;}
body:has(.paysme-home) .paysme-form-group{margin-bottom:6px!important;}
body:has(.paysme-home) .paysme-form-group label{font-size:10px!important;margin-bottom:2px!important;}
body:has(.paysme-home) .paysme-form-group input{height:30px!important;padding:5px 8px!important;font-size:11px!important;}
body:has(.paysme-home) .paysme-code-display{padding:6px!important;margin:6px 0!important;}
body:has(.paysme-home) .paysme-code-display span{font-size:18px!important;letter-spacing:1.5px!important;}
body:has(.paysme-home) .paysme-instructions{margin:6px 0!important;}
body:has(.paysme-home) .paysme-instructions p{font-size:9.5px!important;line-height:1.22!important;margin:0 0 3px!important;}
body:has(.paysme-home) #paysme-success-section>.paysme-info{display:none!important;}
body:has(.paysme-home) .paysme-btn{padding:6px 10px!important;margin:4px 0 0!important;font-size:11px!important;border-radius:6px!important;min-height:30px!important;}
body:has(.paysme-home) .paysme-footer{display:block!important;margin-top:7px!important;padding:0 0 2px!important;text-align:center!important;}
body:has(.paysme-home) .paysme-footer p{font-size:9px!important;line-height:1!important;margin:0 0 2px!important;color:#aeb7c5!important;}
body:has(.paysme-home) .paysme-footer img{max-height:38px!important;width:auto!important;max-width:116px!important;margin:0 auto!important;display:block!important;}
@media (max-width:900px){
  .paysme-home{height:auto;min-height:100dvh;overflow-x:hidden;overflow-y:auto;}
  .paysme-home .shell{width:100%;height:auto;min-height:100dvh;overflow:visible;transform:none;}
  .paysme-home nav{padding:10px 12px;}
  .paysme-home .nav-inner{justify-content:center;gap:7px;padding-right:0;font-size:.7rem;line-height:1.35;flex-wrap:wrap;}
  .paysme-home .body{flex:initial;min-height:calc(100dvh - 46px);}
  .paysme-home .hero{display:flex;flex-direction:column;flex:none;min-height:0;overflow:hidden;padding:28px 18px 22px;}
  .paysme-home .content{position:relative;inset:auto;order:1;width:100%;padding:0;transform:none;gap:13px;}
  .paysme-home .logo{max-width:270px;}
  .paysme-home h1{font-size:clamp(1.55rem,7vw,2rem);line-height:1.15;max-width:520px;}
  .paysme-home h1 br{display:none;}
  .paysme-home .copy{max-width:580px;gap:10px;font-size:.86rem;line-height:1.58;}
  .paysme-home .checkout-widget{width:100%;max-width:380px;margin-top:5px;padding:12px;gap:9px;border-radius:14px;}
  .paysme-home .cw-icon{width:34px;height:34px;}
  .paysme-home .cw-title{font-size:.76rem;}
  .paysme-home .cw-btn{min-height:42px;font-size:.82rem;}
  .paysme-home .cw-note{font-size:.66rem;}
  .paysme-home .portal-actions{display:none;}
  .paysme-home .mobile-portal-fab{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(20px,calc(env(safe-area-inset-bottom) + 12px));z-index:60;display:flex;flex-direction:column;align-items:flex-end;gap:10px;font-family:'Inter',sans-serif;pointer-events:none;}
  .paysme-home .mobile-portal-menu{display:flex;flex-direction:column;align-items:stretch;gap:8px;width:196px;opacity:0;visibility:hidden;transform:translateY(10px) scale(.96);transform-origin:bottom right;transition:opacity .18s ease,transform .18s ease,visibility .18s;pointer-events:none;}
  .paysme-home .mobile-portal-fab.open .mobile-portal-menu{opacity:1;visibility:visible;transform:translateY(0) scale(1);pointer-events:auto;}
  .paysme-home .mobile-portal-link{display:flex;align-items:center;justify-content:center;min-height:44px;padding:10px 14px;border:1px solid rgba(240,180,41,.75);border-radius:12px;background:#1e2320;color:var(--text);box-shadow:0 10px 28px rgba(0,0,0,.42);font-size:.78rem;font-weight:700;text-align:center;text-decoration:none;}
  .paysme-home .mobile-portal-link:first-child{background:var(--yellow);color:var(--bg-deep);}
  .paysme-home .mobile-portal-toggle{width:58px;height:58px;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;background:var(--yellow);color:var(--bg-deep);box-shadow:0 10px 30px rgba(0,0,0,.48),0 0 0 1px rgba(255,255,255,.16);cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;transition:transform .18s ease,background .18s ease;pointer-events:auto;}
  .paysme-home .mobile-portal-toggle.dragging{cursor:grabbing;transition:none;}
  .paysme-home .mobile-portal-toggle:active{transform:scale(.94);}
  .paysme-home .mobile-portal-toggle svg{transition:transform .18s ease;}
  .paysme-home .mobile-portal-fab.open .mobile-portal-toggle svg{transform:rotate(45deg);}
  .paysme-home .visual-stage{display:block;position:relative;order:3;width:100%;max-width:430px;height:470px;align-self:center;margin-top:34px;isolation:isolate;}
  .paysme-home .phone-wrap{position:absolute;top:30px;right:-148px;left:auto;width:248px;transform:none;margin:0;z-index:1;opacity:.58;filter:saturate(.72) brightness(.8);}
  .paysme-home .circles{position:absolute;inset:0;width:100%;height:100%;max-width:none;margin:0;z-index:3;}
  .paysme-home .circle{border-width:2px;border-color:rgba(44,48,45,.88);box-shadow:0 8px 22px rgba(0,0,0,.32);}
  .paysme-home .circle img{filter:brightness(.82) saturate(.82);}
  .paysme-home .c1{width:112px;height:112px;top:8px;left:3%;}
  .paysme-home .c2{width:178px;height:178px;top:34px;left:31%;}
  .paysme-home .c3{width:124px;height:124px;top:185px;left:-3%;}
  .paysme-home .c4{width:186px;height:186px;top:220px;left:22%;}
  .paysme-home .c5{width:142px;height:142px;top:304px;left:62%;}
  .paysme-home .strips{gap:2px;}
  .paysme-home .strip{height:58px;}
  .paysme-home .strip::after{right:116px;width:30px;}
  .paysme-home .strip-label{width:116px;padding:0 9px;font-size:.48rem;line-height:1.25;text-align:right;white-space:normal;}
  .paysme-home .ticker-track{gap:24px;}
}
@media (max-width:380px){
  .paysme-home .nav-inner{font-size:.64rem;gap:5px;}
  .paysme-home .hero{padding-left:14px;padding-right:14px;}
  .paysme-home .visual-stage{height:430px;margin-top:30px;}
  .paysme-home .circles{transform:scale(.9);transform-origin:top left;width:111.111%;}
  .paysme-home .phone-wrap{right:-150px;width:240px;}
}
@media (prefers-reduced-motion:reduce){
  .paysme-home .ticker-track,.paysme-home .ticker-track.rev{animation-play-state:paused;}
}
`;

const getHostedPaymentUrl = () => {
  const params = new URLSearchParams({
    invoice_id: checkoutConfig.invoiceId,
    amount: String(checkoutConfig.amountNad),
    product_name: checkoutConfig.productName,
  });

  return `https://paysme.site/pay/${checkoutConfig.vendorUuid}?${params.toString()}`;
};

const Index = () => {
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isSdkReady, setIsSdkReady] = useState(false);
  const [isSdkUnavailable, setIsSdkUnavailable] = useState(false);
  const [isPortalMenuOpen, setIsPortalMenuOpen] = useState(false);
  const [isPortalDragging, setIsPortalDragging] = useState(false);
  const [isVendorInfoOpen, setIsVendorInfoOpen] = useState(false);
  const [portalFabBottom, setPortalFabBottom] = useState<number | null>(null);
  const portalFabRef = useRef<HTMLDivElement | null>(null);
  const portalDragRef = useRef({ pointerId: -1, startY: 0, startBottom: 0, moved: false, dragging: false });
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches
  );

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 900px)");
    const syncViewport = (event: MediaQueryListEvent | MediaQueryList) => setIsMobileViewport(event.matches);

    syncViewport(mobileViewport);
    mobileViewport.addEventListener("change", syncViewport);

    return () => mobileViewport.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) setIsPortalMenuOpen(false);
  }, [isMobileViewport]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(hash);
    const isPasswordRecovery =
      search.get("type") === "recovery" ||
      hashParams.get("type") === "recovery";

    // Supabase may fall back to the project site URL when an older or cached
    // confirmation link is opened. Never leave a newly confirmed merchant
    // signed in on the home page: clear the temporary callback session and
    // send them to the normal email/password/USV sign-in screen.
    const isEmailConfirmation =
      !isPasswordRecovery &&
      hashParams.has("access_token");
    if (isEmailConfirmation) {
      void supabase.auth.signOut().finally(() => {
        window.location.replace("/auth?confirmed=true");
      });
      return;
    }

    if (isPasswordRecovery) {
      window.location.replace(`/reset-password${window.location.search}${window.location.hash}`);
    }

    let fallbackScript: HTMLScriptElement | null = null;
    const checkSdk = () => {
      const ready = Boolean(window.PaySME?.init);
      setIsSdkReady(ready);
      if (ready) setIsSdkUnavailable(false);
      return ready;
    };
    checkSdk();
    const intervalId = window.setInterval(checkSdk, 250);
    const fallbackId = window.setTimeout(() => {
      if (checkSdk() || document.querySelector("script[data-paysme-sdk-fallback]")) return;
      fallbackScript = document.createElement("script");
      fallbackScript.defer = true;
      fallbackScript.src = "/sdk/v1/paysme.js?v=1.11.1";
      fallbackScript.dataset.paysmeSdkFallback = "true";
      fallbackScript.onload = () => checkSdk();
      fallbackScript.onerror = () => setIsSdkUnavailable(true);
      document.head.appendChild(fallbackScript);
    }, 1500);
    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
      if (!checkSdk()) setIsSdkUnavailable(true);
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(fallbackId);
      window.clearTimeout(timeoutId);
    };
  }, []);

  const handlePaysmeCheckout = async () => {
    if (isCheckoutLoading) return;
    setIsCheckoutLoading(true);

    try {
      if (!window.PaySME?.init) {
        window.location.assign(getHostedPaymentUrl());
        return;
      }

      localStorage.setItem(
        "paysme_intent",
        JSON.stringify({
          product_name: checkoutConfig.productName,
          invoice_id: checkoutConfig.invoiceId,
          amount_nad: checkoutConfig.amountNad,
          redirect_url: window.location.href,
        })
      );

      window.PaySME.init({
        vendor_uuid: checkoutConfig.vendorUuid,
        api_key: checkoutConfig.apiKey,
        product_name: checkoutConfig.productName,
        amount_nad: checkoutConfig.amountNad,
        invoice_id: checkoutConfig.invoiceId,
        recurring: false,
        recurring_period: "monthly",
        on_success: (result) => {
          localStorage.removeItem("paysme_intent");
          console.log("PaySME Code:", result.generated_code, "TX:", result.transaction_id);
        },
        on_error: (error) => {
          console.error("Payment error:", error.message);
        },
        on_cancel: () => {
          console.log("Payment cancelled");
        },
      });
    } catch (error) {
      console.error(error);
      const useHosted = window.confirm("Unable to open the PaySME modal.\n\nOpen the hosted PaySME checkout instead?");
      if (useHosted) {
        window.open(getHostedPaymentUrl(), "_blank", "noopener,noreferrer");
      }
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const handlePortalPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const fabRect = portalFabRef.current?.getBoundingClientRect();
    if (!fabRect) return;

    portalDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startBottom: window.innerHeight - fabRect.bottom,
      moved: false,
      dragging: true,
    };
    setIsPortalDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePortalPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = portalDragRef.current;
    if (!drag.dragging || drag.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaY) > 5) drag.moved = true;

    const fabHeight = portalFabRef.current?.getBoundingClientRect().height ?? 58;
    const maximumBottom = Math.max(12, window.innerHeight - fabHeight - 12);
    const nextBottom = Math.min(maximumBottom, Math.max(12, drag.startBottom - deltaY));
    setPortalFabBottom(nextBottom);
  };

  const handlePortalPointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (portalDragRef.current.pointerId !== event.pointerId) return;
    portalDragRef.current.dragging = false;
    setIsPortalDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePortalClick = () => {
    if (portalDragRef.current.moved) {
      portalDragRef.current.moved = false;
      return;
    }
    setIsPortalMenuOpen((open) => !open);
  };

  const openVendorInfo = () => {
    setIsPortalMenuOpen(false);
    setIsVendorInfoOpen(true);
  };

  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:wght@500;600&display=swap"
      />
      <style>{CSS}</style>
      <div
        className={`paysme-home ${isMobileViewport ? "is-mobile" : "is-desktop"}`}
        data-layout={isMobileViewport ? "mobile" : "desktop"}
      >
        <div className="shell">
          <nav>
            <div className="nav-inner">
                <a href="/faq">FAQ</a><span className="sep">|</span>
                <a href="/pricing">PRICING</a><span className="sep">|</span>
                <a href="/login">LOGIN</a><span className="sep">|</span>
                <a href="/contact">CONTACT</a><span className="sep">|</span>
                <a href="/terms">T&amp;C's</a>
            </div>
          </nav>

          <div className="body">
            <div className="hero">
              <div className="visual-stage" aria-label="Namibian entrepreneurs using PaySME">
                <div className="circles">
                  <div className="circle c1"><img src={merchantImages[0]} alt="" /></div>
                  <div className="circle c2"><img src={merchantImages[1]} alt="" /></div>
                  <div className="circle c3"><img src={merchantImages[2]} alt="" /></div>
                  <div className="circle c4"><img src={merchantImages[4]} alt="" /></div>
                  <div className="circle c5"><img src={merchantImages[3]} alt="" /></div>
                </div>

                <div className="phone-wrap">
                  <img src={phoneMockup} alt="PaySME app" />
                </div>
              </div>

              <div className="content">
                <img className="logo" src={paysmeLogoMain} alt="PaySME" />
                <h1>Enabling Online Payments &amp;<br />Subscriptions with offline transactions</h1>
                <div className="copy">
                  <p>Empowering creators, influencers, developers, and digital service providers in Namibia to accept offline payments online.</p>
                  <p>PaySME is an online checkout SDK and sales application that provides payment widgets and plugins for creators, developers, and small businesses looking to grow their online presence and increase sales.</p>
                  <p>We help merchants accept payments from Namibian customers, with or without bank cards, while providing real-time payment notifications, transaction tracking, and data analytics.</p>
                </div>
                <div className="checkout-widget">
                  <div className="cw-header">
                    <div className="cw-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                        <path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6" />
                      </svg>
                    </div>
                    <div className="cw-title">Digital checkout</div>
                  </div>
                  <button id="paysme-pay-btn" className="cw-btn" onClick={handlePaysmeCheckout} disabled={isCheckoutLoading}>
                    {isCheckoutLoading ? "Opening..." : isSdkReady ? "Pay with PaySME" : isSdkUnavailable ? "Open secure checkout" : "Loading checkout..."}
                  </button>
                  <div className="cw-note">Accept pay-code payments from any page.</div>
                </div>
              </div>

              <div className="portal-actions">
                <a href="/signup" className="cta">Merchant Portal</a>
                <button type="button" className="cta secondary" onClick={openVendorInfo}>Vendor Signup</button>
              </div>
            </div>

            <div className="strips">
              <div className="strip">
                <div className="ticker-wrap">
                  <div className="ticker-track rev">
                    {tickerMerchantIcons.map((m, i) => (
                      <div className="mc" key={`m-${i}`}>
                        <img src={m.src} alt={m.alt} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="strip-label">Merchants &amp; Websites</div>
              </div>
              <div className="strip">
                <div className="ticker-wrap">
                  <div className="ticker-track">
                    {tickerFacilitators.map((f, i) => (
                      <div className={`fc ${f.variant ?? ""}`} key={`f-${i}`}>
                        {f.src ? <img src={f.src} alt={f.alt} /> : <span>{f.alt}</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="strip-label">Facilitators / Aggregators</div>
              </div>
            </div>
          </div>
        </div>

        <div
          ref={portalFabRef}
          className={`mobile-portal-fab ${isPortalMenuOpen ? "open" : ""}`}
          style={portalFabBottom === null ? undefined : { bottom: `${portalFabBottom}px` }}
        >
          <div id="mobile-portal-menu" className="mobile-portal-menu" aria-hidden={!isPortalMenuOpen}>
            <a href="/signup" className="mobile-portal-link">Signup as a Merchant</a>
            <button type="button" className="mobile-portal-link" onClick={openVendorInfo}>Signup as a Vendor</button>
            <a href="/waitlist" className="mobile-portal-link">Join Waitlist</a>
          </div>
          <button
            type="button"
            className={`mobile-portal-toggle ${isPortalDragging ? "dragging" : ""}`}
            aria-label={`${isPortalMenuOpen ? "Close" : "Open"} portal menu. Drag vertically to reposition.`}
            aria-controls="mobile-portal-menu"
            aria-expanded={isPortalMenuOpen}
            title="Tap for portal options. Drag up or down to reposition."
            onPointerDown={handlePortalPointerDown}
            onPointerMove={handlePortalPointerMove}
            onPointerUp={handlePortalPointerEnd}
            onPointerCancel={handlePortalPointerEnd}
            onClick={handlePortalClick}
          >
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      <Dialog open={isVendorInfoOpen} onOpenChange={setIsVendorInfoOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-[#f0b429]/50 bg-[#19231c] p-0 text-white shadow-2xl sm:rounded-3xl">
          <div className="h-1.5 bg-gradient-to-r from-[#c47f00] via-[#f0b429] to-[#f8d66d]" />
          <div className="px-5 pb-6 pt-2 sm:px-8 sm:pb-8">
            <DialogHeader className="pr-7 text-left">
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#f0b429]">
                PaySME Vendor Programme
              </p>
              <DialogTitle className="text-2xl font-bold leading-tight text-white sm:text-3xl">
                Become Part of the PaySME Payment Ecosystem
              </DialogTitle>
              <DialogDescription className="pt-2 text-sm leading-6 text-white/75 sm:text-base">
                PaySME is building a more accessible and community-driven payment ecosystem. By becoming a PaySME Vendor, you help decentralize payment processing and bring essential payment services closer to the people who need them.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 space-y-4 text-sm leading-6 text-white/80 sm:text-base">
              <p>
                Your primary role is to process PaySME Paycodes for customers of PaySME merchants within your community. This enables customers to complete online purchases and payments locally, even when they do not have access to bank cards or other digital payment methods.
              </p>

              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 sm:p-5">
                <p className="font-bold text-white">Through the PaySME Vendor App, you can:</p>
                <ul className="mt-3 space-y-2.5">
                  {[
                    "Process PaySME Paycodes safely and reliably",
                    "Accept cash from customers completing PaySME transactions",
                    "Help local customers access products and services from PaySME merchants",
                    "Sell value-added services such as prepaid electricity, water and other available services",
                    "Earn income while expanding access to convenient payment services in your community",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#f0b429]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="font-medium text-white">
                Becoming a PaySME Vendor means playing an important role in connecting merchants, customers and communities through a decentralized payment network.
              </p>
              <p>Would you like to become part of the PaySME payment ecosystem?</p>
            </div>

            <DialogFooter className="mt-6 gap-3 sm:space-x-0">
              <button
                type="button"
                onClick={() => setIsVendorInfoOpen(false)}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 text-sm font-bold text-white transition hover:bg-white/10"
              >
                Not Now
              </button>
              <a
                href="/vendor-registration"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#f0b429] px-5 text-center text-sm font-extrabold text-[#1e2320] transition hover:bg-[#d99b12]"
              >
                Continue to Vendor Registration
              </a>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Index;
