import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { X } from "lucide-react";
import paysmeLogo from "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";
import { TownAutocomplete } from "@/components/TownAutocomplete";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerateCode: (formData: { town: string; mobile: string; email: string; subscribe: boolean }) => void;
  businessName?: string;
  amount?: string;
  invoiceId?: string;
}

export function PaymentModal({ isOpen, onClose, onGenerateCode, businessName, amount, invoiceId }: PaymentModalProps) {
  const [formData, setFormData] = useState({
    town: "",
    mobile: "",
    email: "",
    subscribe: false,
  });

  useEffect(() => {
    if (!isOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="relative mx-4 max-h-[calc(100dvh-2rem)] w-80 max-w-sm overflow-y-auto rounded-lg bg-gray-700 p-4">
        {/* Header */}
        <div className="text-center mb-4">
          <h3 className="text-white text-xl font-bold mb-1">{businessName || "PaySME Store"}</h3>
          <p className="text-gray-300 text-sm">Complete your payment securely with PaySME</p>
        </div>

        {/* Payment Info */}
        <div className="bg-gray-600 rounded p-3 mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-300 text-sm">Invoice ID:</span>
            <span className="text-white font-semibold">{invoiceId || "Ebook0009"}</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-300 text-sm">Amount:</span>
            <span className="text-white font-bold">N$ {amount || "10.00"}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-300 text-sm">Billing</span>
            <span className="text-blue-300 text-sm">monthly recurring</span>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3 mb-4">
          <div>
            <Label className="mb-1 block text-sm text-white">Town</Label>
            <TownAutocomplete
              placeholder="Start typing your town"
              value={formData.town}
              onValueChange={(town) => setFormData({ ...formData, town })}
              className="w-full text-sm"
            />
          </div>
          <div>
            <Label className="text-white text-sm block mb-1">Email Address</Label>
            <Input
              type="email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full text-sm"
            />
          </div>
          <div>
            <Label className="text-white text-sm block mb-1">Mobile Number</Label>
            <Input
              type="tel"
              placeholder="0812345678 or 264812345678"
              value={formData.mobile}
              onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
              className="w-full text-sm"
            />
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={() => onGenerateCode(formData)}
          disabled={!formData.town.trim() || !formData.mobile || !formData.email}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded text-sm mb-2"
        >
          Generate PaySME Code
        </Button>
        {/* IPP and Card buttons only appear after code is generated (in PaycodeModal) */}

        {/* Powered by footer */}
        <div className="text-center">
          <p className="text-gray-300 text-sm mb-1">Powered by</p>
          <img
            src={paysmeLogo}
            alt="PaySME - Bridging Wallets, Apps & Websites"
            className="w-24 h-auto mx-auto"
          />
        </div>
      </div>
    </div>
  );
}
