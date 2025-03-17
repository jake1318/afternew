import { Coin } from "aftermath-ts-sdk";

// Format wallet address to truncated form
export const formatAddress = (address: string): string => {
  if (!address) return "";
  return `${address.substring(0, 6)}...${address.substring(
    address.length - 4
  )}`;
};

// Format balance with proper decimals
export const formatBalance = (balance: bigint, decimals: number): string => {
  return Coin.balanceWithDecimals(balance, decimals).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
};

// Format USD value
export const formatUsd = (value: number | undefined): string => {
  if (value === undefined) return "N/A";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// Format percentage
export const formatPercentage = (value: number): string => {
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
};

// Format with compact notation for large numbers
export const formatCompact = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
};
