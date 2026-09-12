import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const APK_URL = "/PaySME-Vendor.apk";

const VendorConfirmation = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Confirmation token is missing.");
      return;
    }

    supabase.functions.invoke("vendor-registration", {
      body: { action: "confirm_email", token },
    }).then(({ error }) => {
      if (error) {
        setStatus("error");
        setMessage(error.message || "Unable to confirm email.");
      } else {
        setStatus("success");
      }
    });
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-professional px-4 text-white">
      <div className="w-full max-w-xl rounded-lg border border-white/15 bg-white/10 p-8 text-center shadow-2xl backdrop-blur-md">
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-paysme-orange" />
            <h1 className="text-2xl font-bold">Confirming account...</h1>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="mx-auto mb-4 h-12 w-12 text-red-300" />
            <h1 className="mb-3 text-2xl font-bold">Confirmation failed</h1>
            <p className="mb-6 text-white/75">{message}</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-300" />
            <h1 className="mb-3 text-2xl font-bold">Account confirmed successfully.</h1>
            <p className="mb-6 text-white/75">
              Please download/install the PaySME Android Vendor App and sign in with your Vendor ID and temporary login code to complete your setup and start processing payments.
            </p>
          </>
        )}
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild className="bg-paysme-orange text-paysme-dark hover:bg-paysme-yellow">
            <a href={APK_URL}>Download Android APK</a>
          </Button>
          <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
            <Link to="/">Back to PaySME Website</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VendorConfirmation;
