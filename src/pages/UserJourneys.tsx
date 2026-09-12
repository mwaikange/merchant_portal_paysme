import { FormEvent, SyntheticEvent, useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ACCESS_STORAGE_KEY = "paysme:user-journeys-access";

type AccessResponse = {
  ok?: boolean;
  token?: string;
  expires_at?: string;
  html?: string;
  visual_html?: string;
  error?: string;
};

export default function UserJourneys() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [content, setContent] = useState("");
  const [visualContent, setVisualContent] = useState("");
  const [journeyHeight, setJourneyHeight] = useState(1200);
  const [visualHeight, setVisualHeight] = useState(1100);
  const journeyFrameRef = useRef<HTMLIFrameElement>(null);
  const visualFrameRef = useRef<HTMLIFrameElement>(null);

  const requestAccess = useCallback(async (body: Record<string, string>) => {
    const { data, error: invokeError } = await supabase.functions.invoke<AccessResponse>(
      "user-journeys-access",
      { body },
    );
    if (invokeError || !data?.ok || !data.html) {
      throw new Error(data?.error || invokeError?.message || "Unable to open this protected page");
    }
    return data;
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
        setVisualContent(data.visual_html || "");
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
      setVisualContent(data.visual_html || "");
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

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_STORAGE_KEY);
    setContent("");
    setVisualContent("");
    setPassword("");
    setError("");
    setShowPassword(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const handleJourneyMessage = (event: MessageEvent) => {
      const isJourneyFrame =
        event.source === journeyFrameRef.current?.contentWindow ||
        event.source === visualFrameRef.current?.contentWindow;
      if (
        isJourneyFrame &&
        event.data?.type === "paysme:user-journeys-logout"
      ) {
        logout();
      }
    };

    window.addEventListener("message", handleJourneyMessage);
    return () => window.removeEventListener("message", handleJourneyMessage);
  }, [logout]);

  const fitFrame = (
    event: SyntheticEvent<HTMLIFrameElement>,
    setHeight: (height: number) => void,
  ) => {
    const frame = event.currentTarget;
    const updateHeight = () => {
      const document = frame.contentDocument;
      if (!document) return;
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight || 0,
      );
      if (height > 0) setHeight(height + 2);
    };

    updateHeight();
    window.setTimeout(updateHeight, 300);
    window.setTimeout(updateHeight, 1200);
  };

  if (content) {
    return (
      <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#eef2f7]">
        <iframe
          ref={journeyFrameRef}
          title="PaySME End-User Journey Mapping"
          srcDoc={content}
          className="block w-full border-0 bg-[#eef2f7]"
          style={{ height: `${journeyHeight}px` }}
          sandbox="allow-same-origin allow-scripts allow-popups"
          onLoad={(event) => fitFrame(event, setJourneyHeight)}
        />
        {visualContent && (
          <iframe
            ref={visualFrameRef}
            title="PaySME Visual Payment Journey"
            srcDoc={visualContent}
            className="block w-full border-0 bg-[#061226]"
            style={{ height: `${visualHeight}px` }}
            sandbox="allow-same-origin allow-scripts allow-downloads allow-popups"
            allowFullScreen
            onLoad={(event) => fitFrame(event, setVisualHeight)}
          />
        )}
      </div>
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
          <h1 className="mt-2 text-3xl font-extrabold">End-User Journey Mapping</h1>
          <p className="mt-3 text-sm leading-6 text-slate-200">
            Enter the temporary access password to view this protected business-process document.
          </p>
        </div>

        <form onSubmit={unlock} className="space-y-5 px-8 py-8">
          <div>
            <label htmlFor="journey-password" className="mb-2 block text-sm font-bold text-[#061226]">
              Temporary password
            </label>
            <div className="relative">
              <input
                id="journey-password"
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
            {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Checking access...</> : "Open journey map"}
          </button>

          <p className="text-center text-xs leading-5 text-slate-500">
            Authorized browser sessions automatically expire after 72 hours.
          </p>
        </form>
      </section>
    </main>
  );
}
