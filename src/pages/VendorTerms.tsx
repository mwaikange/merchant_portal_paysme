import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const VendorTerms = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--marketing-bg))" }}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <Button
            variant="link"
            onClick={() => navigate("/vendor-signup")}
            className="mb-4 text-white hover:text-marketing-yellow"
          >
            Back to Vendor Signup
          </Button>
          <h1 className="mb-4 text-4xl font-handwritten text-white">Vendor Terms & Conditions</h1>
          <p className="text-white/80">Draft placeholder - final vendor terms to be updated later.</p>
        </div>

        <div className="mx-auto max-w-4xl">
          <Card className="border-white/20 bg-white/10">
            <CardHeader>
              <CardTitle className="text-white">PaySME Vendor Terms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 text-white/90">
              <section>
                <h2 className="mb-3 text-xl font-semibold text-marketing-yellow">1. Vendor Registration</h2>
                <p>
                  This page is reserved for the PaySME Vendor Terms & Conditions. The current text is placeholder content
                  and will be replaced with the final legal and operational terms.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-xl font-semibold text-marketing-yellow">2. Prepaid Vendor Account</h2>
                <p>
                  Basic website registration creates a Prepaid Vendor account only. Credit Vendor status is available only
                  after a separate KYC and Token Credit application has been submitted, reviewed, and approved.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-xl font-semibold text-marketing-yellow">3. Verification and App Setup</h2>
                <p>
                  Vendors must complete mobile verification, sign in through the PaySME Android Vendor App, change any
                  temporary login code or password, and set their own authorization PIN before processing payments.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-xl font-semibold text-marketing-yellow">4. Documents and Accuracy</h2>
                <p>
                  Vendors must provide accurate personal and contact information and upload valid ID documents during
                  registration. PaySME may use this information for account verification, fraud prevention, and compliance.
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-xl font-semibold text-marketing-yellow">5. Final Terms Pending</h2>
                <p>
                  The full vendor terms, fee rules, operational responsibilities, suspension rules, and compliance obligations
                  will be inserted here before publication.
                </p>
              </section>

              <section className="rounded-lg border border-marketing-yellow/40 bg-marketing-yellow/10 p-4">
                <p className="font-medium text-white">
                  Placeholder notice: replace this page with final Vendor Terms & Conditions before launch.
                </p>
              </section>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VendorTerms;
