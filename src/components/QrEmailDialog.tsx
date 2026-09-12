import { useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { emailMerchantQrLink, MerchantQrPaymentLink } from "@/lib/merchantQrLinks";

type QrEmailDialogProps = {
  link: MerchantQrPaymentLink | null;
  defaultEmail?: string;
  onClose: () => void;
};

export function QrEmailDialog({ link, defaultEmail = "", onClose }: QrEmailDialogProps) {
  const { toast } = useToast();
  const [recipient, setRecipient] = useState(defaultEmail);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (link) setRecipient(defaultEmail);
  }, [defaultEmail, link]);

  const send = async () => {
    if (!link) return;
    const email = recipient.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Enter a valid recipient email", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const sentTo = await emailMerchantQrLink(link.qr_payment_link_id, email);
      toast({ title: "QR code emailed", description: `Sent to ${sentTo || email}.` });
      onClose();
    } catch (error) {
      toast({
        title: "Could not email QR code",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={Boolean(link)} onOpenChange={(open) => !open && !sending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Email QR code</DialogTitle>
          <DialogDescription>
            Send the QR image and secure payment link for {link?.product_reference}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="qr-recipient-email">Recipient email</Label>
          <Input
            id="qr-recipient-email"
            type="email"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="customer@example.com"
            disabled={sending}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void send();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={() => void send()} disabled={sending}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Send QR code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

