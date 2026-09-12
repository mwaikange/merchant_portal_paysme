import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
interface BusinessIndustrySelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}
const industries = ["E-commerce", "Electronics", "Fashion", "Food & Beverage", "Retail", "Beauty & Cosmetics", "Home & Garden", "Sports & Fitness", "Software", "Gaming", "Streaming", "Digital Marketing", "Web Development", "Telecommunications", "Consulting", "Education", "Healthcare", "Financial Services", "Real Estate", "Legal Services", "Accounting", "Photography", "Media & Entertainment", "Art & Crafts", "Music", "Events", "Publishing", "Travel", "Hospitality", "Transportation", "Tourism", "Nonprofit", "Automotive", "Agriculture", "Manufacturing", "Construction", "Logistics", "Utilities", "Fintech", "Gametech", "Insurance", "Money Transfer", "Technology", "Marketing", "Energy", "Mining", "Banking", "Investment", "Human Resources", "Security", "Other"];
export const BusinessIndustrySelect = ({
  value,
  onChange,
  className = ""
}: BusinessIndustrySelectProps) => {
  const [filteredIndustries, setFilteredIndustries] = useState(industries);
  const [showDropdown, setShowDropdown] = useState(false);
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    onChange(inputValue);
    if (inputValue.length >= 3) {
      const filtered = industries.filter(industry => industry.toLowerCase().includes(inputValue.toLowerCase())).slice(0, 4);
      setFilteredIndustries(filtered);
      setShowDropdown(true);
    } else {
      setFilteredIndustries([]);
      setShowDropdown(false);
    }
  };
  const handleSelect = (industry: string) => {
    onChange(industry);
    setShowDropdown(false);
  };
  return <div className="space-y-2 relative bg-zinc-700">
      <Label htmlFor="businessIndustry" className="text-white font-medium flex items-center space-x-2">
        <Building2 className="w-4 h-4" />
        <span className="text-slate-50">Business Industry</span>
      </Label>
      <div className="relative">
        <Input id="businessIndustry" type="text" required value={value} onChange={handleInputChange} onFocus={() => setShowDropdown(true)} placeholder="Type to search or select industry" className={`bg-white/10 border-white/20 text-white placeholder:text-white/60 focus:border-paysme-orange focus:ring-paysme-orange h-12 ${className}`} />
        
        {showDropdown && filteredIndustries.length > 0 && <div className="absolute top-full left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border border-white/20 rounded-md shadow-xl max-h-48 overflow-y-auto mt-1">
            {filteredIndustries.map((industry, index) => <button key={index} type="button" onClick={() => handleSelect(industry)} className="w-full text-left px-4 py-2 text-gray-800 hover:bg-paysme-orange/20 hover:text-paysme-orange transition-colors first:rounded-t-md last:rounded-b-md">
                {industry}
              </button>)}
          </div>}
      </div>
    </div>;
};