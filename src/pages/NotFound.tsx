import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-marketing-bg p-4">
      <div className="max-w-md rounded-lg border border-white/15 bg-[#3d3d3d] p-8 text-center text-white shadow-2xl">
        <h1 className="text-5xl font-bold mb-4 text-marketing-yellow">404</h1>
        <p className="text-xl text-white mb-3">Page not found</p>
        <p className="text-white/70 mb-6">The page you are looking for may have moved or no longer exists.</p>
        <Button asChild variant="link" className="text-white hover:text-marketing-yellow">
          <a href="/">← Back to Home</a>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
