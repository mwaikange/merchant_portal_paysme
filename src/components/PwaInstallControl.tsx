import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function PwaInstallControl() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [updateReady, setUpdateReady] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const handleInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", handleInstall);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistration("/portal/").then((registration) => {
        if (!registration) return;
        if (registration.waiting) setUpdateReady(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(worker); });
        });
      });
    }
    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  if (updateReady) return <Button type="button" variant="outline" onClick={() => { updateReady.postMessage({ type: "SKIP_WAITING" }); window.location.reload(); }} title="Install the ready PaySME update"><RefreshCw className="mr-2 h-4 w-4" />Update PaySME</Button>;
  if (!prompt) return null;
  return <Button type="button" variant="outline" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }} title="Install PaySME Merchant on this computer"><Download className="mr-2 h-4 w-4" />Install PaySME</Button>;
}
