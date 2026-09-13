import { useEffect, useState } from "react";
import { CheckCircle2, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let savedPrompt: InstallPrompt | null = null;
let installed = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
const installSubscribers = new Set<() => void>();

const publishInstallState = () => installSubscribers.forEach((subscriber) => subscriber());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    savedPrompt = event as InstallPrompt;
    publishInstallState();
  });
  window.addEventListener("appinstalled", () => {
    savedPrompt = null;
    installed = true;
    publishInstallState();
  });
}

type PwaInstallControlProps = {
  compact?: boolean;
  showInstalledState?: boolean;
};

export function PwaInstallControl({ compact = false, showInstalledState = false }: PwaInstallControlProps) {
  const { toast } = useToast();
  const [, refreshInstallState] = useState(0);
  const [updateReady, setUpdateReady] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const refresh = () => refreshInstallState((value) => value + 1);
    installSubscribers.add(refresh);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistration().then((registration) => {
        if (!registration) return;
        if (registration.waiting) setUpdateReady(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(worker); });
        });
      });
    }
    return () => { installSubscribers.delete(refresh); };
  }, []);

  if (updateReady) return <Button type="button" variant="outline" onClick={() => { updateReady.postMessage({ type: "SKIP_WAITING" }); window.location.reload(); }} title="Install the ready PaySME update"><RefreshCw className={compact ? "h-4 w-4" : "mr-2 h-4 w-4"} />{!compact && "Update PaySME"}</Button>;
  if (installed) {
    if (!showInstalledState) return null;
    return <Button type="button" variant="outline" disabled><CheckCircle2 className="mr-2 h-4 w-4" />PaySME app is installed</Button>;
  }

  const installApp = async () => {
    if (!savedPrompt) {
      toast({ title: "Install PaySME Merchant", description: "Open your browser menu and choose Install app or Create shortcut. Chrome and Microsoft Edge provide the best install support." });
      return;
    }
    await savedPrompt.prompt();
    const choice = await savedPrompt.userChoice;
    if (choice.outcome === "accepted") {
      savedPrompt = null;
      publishInstallState();
    }
  };

  return <Button type="button" variant="outline" onClick={installApp} title="Install PaySME Merchant on this computer"><Download className={compact ? "h-4 w-4" : "mr-2 h-4 w-4"} />{compact ? <span className="ml-2 hidden xl:inline">Install PaySME App</span> : "Install PaySME App"}</Button>;
}
