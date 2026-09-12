import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import phoneMockup from "@/assets/phone-mockup.asset.json";

const paysmeLogoMain = "/lovable-uploads/898057d0-cfa9-48a0-8977-fa341f10e70b.png";

const Login = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ vendorId: "", password: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/portal/dashboard");
  };

  return (
    <div className="min-h-screen bg-marketing-bg text-marketing-text">
      {/* Yellow nav */}
      <nav className="bg-marketing-yellow">
        <div className="container mx-auto px-6 py-4 flex justify-center">
          <div className="flex items-center gap-4 md:gap-8 text-marketing-bg-deep font-semibold text-base md:text-lg">
            <a href="/faq" className="underline hover:opacity-70">FAQ</a>
            <span className="opacity-40">|</span>
            <a href="/pricing" className="underline hover:opacity-70">Pricing</a>
            <span className="opacity-40">|</span>
            <a href="/login" className="underline hover:opacity-70">Login</a>
            <span className="opacity-40">|</span>
            <a href="/contact" className="underline hover:opacity-70">Contact</a>
            <span className="opacity-40">|</span>
            <a href="/terms" className="underline hover:opacity-70">T&C's</a>
          </div>
        </div>
      </nav>

      <section className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
          {/* Left — login form */}
          <div className="space-y-8">
            <img src={paysmeLogoMain} alt="PaySME" className="w-[260px] h-auto" />
            <div>
              <h1 className="text-3xl font-bold mb-1">Vendor sign in</h1>
              <p className="text-marketing-muted">
                Use your PaySME Vendor ID and password to continue.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 max-w-md bg-marketing-surface p-6 rounded-xl shadow-lg">
              <Input
                type="text"
                placeholder="Vendor ID"
                value={formData.vendorId}
                onChange={(e) => setFormData({ ...formData, vendorId: e.target.value })}
                className="w-full bg-white text-marketing-bg-deep placeholder:text-gray-500"
              />
              <Input
                type="password"
                placeholder="Password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full bg-white text-marketing-bg-deep placeholder:text-gray-500"
              />
              <Button
                type="submit"
                className="w-full bg-marketing-yellow hover:bg-marketing-yellow-deep text-marketing-bg-deep font-bold py-3"
              >
                Login
              </Button>
              <p className="text-center text-sm text-marketing-muted">
                Not yet registered?{" "}
                <a href="/auth" className="underline text-marketing-yellow hover:opacity-80">
                  Sign Up Here
                </a>
              </p>
            </form>
          </div>

          {/* Right — phone mockup */}
          <div className="flex justify-center">
            <img src={phoneMockup.url} alt="PaySME vendor portal" className="w-full max-w-[340px] h-auto" />
          </div>
        </div>
      </section>
    </div>
  );
};

export default Login;
