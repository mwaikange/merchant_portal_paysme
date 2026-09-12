import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const Terms = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{
      background: "hsl(var(--marketing-bg))"
    }}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <Button 
            variant="link" 
            onClick={() => navigate('/')} 
            className="text-white hover:text-marketing-yellow mb-4"
          >
            ← Back to Home
          </Button>
          <h1 className="text-4xl font-handwritten text-white mb-4">Terms & Conditions</h1>
          <p className="text-white/80">Last updated: August 2025</p>
        </div>

        {/* Terms Content */}
        <div className="max-w-4xl mx-auto">
          <Card className="bg-white/10 border-white/20">
            <CardHeader>
              <CardTitle className="text-white">PaySME Terms of Service</CardTitle>
            </CardHeader>
            <CardContent className="text-white/90 space-y-6">
              <section>
                <h2 className="text-xl font-semibold text-marketing-yellow mb-3">1. Acceptance of Terms</h2>
                <p>
                  By accessing and using PaySME services, you accept and agree to be bound by the terms and provision of this agreement. 
                  These Terms of Service govern your use of PaySME's payment processing services, dashboard, and related features.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-marketing-yellow mb-3">2. Service Description</h2>
                <p>
                  PaySME provides payment processing services that enable businesses to accept offline payments online through 
                  participating payment vendors and registered payment facilitators in Namibia. Our service includes payment code 
                  generation, transaction processing, real-time notifications, merchant dashboard access, and support for facilitator 
                  registration where applicable.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-marketing-yellow mb-3">3. User Responsibilities</h2>
                <div className="space-y-2">
                  <p><strong>Merchants must:</strong></p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Provide accurate business information during registration</li>
                    <li>Maintain valid contact information and bank details</li>
                    <li>Comply with all applicable laws and regulations</li>
                    <li>Use services only for legitimate business purposes</li>
                    <li>Protect account credentials and API keys</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-marketing-yellow mb-3">4. Fees and Payment</h2>
                <p>
                  PaySME subscription fees are charged according to the selected plan and payment term. PaySME does not charge 
                  a PaySME percentage fee on card payments processed through its card payment partner. PaySME transaction fees may 
                  apply to PaySME codes and other non-card payment types, as outlined in your selected plan. Additional charges may 
                  apply for premium features, facilitator fees, chargebacks, or disputed transactions.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-marketing-yellow mb-3">5. Settlement and Payouts</h2>
                <div className="space-y-3">
                  <p>
                    Funds collected through PaySME vendors are settled to your registered bank account according to your selected 
                    plan's settlement schedule. PaySME reserves the right to hold funds for security reviews, suspected fraud, 
                    compliance checks, or disputed transactions. Settlement timing may be affected by banking holidays or technical issues.
                  </p>
                  <p>
                    Funds collected through registered payment facilitators are settled according to the agreement between the merchant 
                    and the relevant facilitator. PaySME may assist with the registration process and provide available facilitator 
                    settlement information at the time of registration. Facilitator payouts are generally expected within 24 hours 
                    where required by applicable rules or law.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-marketing-yellow mb-3">6. Prohibited Activities</h2>
                <div className="space-y-2">
                  <p>Users may not use PaySME for:</p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>Illegal activities or prohibited goods/services</li>
                    <li>Money laundering or terrorist financing</li>
                    <li>Fraudulent or deceptive practices</li>
                    <li>Circumventing our security measures</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-marketing-yellow mb-3">7. Data Protection and Privacy</h2>
                <p>
                  PaySME is committed to protecting user data in accordance with Namibian data protection laws. 
                  We collect and process information necessary to provide our services, prevent fraud, and ensure compliance. 
                  Detailed information is available in our Privacy Policy.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-marketing-yellow mb-3">8. Limitation of Liability</h2>
                <p>
                  PaySME's liability is limited to the amount of fees paid by the merchant in the preceding 12 months. 
                  We are not liable for indirect, incidental, or consequential damages. Services are provided "as is" 
                  without warranties of any kind.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-marketing-yellow mb-3">9. Account Termination</h2>
                <p>
                  Either party may terminate this agreement with 30 days' notice. PaySME may suspend or terminate 
                  accounts immediately for violations of these terms, security concerns, or regulatory requirements. 
                  Upon termination, all pending settlements will be processed according to normal schedules.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-marketing-yellow mb-3">10. Changes to Terms</h2>
                <p>
                  PaySME reserves the right to modify these terms at any time. Users will be notified of material 
                  changes via email or dashboard notifications. Continued use of services after changes constitutes 
                  acceptance of the new terms.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-marketing-yellow mb-3">11. Governing Law</h2>
                <p>
                  These terms are governed by the laws of Namibia. Any disputes will be resolved through binding 
                  arbitration in Windhoek, Namibia, except where prohibited by local law.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-marketing-yellow mb-3">12. Contact Information</h2>
                <p>
                  For questions about these terms, please contact us at support@paysme.site or through our 
                  customer support channels available in your merchant dashboard.
                </p>
              </section>

              <section className="rounded-lg border border-marketing-yellow/40 bg-marketing-yellow/10 p-4">
                <p className="font-medium text-white">
                  If you do not agree with these Terms & Conditions, please do not register for or use PaySME services.
                </p>
              </section>
            </CardContent>
          </Card>
        </div>

        {/* Contact Section */}
        <div className="text-center mt-8">
          <p className="text-white/80 mb-4">Questions about our terms?</p>
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={() => navigate('/contact')} className="text-white border-white hover:bg-white hover:text-marketing-bg-deep">
              Contact Support
            </Button>
            <Button onClick={() => navigate('/login?tab=signup')} className="bg-marketing-yellow hover:bg-marketing-yellow-deep text-marketing-bg-deep">
              Get Started
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Terms;
