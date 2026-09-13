import { createRoot } from 'react-dom/client'
import { domainRedirect } from './lib/portalDomains'
import './index.css'

const redirect = domainRedirect(window.location);
if (redirect) {
  window.location.replace(redirect);
} else {
  const merchantPwaHost = location.hostname === "merchant.paysme.site" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!merchantPwaHost) document.getElementById("paysme-merchant-manifest")?.remove();
  if ("serviceWorker" in navigator && merchantPwaHost) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/merchant-sw.js", { scope: "/" }));
  }
  void import('./App.tsx').then(({ default: App }) => {
    createRoot(document.getElementById("root")!).render(<App />);
  });
}
