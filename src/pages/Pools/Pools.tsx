import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { motion } from "framer-motion";
import { Aftermath, Coin } from "aftermath-ts-sdk";
import { useWalletContext } from "../../contexts/WalletContext";
import { useAftermathContext } from "../../contexts/AftermathContext";
import {
  formatBalance,
  formatUsd,
  formatPercentage,
  formatCompact,
} from "../../utils/format";
import "./Pools.scss";

const Pools: React.FC = () => {
  const { connected, account, signAndExecuteTransaction } = useWallet();
  const { walletState, refreshBalances } = useWalletContext();
  const {
    sdk,
    pools,
    loading: poolsLoading,
    refreshPools,
  } = useAftermathContext();

  const [activePool, setActivePool] = useState<string | null>(null);
  const [depositAmounts, setDepositAmounts] = useState<Record<string, string>>(
    {}
  );
  const [depositLoading, setDepositLoading] = useState<boolean>(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [withdrawLoading, setWithdrawLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"tvl" | "apr">("tvl");
  const [showUserPools, setShowUserPools] = useState<boolean>(false);

  useEffect(() => {
    if (connected && !poolsLoading) {
      refreshPools();
    }
  }, [connected, refreshPools]);

  // Filter and sort pools
  const filteredPools = showUserPools
    ? pools.filter(
        (pool) => pool.userLpBalance && pool.userLpBalance > BigInt(0)
      )
    : pools;

  const sortedPools = [...filteredPools].sort((a, b) => {
    if (sortBy === "tvl") {
      return b.tvl - a.tvl;
    } else {
      return b.apr - a.apr;
    }
  });

  const handleDeposit = async (poolId: string) => {
    if (!connected || !account || !sdk) {
      setError("Please connect your wallet");
      return;
    }

    setDepositLoading(true);
    setError(null);

    try {
      // Find the pool
      const pool = pools.find((p) => p.id === poolId);
      if (!pool) throw new Error("Pool not found");

      // Get Aftermath Pools module
      const poolsModule = sdk.Pools();

      // Get the pool instance
      const poolInstance = await poolsModule.getPool({ objectId: poolId });
      const poolObj = new poolsModule.Pool(poolInstance);

      // Prepare amounts for deposit
      const amountsIn: Record<string, bigint> = {};

      // For each coin in the pool that the user has specified an amount for
      for (const coinType of Object.keys(depositAmounts)) {
        const amount = depositAmounts[coinType];
        if (amount && parseFloat(amount) > 0) {
          // Find coin info to get decimals
          const coinInfo = pool.coins.find((c) => c.coinType === coinType);
          if (coinInfo) {
            const amountBigInt = Coin.normalizeBalance(
              parseFloat(amount),
              coinInfo.decimals
            );
            amountsIn[coinType] = amountBigInt;
          }
        }
      }

      if (Object.keys(amountsIn).length === 0) {
        throw new Error("Please enter at least one deposit amount");
      }

      // Create deposit transaction
      const tx = await poolObj.getDepositTransaction({
        walletAddress: account.address,
        amountsIn,
        slippage: 0.01, // 1% slippage
      });

      // Execute transaction
      const result = await signAndExecuteTransaction({
        transaction: tx,
      });

      console.log("Deposit executed:", result);

      // Reset form and refresh data
      setDepositAmounts({});
      setActivePool(null);
      setDepositLoading(false);

      // Refresh pools and balances after a short delay
      setTimeout(() => {
        refreshPools();
        refreshBalances();
      }, 2000);
    } catch (err) {
      console.error("Deposit error:", err);
      setError(
        `Failed to execute deposit: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
      setDepositLoading(false);
    }
  };

  const handleWithdraw = async (poolId: string) => {
    if (!connected || !account || !sdk || !withdrawAmount) {
      setError("Please connect your wallet and enter a withdrawal amount");
      return;
    }

    setWithdrawLoading(true);
    setError(null);

    try {
      // Find the pool
      const pool = pools.find((p) => p.id === poolId);
      if (!pool) throw new Error("Pool not found");

      // Find user's LP balance
      const lpBalance = pool.userLpBalance;
      if (!lpBalance || lpBalance === BigInt(0)) {
        throw new Error("You do not have any LP tokens for this pool");
      }

      // Get Aftermath Pools module
      const poolsModule = sdk.Pools();

      // Get the pool instance
      const poolInstance = await poolsModule.getPool({ objectId: poolId });
      const poolObj = new poolsModule.Pool(poolInstance);

      // Convert withdraw amount to bigint
      const withdrawAmountBigInt = Coin.normalizeBalance(
        parseFloat(withdrawAmount),
        pool.userLpBalance ? 9 : 9 // LP decimals, default to 9
      );

      // Create withdrawal transaction (proportional withdrawal)
      const tx = await poolObj.getAllCoinWithdrawTransaction({
        walletAddress: account.address,
        lpCoinAmount: withdrawAmountBigInt,
      });

      // Execute transaction
      const result = await signAndExecuteTransaction({
        transaction: tx,
      });

      console.log("Withdraw executed:", result);

      // Reset form and refresh data
      setWithdrawAmount("");
      setActivePool(null);
      setWithdrawLoading(false);

      // Refresh pools and balances after a short delay
      setTimeout(() => {
        refreshPools();
        refreshBalances();
      }, 2000);
    } catch (err) {
      console.error("Withdraw error:", err);
      setError(
        `Failed to execute withdrawal: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
      setWithdrawLoading(false);
    }
  };

  return (
    <div className="pools-page">
      <div className="pools-container">
        <div className="pools-header">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            Liquidity Pools
          </motion.h1>

          <div className="pools-actions">
            <div className="sort-options">
              <span>Sort by:</span>
              <button
                className={sortBy === "tvl" ? "active" : ""}
                onClick={() => setSortBy("tvl")}
              >
                TVL
              </button>
              <button
                className={sortBy === "apr" ? "active" : ""}
                onClick={() => setSortBy("apr")}
              >
                APR
              </button>
            </div>

            {connected && (
              <div className="filter-option">
                <label>
                  <input
                    type="checkbox"
                    checked={showUserPools}
                    onChange={() => setShowUserPools(!showUserPools)}
                  />
                  <span>My pools</span>
                </label>
              </div>
            )}

            <button
              className="refresh-button"
              onClick={refreshPools}
              disabled={poolsLoading}
            >
              {poolsLoading ? "Loading..." : "⟳ Refresh"}
            </button>
          </div>
        </div>

        {!connected && (
          <div className="connect-prompt">
            <p>Connect your wallet to view and interact with liquidity pools</p>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        <div className="pools-grid">
          {poolsLoading ? (
            <div className="loading-pools">Loading pools...</div>
          ) : sortedPools.length > 0 ? (
            sortedPools.map((pool) => (
              <motion.div
                key={pool.id}
                className="pool-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="pool-header">
                  <h3>{pool.name}</h3>

                  <div className="pool-badges">
                    {pool.userLpBalance && pool.userLpBalance > BigInt(0) && (
                      <span className="your-pool-badge">Your Pool</span>
                    )}
                  </div>
                </div>

                <div className="pool-stats">
                  <div className="stat-item">
                    <span className="stat-label">TVL</span>
                    <span className="stat-value">{formatUsd(pool.tvl)}</span>
                  </div>

                  <div className="stat-item">
                    <span className="stat-label">APR</span>
                    <span className="stat-value">
                      {formatPercentage(pool.apr)}
                    </span>
                  </div>

                  <div className="stat-item">
                    <span className="stat-label">24h Volume</span>
                    <span className="stat-value">
                      {formatUsd(pool.volume24h)}
                    </span>
                  </div>
                </div>

                <div className="pool-assets">
                  <h4>Assets</h4>
                  <div className="assets-list">
                    {pool.coins.map((coin) => (
                      <div key={coin.coinType} className="asset-item">
                        <span className="asset-symbol">{coin.symbol}</span>
                        <div className="asset-info">
                          <span className="asset-weight">
                            {formatPercentage(
                              Number(coin.weight) / 10000000000
                            )}
                          </span>
                          <span className="asset-balance">
                            {formatCompact(
                              Number(
                                Coin.balanceWithDecimals(
                                  coin.balance,
                                  coin.decimals
                                )
                              )
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {pool.userLpBalance && pool.userLpBalance > BigInt(0) && (
                  <div className="your-position">
                    <h4>Your Position</h4>
                    <div className="position-info">
                      <span>LP Tokens:</span>
                      <span>{formatBalance(pool.userLpBalance, 9)}</span>
                    </div>
                  </div>
                )}

                <div className="pool-actions">
                  {activePool === pool.id ? (
                    <div className="active-actions">
                      <div className="action-tabs">
                        <button className="tab active">Deposit</button>
                        <button
                          className="tab"
                          disabled={
                            !pool.userLpBalance ||
                            pool.userLpBalance === BigInt(0)
                          }
                        >
                          Withdraw
                        </button>
                      </div>

                      <div className="deposit-form">
                        {pool.coins.map((coin) => {
                          const userCoin = walletState.balances.find(
                            (b) => b.coinType === coin.coinType
                          );

                          return (
                            <div key={coin.coinType} className="deposit-input">
                              <div className="input-header">
                                <span>{coin.symbol}</span>
                                {userCoin && (
                                  <span className="balance">
                                    Balance:{" "}
                                    {formatBalance(
                                      userCoin.balance,
                                      userCoin.decimals
                                    )}
                                  </span>
                                )}
                              </div>

                              <div className="input-group">
                                <input
                                  type="number"
                                  placeholder="0.0"
                                  value={depositAmounts[coin.coinType] || ""}
                                  onChange={(e) =>
                                    setDepositAmounts({
                                      ...depositAmounts,
                                      [coin.coinType]: e.target.value,
                                    })
                                  }
                                />

                                {userCoin && (
                                  <button
                                    className="max-button"
                                    onClick={() => {
                                      const maxAmount =
                                        Coin.balanceWithDecimals(
                                          userCoin.balance,
                                          userCoin.decimals
                                        ).toString();
                                      setDepositAmounts({
                                        ...depositAmounts,
                                        [coin.coinType]: maxAmount,
                                      });
                                    }}
                                  >
                                    MAX
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        <div className="action-buttons">
                          <button
                            className="cancel-button"
                            onClick={() => {
                              setActivePool(null);
                              setDepositAmounts({});
                            }}
                          >
                            Cancel
                          </button>

                          <button
                            className="confirm-button"
                            onClick={() => handleDeposit(pool.id)}
                            disabled={depositLoading}
                          >
                            {depositLoading ? "Processing..." : "Deposit"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="default-actions">
                      <button
                        className="deposit-button"
                        onClick={() => setActivePool(pool.id)}
                        disabled={!connected}
                      >
                        Deposit
                      </button>

                      <button
                        className="withdraw-button"
                        onClick={() => {
                          setActivePool(pool.id);
                          // TODO: Switch to withdraw tab logic
                        }}
                        disabled={
                          !connected ||
                          !pool.userLpBalance ||
                          pool.userLpBalance === BigInt(0)
                        }
                      >
                        Withdraw
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))
          ) : (
            <div className="no-pools">No liquidity pools found</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Pools;
