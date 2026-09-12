export const formatNad = (amount: number | string | null | undefined) => {
  const numericAmount = Number(amount || 0);
  return `N$${numericAmount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).replace(/,/g, " ")}`;
};
