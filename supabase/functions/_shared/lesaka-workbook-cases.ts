// Source: Lesaka PaySME_Test_Cases.xlsx, supplied by Lesaka. Preserve its case IDs and expected outcomes.
export const LESAKA_WORKBOOK_ROWS = [
  {
    "id": "TC-VS-001",
    "description": "Status check \u2014 Valid unused voucher",
    "preconditions": "Collector portal/app active; valid unused voucher PIN and serial number available",
    "steps": "1. Navigate to Check Voucher Status\n2. Enter valid voucher PIN\n3. Submit",
    "expected": "Status returned: 'New'; voucher value, product description displayed"
  },
  {
    "id": "TC-VS-002",
    "description": "Status check \u2014 Valid unused voucher",
    "preconditions": "Collector portal/app active; valid unused voucher PIN and serial number available",
    "steps": "1. Navigate to Check Voucher Status\n2. Enter valid serial\n3. Submit",
    "expected": "Status returned: 'New'; voucher value, product description displayed"
  },
  {
    "id": "TC-VS-003",
    "description": "Status check \u2014 Previously redeemed voucher",
    "preconditions": "Collector portal active; voucher previously redeemed; redemption details on record",
    "steps": "1. Navigate to Check Voucher Status\n2. Enter redeemed voucher PIN\n3. Submit",
    "expected": "Status: 'Redeemed'; redemption date/time and redeeming collector reference displayed; no further redemption possible"
  },
  {
    "id": "TC-VS-004",
    "description": "Status check \u2014 Reverse voucher",
    "preconditions": "Collector portal active; reverse voucher entered",
    "steps": "1. Navigate to Check Voucher Status\n2. Enter reversed voucher serial number\n3. Submit",
    "expected": "Status: 'Spoilt'; voucher value and product description displayed"
  },
  {
    "id": "TC-VS-005",
    "description": "Status check \u2014 Expired voucher",
    "preconditions": "Collector portal active; expired voucher entered",
    "steps": "1. Navigate to Check Voucher Status\n2. Enter expired voucher PIN\n3. Submit",
    "expected": "Status: 'Expired'; voucher value and product description displayed"
  },
  {
    "id": "TC-VS-006",
    "description": "Status check \u2014 Invalid / non-existent voucher PIN",
    "preconditions": "Collector portal active",
    "steps": "1. Navigate to Check Voucher Status\n2. Enter PIN that does not exist in system\n3. Submit",
    "expected": "Error displayed: 'Voucher not found'; no status information returned; no system crash"
  },
  {
    "id": "TC-VS-007",
    "description": "Status check \u2014 Invalid / non-existent voucher serial number",
    "preconditions": "Collector portal active",
    "steps": "1. Navigate to Check Voucher Status\n2. Enter serial number that does not exist in system\n3. Submit",
    "expected": "Error displayed: 'Voucher not found'; no status information returned; no system crash"
  },
  {
    "id": "TC-VS-008",
    "description": "Status check \u2014 Blank PIN submitted",
    "preconditions": "Collector portal active",
    "steps": "1. Navigate to Check Voucher Status\n2. Leave PIN field empty\n3. Submit",
    "expected": "Error displayed: \"PIN must be a string with a length of 16 digits\""
  },
  {
    "id": "TC-VS-009",
    "description": "Status check \u2014 Blank serial number submitted",
    "preconditions": "Collector portal active",
    "steps": "1. Navigate to Check Voucher Status\n2. Leave serial number field empty\n4. Submit",
    "expected": "Error displayed: \"Serial Number must be a string of digits with a minimum length of 12or a maximum length of 15.\""
  },
  {
    "id": "TC-VS-010",
    "description": "Status check \u2014 PIN exceeding maximum length",
    "preconditions": "Collector portal active",
    "steps": "1. Navigate to Check Voucher Status\n2. Enter PIN significantly longer than expected format\n3. Submit",
    "expected": "Error displayed: \"PIN must be a string with a length of 16 digits\""
  },
  {
    "id": "TC-VR-001",
    "description": "Successful redemption (N$10)",
    "preconditions": "Collector portal active; valid unused voucher available",
    "steps": "1. Navigate to Redeem Voucher\n2. Select Voucher\n3. Enter PIN\n4. Confirm redemption",
    "expected": "Redemption approved; Voucher value applied; status updated to 'Redeemed'"
  },
  {
    "id": "TC-VR-002",
    "description": "Successful redemption (N$1000)",
    "preconditions": "Collector portal active; valid unused voucher available",
    "steps": "1. Navigate to Redeem Voucher\n2. Select Voucher\n3. Enter PIN \n4. Confirm redemption",
    "expected": "Redemption approved; Voucher value applied; status updated to 'Redeemed'"
  },
  {
    "id": "TC-VR-003",
    "description": "Redemption \u2014 Already redeemed voucher",
    "preconditions": "Collector portal active; voucher previously redeemed by same or different collector",
    "steps": "1. Navigate to Redeem Voucher\n2. Enter PIN of an already-redeemed voucher\n3. Confirm redemption",
    "expected": "Redemption declined; error: 'Voucher is not in a redeemable state'"
  },
  {
    "id": "TC-VR-004",
    "description": "Redemption \u2014 Expired voucher",
    "preconditions": "Collector portal active; voucher with passed expiry date available",
    "steps": "1. Navigate to Redeem Voucher\n2. Enter PIN of expired voucher\n3. Confirm redemption",
    "expected": "Redemption declined; error: 'Voucher is not in a redeemable state'"
  },
  {
    "id": "TC-VR-005",
    "description": "Redemption \u2014 Reversed voucher",
    "preconditions": "Collector portal active; reversed voucher available",
    "steps": "1. Navigate to Redeem Voucher\n2. Enter PIN\n3. Confirm redemption",
    "expected": "Redemption declined; error: 'Voucher is not in a redeemable state'"
  },
  {
    "id": "TC-VR-006",
    "description": "Redemption \u2014 Invalid / non-existent PIN",
    "preconditions": "Collector portal active",
    "steps": "1. Navigate to Redeem Voucher\n2. Enter PIN that does not exist\n3. Confirm redemption",
    "expected": "Redemption declined; error: 'Voucher not found or not redeemable'."
  },
  {
    "id": "TC-VR-007",
    "description": "Redemption \u2014 Blank PIN submitted",
    "preconditions": "Collector portal active",
    "steps": "1. Navigate to Redeem Voucher\n2. Leave PIN field empty\n3. Submit",
    "expected": "Validation error: 'PIN must be a string with a length of 16 digits'"
  },
  {
    "id": "TC-VR-008",
    "description": "Redemption \u2014 Voucher from unsupported / inactive product",
    "preconditions": "Collector portal active; voucher from a product that has since been disabled",
    "steps": "1. Navigate to Redeem Voucher\n2. Enter PIN and serial from disabled product\n3. Submit",
    "expected": "Redemption declined; error: 'Product not available' or 'Voucher not valid for redemption'; no credit issued"
  }
];
export const WORKBOOK_CASE_IDS = new Set(LESAKA_WORKBOOK_ROWS.map(row => row.id));
