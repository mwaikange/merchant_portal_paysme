import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import type { ReactElement } from "react";
import { useNavigate } from "react-router-dom";

type FaqAnswer = string | string[] | ReactElement;

type FaqItem = {
  question: string;
  answer: FaqAnswer;
};

const FAQ = () => {
  const navigate = useNavigate();

  const faqs: FaqItem[] = [
    {
      question: "What is PaySME?",
      answer: "PaySME is a payment plugin and checkout SDK platform that allows Namibian businesses to accept offline payments online. Customers can pay using cards or generated payment codes through participating payment facilitators and vendors. Merchants also get access to a portal where they can monitor monthly payments, receive instant payment notifications, send bulk payment requests, track product performance, and accept invoice or product payments from customers across all 14 regions of Namibia."
    },
    {
      question: "Does PaySME have a Payment Facilitator licence?",
      answer: (
        <div className="space-y-4 leading-6">
          <p className="font-semibold text-white">
            No. PaySME does not operate as a Payment Facilitator and therefore does not currently hold a Payment Facilitator licence.
          </p>
          <p>
            PaySME operates as a <strong className="text-white">technology platform</strong>, integrating with and engaging licensed payment facilitators, PSPs and banking institutions. These regulated partners provide the actual payment services, payment execution and settlement, while PaySME provides the technology layer connecting merchants and their customers to those payment rails.
          </p>
          <p>
            This distinction is recognised in the{" "}
            <a
              href="https://www.bon.com.na/CMSTemplates/Bon/Files/bon.com.na/47/4776d0bf-9670-4528-999d-137938081f31.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-marketing-yellow underline underline-offset-2 hover:text-white"
            >
              Bank of Namibia Guidance Note on Payment Service Providers dated 5 November 2024
            </a>
            , which specifically acknowledges entities that provide infrastructure and software solutions and facilitate payments indirectly by integrating with licensed PSPs or banking institutions.
          </p>
          <p>Importantly, the Guidance Note further states:</p>
          <blockquote className="border-l-4 border-marketing-yellow bg-black/20 px-4 py-3 italic text-white">
            “entities that provide intermediation services but do not facilitate payment instructions fall outside the definition of payment intermediation as provided for in the PSM Act.”
          </blockquote>
          <p>
            The{" "}
            <a
              href="https://namiblii.org/akn/na/act/2023/14/eng@2023-07-28"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-marketing-yellow underline underline-offset-2 hover:text-white"
            >
              Payment System Management Act 14 of 2023
            </a>{" "}
            itself provides that a person may not provide payment services unless licensed or authorised by the Bank, and that a person intending to offer one of the regulated services in the Schedule must apply for the relevant licence.
          </p>
          <p>For PaySME, the regulatory boundary is therefore intentional:</p>
          <div className="border-l-4 border-marketing-yellow pl-4">
            <p className="font-bold text-white">PaySME provides the technology.</p>
            <p className="font-bold text-white">Licensed payment partners provide the regulated payment service.</p>
          </div>
          <p>
            This model allows PaySME to bring multiple payment providers together through its Unified Checkout while the licensed institutions remain responsible for the regulated payment and settlement functions.
          </p>
        </div>
      )
    },
    {
      question: "Which products and services does PaySME provide?",
      answer: "PaySME provides a checkout plugin and SDK that supports standalone hosted payment pages, in-app payment pop-up modules, and payment request links that can be sent by email, SMS, or WhatsApp, or pasted directly onto invoices."
    },
    {
      question: "How does PaySME work?",
      answer: [
        "PaySME allows merchants to accept online payments from customers with or without bank cards.",
        "When a customer checks out or intends to make a purchase on your website or app, the PaySME plugin generates a unique payment code. The customer can then take this code to a participating PaySME vendor and provide the code and payment.",
        "Alternatively, your clients can follow the payment processing instructions for the payment facilitator of their choice and convenience, then make the payment.",
        "Merchants can also generate a payment link directly from the PaySME dashboard for a specific product or service. This link redirects the customer to a hosted payment page where they can generate a payment code or pay by card. The payment link can be shared through email, invoices, SMS, or WhatsApp, allowing customers to easily complete their payment.",
        "Regardless of the payment method, once the payment is completed, webhooks will be fired to send notification to your designated URL and the dashboard."
      ]
    },
    {
      question: "Which vendors or facilitators accept PaySME codes?",
      answer: "PaySME is growing its own payment vendor network, and merchants can check available vendors in their area. PaySME also works with registered payment facilitators such as MTC Maris, Nedbank PayToday, Standard Bank PayPulse, and WayaMe UPi from the Bank of Namibia. Customers can also make card payments via Adumo, powered by Bank Windhoek."
    },
    {
      question: "What are the transaction fees?",
      answer: [
        "PaySME plans start from N$200 per month and each plan can be paid in 3, 6, 9, or 12 month terms. Starter is N$200 pm, Growth is N$500 pm, Scale is N$1,000 pm, and Corporate is N$3,000 pm.",
        "PaySME does not charge a PaySME percentage fee on card payments. Card payment access and monthly limits depend on the selected plan: Starter has no card payments, Growth supports card payments up to N$10,000 pm, Scale up to N$50,000 pm, and Corporate has unlimited card payment value per month.",
        "For PaySME codes and other non-card payment types such as registered facilitators, PaySME transaction fees range from 2% down to 1% depending on the selected plan."
      ]
    },
    {
      question: "What documents do I need?",
      answer: [
        "As a registering merchant, you will need standard KYC documentation such as the ID of the CEO or manager, BIPA company registration documents, IDs of members or directors, bank confirmation, and proof of address or place of business.",
        "For facilitator integrations, merchants may also need merchant codes or account approvals from the relevant payment partners, including Adumo, MTC Maris, PayPulse, and WayaMe IPN, so that PaySME can connect those payment options to the merchant payment module.",
        "Registered payment facilitators may charge their own fees. PaySME can assist merchants with facilitator registration by helping prepare KYC and account approval applications, but the merchant ultimately applies to and contracts with each facilitator directly. Those facilitator relationships are separate from the merchant's PaySME subscription."
      ]
    },
    {
      question: "How quickly do I receive payments?",
      answer: [
        "You receive real-time notifications when customers make payments across all payment methods. For PaySME Vendor payments, funds are typically processed and available in your account within 24-48 hours.",
        "Facilitators like MTC, Adumo etc. have their own specific payment processing and settlement terms that merchants must enquire about during registration with each facilitator."
      ]
    },
    {
      question: "Do I need technical knowledge to integrate PaySME?",
      answer: "Not at all! PaySME offers simple widget integration that requires no coding knowledge. For developers, we also provide comprehensive APIs and documentation."
    },
    {
      question: "Is there a minimum transaction amount?",
      answer: [
        "Yes. The minimum transaction amount for customers using PaySME is N$10. This helps ensure cost-effective processing for both merchants and customers.",
        "For PaySME Pay Codes, the minimum settlement amount is N$100. For registered payment facilitators, settlement minimums may vary or may not apply. You will be notified of the applicable settlement terms during registration."
      ]
    },
    {
      question: "Can I track my transactions?",
      answer: "Absolutely! PaySME provides a comprehensive dashboard where you can track all transactions, view analytics, manage payouts, and monitor your business performance in real-time."
    },
    {
      question: "What if a customer pays but I don't receive notification?",
      answer: "All payments are logged in our system. If you don't receive a notification, check your dashboard or contact our support team. We maintain transparency and complete transaction records for reconciliation and auditing purposes."
    },
    {
      question: "Can I customize the payment experience?",
      answer: "Yes! PaySME offers customizable payment widgets, branded payment pages, and API integration options to match your brand and user experience requirements."
    }
  ];

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
          <h1 className="text-4xl font-handwritten text-white mb-4">Frequently Asked Questions</h1>
          <p className="text-white/80 max-w-2xl mx-auto">
            Find answers to common questions about PaySME and how it can help your business accept offline payments online.
          </p>
        </div>

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="bg-white/10 rounded-lg border-none">
                <AccordionTrigger className="text-white hover:text-marketing-yellow px-6 py-4 text-left">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-white/90 px-6 pb-4">
                  {Array.isArray(faq.answer) ? (
                    <div className="space-y-4">
                      {faq.answer.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  ) : (
                    faq.answer
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-12">
          <h2 className="text-2xl font-handwritten text-white mb-4">Still have questions?</h2>
          <p className="text-white/80 mb-6">Contact our support team or start your PaySME journey today</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button onClick={() => navigate('/contact')} variant="outline" className="text-white border-white hover:bg-white hover:text-marketing-bg-deep">
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

export default FAQ;
