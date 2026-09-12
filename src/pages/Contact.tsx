import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, HelpCircle, LogIn, Mail, Music, Phone, Tags, Linkedin, Facebook, Instagram, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const contactMobile = "+264 83 679 5150";
const whatsappUrl = "https://wa.me/264836795150";
const facebookUrl = "https://www.facebook.com/profile.php?id=61592339978949";
const linkedinUrl = "https://www.linkedin.com/company/paysme-namibia/";

const Contact = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Message Sent",
      description: "We'll get back to you within 24 hours!"
    });
    setFormData({ name: "", email: "", subject: "", message: "" });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const WhatsAppIcon = () => (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white">
      <svg viewBox="0 0 32 32" aria-hidden="true" className="h-4 w-4 fill-current">
        <path d="M16.04 4.8c-6.08 0-11.02 4.86-11.02 10.84 0 2.08.61 4.09 1.76 5.84L5 28l6.72-1.73a11.19 11.19 0 0 0 4.32.86c6.08 0 11.02-4.86 11.02-10.84S22.12 4.8 16.04 4.8Zm0 20.48c-1.44 0-2.85-.38-4.09-1.09l-.29-.17-3.98 1.03 1.05-3.78-.19-.31a9.24 9.24 0 0 1-1.47-5.03c0-4.96 4.03-8.99 8.98-8.99s8.98 4.03 8.98 8.99-4.03 9.35-8.99 9.35Zm5.03-6.72c-.28-.14-1.64-.8-1.89-.89-.25-.09-.44-.14-.62.14-.18.27-.71.89-.87 1.07-.16.18-.32.2-.6.07-.28-.14-1.17-.43-2.23-1.36-.83-.73-1.38-1.63-1.54-1.91-.16-.27-.02-.42.12-.56.12-.12.28-.32.42-.48.14-.16.18-.27.28-.45.09-.18.05-.34-.02-.48-.07-.14-.62-1.47-.85-2.01-.22-.52-.45-.45-.62-.46h-.53c-.18 0-.48.07-.73.34-.25.27-.96.93-.96 2.27s.99 2.63 1.12 2.81c.14.18 1.94 2.92 4.7 4.09.66.28 1.17.45 1.57.58.66.21 1.26.18 1.74.11.53-.08 1.64-.66 1.87-1.29.23-.64.23-1.18.16-1.29-.07-.12-.25-.18-.53-.32Z" />
      </svg>
    </span>
  );

  return (
    <div className="min-h-screen" style={{
      background: "hsl(var(--marketing-bg))"
    }}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <Button 
            variant="link" 
            onClick={() => navigate('/')} 
            className="text-white hover:text-marketing-yellow mb-4"
          >
            ← Back to Home
          </Button>
          <h1 className="text-4xl font-handwritten text-white mb-4">Contact Us</h1>
          <p className="text-white/80 max-w-2xl mx-auto text-lg">
            Get in touch with our team. We're here to help you succeed with PaySME!
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto items-start">
          <div className="space-y-6">
            {/* Contact Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-marketing-yellow" />
                  Send us a Message
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      required
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="Your full name"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="your.email@example.com"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      name="subject"
                      type="text"
                      required
                      value={formData.subject}
                      onChange={handleInputChange}
                      placeholder="What can we help you with?"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      name="message"
                      required
                      value={formData.message}
                      onChange={handleInputChange}
                      placeholder="Tell us more about your inquiry..."
                      className="min-h-[120px]"
                    />
                  </div>
                  
                  <Button type="submit" className="w-full bg-marketing-yellow hover:bg-marketing-yellow-deep text-marketing-bg-deep">
                    Send Message
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Direct Contact */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-marketing-yellow">
                  <Phone className="w-5 h-5" />
                  Direct Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/12 bg-black/15 p-2.5">
                  <Mail className="w-4 h-4 shrink-0 text-marketing-yellow" />
                  <div className="min-w-0">
                    <p className="whitespace-nowrap text-xs font-semibold">Email Support</p>
                    <p className="truncate text-[11px] leading-tight text-muted-foreground">support@paysme.site</p>
                  </div>
                </div>
                
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/12 bg-black/15 p-2.5">
                  <Phone className="w-4 h-4 shrink-0 text-marketing-yellow" />
                  <div className="min-w-0">
                    <p className="whitespace-nowrap text-xs font-semibold">Phone Support</p>
                    <p className="whitespace-nowrap text-[11px] leading-tight text-muted-foreground">{contactMobile}</p>
                  </div>
                </div>
                
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/12 bg-black/15 p-2.5">
                  <WhatsAppIcon />
                  <div className="min-w-0">
                    <p className="whitespace-nowrap text-xs font-semibold">WhatsApp</p>
                    <Button 
                      variant="link" 
                      className="public-text-link h-auto whitespace-nowrap p-0 text-[11px] leading-tight"
                      onClick={() => window.open(whatsappUrl, '_blank', 'noopener,noreferrer')}
                    >
                      {contactMobile}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Contact Information */}
          <div className="space-y-6">
            {/* Social Media */}
            <Card>
              <CardHeader>
                <CardTitle className="text-marketing-yellow">Follow Us</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={() => window.open(linkedinUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <Linkedin className="w-4 h-4" />
                    LinkedIn
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={() => window.open(facebookUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <Facebook className="w-4 h-4" />
                    Facebook
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={() => window.open('https://instagram.com/paysme_africa', '_blank')}
                  >
                    <Instagram className="w-4 h-4" />
                    Instagram
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={() => window.open('https://tiktok.com/@paysme_africa', '_blank')}
                  >
                    <Music className="w-4 h-4" />
                    TikTok
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Business Hours */}
            <Card>
              <CardHeader>
                <CardTitle className="text-marketing-yellow">Business Hours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Monday - Friday</span>
                    <span>8:00 AM - 6:00 PM</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Saturday</span>
                    <span>9:00 AM - 1:00 PM</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sunday</span>
                    <span>Closed</span>
                  </div>
                  <p className="text-muted-foreground mt-3">
                    *All times in Namibian Standard Time (NST)
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Links */}
            <Card>
              <CardHeader>
                <CardTitle className="text-marketing-yellow">Quick Links</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {[
                    { label: "Frequently Asked Questions", description: "Answers about PaySME codes, fees, and setup.", href: "/faq", icon: HelpCircle },
                    { label: "View Pricing Plans", description: "Compare the 3, 6, 9, and 12 month terms.", href: "/pricing", icon: Tags },
                    { label: "Create Account", description: "Start merchant registration.", href: "/login?tab=signup", icon: UserPlus },
                    { label: "Merchant Login", description: "Access the merchant portal.", href: "/auth", icon: LogIn },
                  ].map((link) => {
                    const Icon = link.icon;

                    return (
                      <a
                        key={link.href}
                        href={link.disabled ? undefined : link.href}
                        aria-disabled={link.disabled ? "true" : undefined}
                        className={`group flex items-center gap-3 rounded-lg border border-white/12 bg-black/15 p-3 text-white transition ${
                          link.disabled
                            ? "cursor-not-allowed opacity-55"
                            : "hover:border-marketing-yellow/60 hover:bg-black/25"
                        }`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-marketing-yellow text-marketing-bg-deep">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold leading-tight">{link.label}</span>
                          <span className="mt-1 block text-xs leading-relaxed text-white/62">{link.description}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-white/45 transition group-hover:translate-x-0.5 group-hover:text-marketing-yellow" />
                      </a>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
