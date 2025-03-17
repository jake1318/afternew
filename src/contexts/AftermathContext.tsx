import React, { createContext, useContext, useState, useEffect } from "react";
import { Aftermath } from "aftermath-ts-sdk";
import { useWalletContext } from "./WalletContext";
import { PoolData } from "../types";
import { useWallet } from "@suiet/wallet-kit";

// Create Aftermath SDK instance
const afSdk = new Aftermath("MAINNET");

// Create context
const AftermathContext = createContext<{
  sdk: Aftermath | null;
  isInitialized: boolean;
  pools: PoolData[];
  loading: boolean;
  error: string | null;
  refreshPools: () => Promise<void>;
}>({
  sdk: null,
  isInitialized: false,
  pools: [],
  loading: false,
  error: null,
  refreshPools: async () => {},
});

export const useAftermathContext = () => useContext(AftermathContext);

export const AftermathProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [pools, setPools] = useState<PoolData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { walletState } = useWalletContext();
  const { account } = useWallet();

  // Initialize Aftermath SDK
  useEffect(() => {
    const initAftermath = async () => {
      try {
        await afSdk.init();
        setIsInitialized(true);
        console.log("Aftermath SDK initialized");
        refreshPools();
      } catch (err) {
        console.error("Failed to initialize Aftermath SDK", err);
        setError("Failed to initialize Aftermath SDK");
      }
    };

    if (!isInitialized) {
      initAftermath();
    }
  }, []);

  // Refresh pools data
  const refreshPools = async () => {
    if (!isInitialized) return;

    setLoading(true);
    setError(null);

    try {
      const poolsModule = afSdk.Pools();
      const allPools = await poolsModule.getAllPools();

      // Map pool data to our format
      const formattedPools: PoolData[] = [];

      for (const pool of allPools) {
        try {
          const poolInstance = new poolsModule.Pool(pool);
          const stats = await poolInstance.getStats();
          const volume24h = await poolInstance.getVolume24hrs();

          // Format coins in the pool
          const coins = Object.entries(pool.coins).map(([coinType, coin]) => {
            const decimals = coin.decimals || 9;
            return {
              coinType,
              symbol: coinType.split("::").pop() || "Unknown",
              balance: coin.balance,
              weight: coin.weight,
              decimals,
            };
          });

          // Check if user has LP tokens for this pool
          let userLpBalance: bigint | undefined = undefined;
          if (walletState.connected && account?.address) {
            const lpBalance = walletState.balances.find(
              (b) => b.coinType === pool.lpCoinType
            );
            if (lpBalance) {
              userLpBalance = lpBalance.balance;
            }
          }

          formattedPools.push({
            id: poolInstance.getObjectId(),
            name: pool.name,
            tvl: stats.tvl,
            apr: stats.apr,
            volume24h,
            coins,
            lpCoinType: pool.lpCoinType,
            lpCoinSupply: pool.lpCoinSupply,
            userLpBalance,
          });
        } catch (err) {
          console.error("Error processing pool:", err);
        }
      }

      setPools(formattedPools);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching pools:", error);
      setError("Failed to fetch pools");
      setLoading(false);
    }
  };

  return (
    <AftermathContext.Provider
      value={{
        sdk: isInitialized ? afSdk : null,
        isInitialized,
        pools,
        loading,
        error,
        refreshPools,
      }}
    >
      {children}
    </AftermathContext.Provider>
  );
};
