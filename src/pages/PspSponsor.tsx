import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ACCESS_STORAGE_KEY = "paysme:user-journeys-access";

type AccessResponse = {
  ok?: boolean;
  token?: string;
  expires_at?: string;
  html?: string;
  error?: string;
};

type PdfResponse = {
  ok?: boolean;
  filename?: string;
  content_type?: string;
  base64?: string;
  error?: string;
};

const PspSponsor = () => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [content, setContent] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const downloadInProgressRef = useRef(false);

  const requestAccess = useCallback(async (body: Record<string, string>) => {
    const { data, error: invokeError } = await supabase.functions.invoke<AccessResponse>(
      "psp-sponsor-access",
      { body },
    );
    if (invokeError || !data?.ok || !data.html) {
      throw new Error(data?.error || invokeError?.message || "Unable to open this protected page");
    }
    return data;
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "PaySME Vendor Programme - PSP Partnership Discussion Paper";

    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    const restoreAccess = async () => {
      const token = localStorage.getItem(ACCESS_STORAGE_KEY);
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const data = await requestAccess({ action: "content", token });
        setContent(data.html || "");
      } catch {
        localStorage.removeItem(ACCESS_STORAGE_KEY);
      } finally {
        setLoading(false);
      }
    };

    void restoreAccess();
  }, [requestAccess]);

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");

    try {
      const data = await requestAccess({ action: "unlock", password });
      if (!data.token) throw new Error("Access token was not returned");
      localStorage.setItem(ACCESS_STORAGE_KEY, data.token);
      setContent(data.html || "");
      setPassword("");
    } catch (accessError) {
      setError(
        accessError instanceof Error && /expired/i.test(accessError.message)
          ? "This temporary access password has expired."
          : "The password is incorrect or temporary access is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = useCallback(async () => {
      if (downloadInProgressRef.current) return;
      const token = localStorage.getItem(ACCESS_STORAGE_KEY);
      if (!token) {
        setContent("");
        setError("Your access session has expired. Enter the password again.");
        return;
      }

      downloadInProgressRef.current = true;
      setDownloadError("");
      frameRef.current?.contentWindow?.postMessage(
        { type: "paysme:psp-sponsor-download-state", busy: true },
        "*",
      );

      try {
        const { data, error: invokeError } = await supabase.functions.invoke<PdfResponse>(
          "psp-sponsor-pdf",
          { body: { token } },
        );
        if (invokeError || !data?.ok || !data.base64) {
          throw new Error(data?.error || invokeError?.message || "The PDF download could not be prepared");
        }

        const binary = window.atob(data.base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        const pdfBlob = new Blob([bytes], { type: data.content_type || "application/pdf" });
        const downloadUrl = URL.createObjectURL(pdfBlob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = data.filename || "PaySME-Vendor-Programme-PSP-Partnership.pdf";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      } catch (downloadFailure) {
        const message = downloadFailure instanceof Error ? downloadFailure.message : "PDF download failed";
        if (/expired|invalid|401/i.test(message)) {
          localStorage.removeItem(ACCESS_STORAGE_KEY);
          setContent("");
          setError("Your access session has expired. Enter the password again.");
        } else {
          setDownloadError("The PDF could not be downloaded. Please try again.");
        }
      } finally {
        downloadInProgressRef.current = false;
        frameRef.current?.contentWindow?.postMessage(
          { type: "paysme:psp-sponsor-download-state", busy: false },
          "*",
        );
      }
  }, []);

  useEffect(() => {
    const handleDownloadRequest = (event: MessageEvent) => {
      if (
        event.source === frameRef.current?.contentWindow &&
        event.data?.type === "paysme:psp-sponsor-download-pdf"
      ) {
        void downloadPdf();
      }
    };

    window.addEventListener("message", handleDownloadRequest);
    return () => window.removeEventListener("message", handleDownloadRequest);
  }, [downloadPdf]);

  if (content) {
    return (
      <>
        <iframe
          ref={frameRef}
          srcDoc={content}
          title="PaySME Vendor Programme - PSP Partnership Discussion Paper"
          className="fixed inset-0 z-[100] h-dvh w-screen border-0 bg-[#07111b]"
          sandbox="allow-same-origin allow-scripts allow-popups"
        />
        {downloadError && (
          <div className="fixed bottom-5 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700 shadow-2xl">
            <span>{downloadError}</span>
            <button type="button" onClick={() => setDownloadError("")} className="underline">
              Dismiss
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eef2f7] px-5 py-10">
      <section className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_24px_70px_rgba(6,18,38,0.18)]">
        <div className="border-b-[5px] border-[#f2b821] bg-gradient-to-br from-[#061226] to-[#0a1b34] px-8 py-8 text-white">
          <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <LockKeyhole className="h-6 w-6 text-[#f2b821]" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f2b821]">PaySME confidential</p>
          <h1 className="mt-2 text-3xl font-extrabold">PSP Partnership Discussion</h1>
          <p className="mt-3 text-sm leading-6 text-slate-200">
            Enter the temporary access password to view this protected partnership document.
          </p>
        </div>

        <form onSubmit={unlock} className="space-y-5 px-8 py-8">
          <div>
            <label htmlFor="psp-sponsor-password" className="mb-2 block text-sm font-bold text-[#061226]">
              Temporary password
            </label>
            <div className="relative">
              <input
                id="psp-sponsor-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                autoComplete="current-password"
                disabled={loading}
                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 pr-12 text-base text-slate-900 outline-none transition focus:border-[#061226] focus:ring-4 focus:ring-slate-200"
                placeholder="Enter password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 hover:text-[#061226]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {error && <p className="mt-2 text-sm font-medium text-red-600" role="alert">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-[#f2b821] px-5 font-extrabold text-[#061226] transition hover:bg-[#dda817] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Checking access...</> : "Open discussion paper"}
          </button>

          <p className="text-center text-xs leading-5 text-slate-500">
            Authorized browser sessions automatically expire after 72 hours.
          </p>
        </form>
      </section>
    </main>
  );
};

export default PspSponsor;
