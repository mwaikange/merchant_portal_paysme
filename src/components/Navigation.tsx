export function Navigation() {
  return (
    <nav className="flex justify-center items-center py-4 px-8">
      <div className="flex space-x-8 text-white text-sm">
        <a href="#about" className="hover:opacity-80">
          | ABOUT US
        </a>
        <a href="#faq" className="hover:opacity-80">
          | FAQ
        </a>
        <a href="#pricing" className="hover:opacity-80">
          | Pricing
        </a>
        <a href="#signup" className="hover:opacity-80">
          | T&C's
        </a>
        <a href="#contact" className="hover:opacity-80">
          | Contact Us
        </a>
        <a href="#terms" className="hover:opacity-80">
          | T&C's
        </a>
      </div>
    </nav>
  );
}