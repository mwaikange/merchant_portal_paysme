import { useSearchParams } from "react-router-dom";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const PaymentFailed = () => {
  const [searchParams] = useSearchParams();
  const mref = searchParams.get("mref") || searchParams.get("ref") || searchParams.get("_MERCHANTREFERENCE") || "N/A";
  const status = searchParams.get("status") || searchParams.get("_STATUS") || "Declined";
  const result = searchParams.get("result") || searchParams.get("_RESULT") || "Failed";
  const errorCode = searchParams.get("error_code") || "";
  const errorMessage = searchParams.get("error_message") || searchParams.get("_ERROR_MESSAGE") || "";
  const generatedCode = searchParams.get("generated_code") || "";
  const origin = searchParams.get("origin") || "";

  const displayRef = mref !== "N/A" ? mref : "N/A";

  const buildMerchantReturnUrl = (baseUrl: string) => {
    const url = new URL(baseUrl);
    url.searchParams.set("status", "cancelled");
    if (mref !== "N/A") url.searchParams.set("mref", mref);
    if (generatedCode) url.searchParams.set("generated_code", generatedCode);
    if (errorCode) url.searchParams.set("error_code", errorCode);
    return url.toString();
  };

  return (
    <div className="min-h-screen bg-gradient-professional flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-6">
        <XCircle className="w-20 h-20 text-red-500 mx-auto" />
        <h1 className="text-2xl font-bold text-card-foreground">Payment Failed</h1>
        <p className="text-muted-foreground">Your card payment could not be processed.</p>

        <div className="bg-muted rounded-lg p-4 space-y-2 text-left">
          <div className="flex justify-between">
            <span className="text-muted-foreground text-sm">Reference:</span>
            <span className="font-semibold text-card-foreground text-sm break-all ml-2">{displayRef}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-sm">Status:</span>
            <span className="font-semibold text-red-600 text-sm">{status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-sm">Result:</span>
            <span className="font-semibold text-card-foreground text-sm">{result}</span>
          </div>
          {errorMessage && (
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Details:</span>
              <span className="font-semibold text-card-foreground text-sm break-all ml-2">{errorMessage}</span>
            </div>
          )}
        </div>

        <p className="text-muted-foreground text-sm">
          Please try again or use an alternative payment method.
        </p>

        <div className="space-y-2">
          {origin ? (
            <Button onClick={() => window.location.href = buildMerchantReturnUrl(origin)} className="w-full">
              Try Again
            </Button>
          ) : (
            <Button onClick={() => window.close()} className="w-full">
              Close this window
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentFailed;
