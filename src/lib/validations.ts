// Mobile number validation for Namibian networks
export const validateNamibianMobile = (mobile: string): boolean => {
  // Remove spaces, + signs, dashes, and other formatting.
  const cleanMobile = mobile.replace(/[^\d]/g, '');
  
  // Must start with 26481/26483/26485
  // OR start with 081/083/085 (local format)
  // Must be exactly 10 digits for local, or 12 digits for international
  const namibianMobileRegex = /^(264(81|83|85)\d{7}|0(81|83|85)\d{7})$/;
  
  return namibianMobileRegex.test(cleanMobile);
};

// Format mobile number to +264 format
export const formatNamibianMobile = (mobile: string): string => {
  const cleanMobile = mobile.replace(/[\s+-]/g, '');
  
  // If starts with 081/083/085, convert to +264 display format
  if (cleanMobile.match(/^0(81|83|85)\d{7}$/)) {
    return `+264 ${cleanMobile.slice(1, 3)} ${cleanMobile.slice(3, 6)} ${cleanMobile.slice(6)}`;
  }
  
  // If already in 264 format
  if (cleanMobile.match(/^264(81|83|85)\d{7}$/)) {
    return `+264 ${cleanMobile.slice(3, 5)} ${cleanMobile.slice(5, 8)} ${cleanMobile.slice(8)}`;
  }
  
  return mobile;
};

export const normalizeNamibianMobile = (mobile: string): string => {
  const cleanMobile = mobile.replace(/[^\d]/g, '');
  if (cleanMobile.match(/^0(81|83|85)\d{7}$/)) {
    return `264${cleanMobile.slice(1)}`;
  }
  if (cleanMobile.match(/^264(81|83|85)\d{7}$/)) {
    return cleanMobile;
  }
  return cleanMobile;
};

// Format mobile number consistently
export const formatMobile = (mobile: string): string => {
  const cleanMobile = mobile.replace(/\s+/g, '');
  if (cleanMobile.length === 10) {
    return `${cleanMobile.slice(0, 3)} ${cleanMobile.slice(3, 6)} ${cleanMobile.slice(6)}`;
  }
  return mobile;
};

// Generate 12-digit numeric PaySME code
export const generatePaySMECode = (): string => {
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
};

// Generate custom transaction IDs based on type
export const generateTransactionId = (type?: 'sms' | 'subscription'): string => {
  const randomNumber = Math.floor(Math.random() * 10000000000);
  
  if (type === 'sms') {
    return `SMS_TX${randomNumber.toString().padStart(10, '0')}`;
  } else if (type === 'subscription') {
    return `SUB_TX${randomNumber.toString().padStart(10, '0')}`;
  } else {
    // Default format for regular transactions
    return 'tx_' + 
           new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '') + '_' +
           Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  }
};

// Check if merchant client is new or recurring
export const isNewMerchantClient = async (merchantId: string, mobile: string): Promise<boolean> => {
  // This would check against the merchant_clients table
  // Return true if new, false if recurring
  return true; // Placeholder
};
