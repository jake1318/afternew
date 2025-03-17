// Swap.tsx

import React, { useState, useEffect, useCallback } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { motion } from "framer-motion";
import { Coin } from "aftermath-ts-sdk";
import { useWalletContext } from "../../contexts/WalletContext";
import { formatBalance, formatUsd } from "../../utils/format";
import { CoinBalance } from "../../types";
import "./Swap.scss";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

interface QuoteResponse {
  routeId: string;
  coinIn: { type: string; amount: string };
  coinOut: { type: string; amount: string; formatted: string };
  spotPrice: number;
  priceImpact: number;
  steps: number;
}

const Swap: React.FC = () => {
  const { connected, account, signAndExecuteTransaction } = useWallet();
  const { walletState, refreshBalances, coinPrices, availableCoins } =
    useWalletContext();

  const [coinIn, setCoinIn] = useState<CoinBalance | null>(null);
  const [coinOut, setCoinOut] = useState<CoinBalance | null>(null);
  const [amountIn, setAmountIn] = useState<string>("");
  const [amountOut, setAmountOut] = useState<string>("");
  const [quoteData, setQuoteData] = useState<QuoteResponse | null>(null);
  const [slippage, setSlippage] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false);
  const [showCoinSelector, setShowCoinSelector] = useState<"in" | "out" | null>(
    null
  );
  const [topPoolCoins, setTopPoolCoins] = useState<string[]>([]);

  // Fetch top pool coin types from the backend
  useEffect(() => {
    async function fetchTopPoolCoins() {
      try {
        const response = await fetch(`${API_URL}/topPoolCoins`);
        if (!response.ok) {
          throw new Error("Failed to fetch top pool coins");
        }
        const data = await response.json();
        setTopPoolCoins(data.topPoolCoins);
      } catch (error) {
        console.error("Error fetching top pool coins:", error);
      }
    }
    fetchTopPoolCoins();
  }, []);

  // Set default tokens when wallet balances load, filtering by availableCoins
  useEffect(() => {
    if (
      walletState.balances.length > 0 &&
      availableCoins.length > 0 &&
      !coinIn
    ) {
      const supportedBalances = walletState.balances.filter((b) =>
        availableCoins.includes(b.coinType)
      );
      supportedBalances.sort((a, b) => {
        const aPriority = topPoolCoins.includes(a.coinType) ? 0 : 1;
        const bPriority = topPoolCoins.includes(b.coinType) ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.symbol.localeCompare(b.symbol);
      });
      const suiCoin = supportedBalances.find(
        (b) => b.coinType === "0x2::sui::SUI"
      );
      setCoinIn(suiCoin || supportedBalances[0]);
      const usdcCoin = supportedBalances.find(
        (b) =>
          b.symbol.toLowerCase().includes("usdc") ||
          b.coinType.toLowerCase().includes("usdc")
      );
      setCoinOut(
        usdcCoin ||
          (supportedBalances.length > 1
            ? supportedBalances[1]
            : supportedBalances[0])
      );
    }
  }, [walletState.balances, availableCoins, topPoolCoins, coinIn]);

  const fetchQuote = useCallback(async () => {
    if (
      !coinIn ||
      !coinOut ||
      coinIn.coinType === coinOut.coinType ||
      !amountIn ||
      parseFloat(amountIn) <= 0
    ) {
      setAmountOut("");
      setQuoteData(null);
      return;
    }
    try {
      setQuoteLoading(true);
      setError(null);
      const parsedAmountIn = parseFloat(amountIn);
      if (isNaN(parsedAmountIn)) {
        throw new Error("Invalid input amount");
      }
      let amountInBigInt;
      try {
        amountInBigInt = Coin.normalizeBalance(parsedAmountIn, coinIn.decimals);
      } catch (err) {
        console.error("Error converting amount to BigInt:", err);
        throw new Error("Invalid amount format");
      }
      const response = await fetch(`${API_URL}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coinInType: coinIn.coinType,
          coinOutType: coinOut.coinType,
          coinInAmount: amountInBigInt.toString(),
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get quote");
      }
      const quoteResponse: QuoteResponse = await response.json();
      setQuoteData(quoteResponse);
      setAmountOut(quoteResponse.coinOut.formatted);
    } catch (err) {
      console.error("Error getting quote:", err);
      setError("Failed to get quote. Please try again.");
      setAmountOut("");
      setQuoteData(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [coinIn, coinOut, amountIn]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (amountIn) {
        fetchQuote();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [coinIn, coinOut, amountIn, fetchQuote]);

  const handleSwap = async () => {
    if (!connected || !account || !coinIn || !coinOut || !quoteData) {
      setError("Please connect your wallet and get a valid quote");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: account.address,
          routeId: quoteData.routeId,
          slippage: slippage,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to build transaction");
      }
      const transactionResponse = await response.json();
      console.log("Transaction created successfully:", transactionResponse);
      const result = await signAndExecuteTransaction({
        transaction: transactionResponse.transaction,
      });
      console.log("Swap executed successfully:", result);
      setAmountIn("");
      setAmountOut("");
      setQuoteData(null);
      setTimeout(() => {
        refreshBalances();
      }, 2000);
    } catch (err) {
      console.error("Swap error:", err);
      setError("Failed to execute swap. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleMaxClick = () => {
    if (coinIn && coinIn.balance) {
      try {
        const maxAmount = Coin.balanceWithDecimals(
          coinIn.balance,
          coinIn.decimals
        );
        if (coinIn.coinType === "0x2::sui::SUI") {
          const adjustedMax = Math.max(0, Number(maxAmount) - 0.01);
          setAmountIn(adjustedMax.toString());
        } else {
          setAmountIn(maxAmount.toString());
        }
      } catch (err) {
        console.error("Error setting max amount:", err);
        setError("Failed to set maximum amount");
      }
    }
  };

  const handleFlipTokens = () => {
    const tempCoinIn = coinIn;
    setCoinIn(coinOut);
    setCoinOut(tempCoinIn);
    setAmountIn("");
    setAmountOut("");
    setQuoteData(null);
  };

  const selectCoin = (coin: CoinBalance) => {
    if (showCoinSelector === "in") {
      setCoinIn(coin);
      if (coinOut && coin.coinType === coinOut.coinType) {
        setCoinOut(coinIn);
      }
    } else if (showCoinSelector === "out") {
      setCoinOut(coin);
      if (coinIn && coin.coinType === coinIn.coinType) {
        setCoinIn(coinOut);
      }
    }
    setShowCoinSelector(null);
    setAmountIn("");
    setAmountOut("");
    setQuoteData(null);
  };

  const calculateUsdValue = (amount: string, coinType: string): string => {
    if (!amount || !coinPrices || !coinPrices[coinType]) {
      return formatUsd(0);
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
      return formatUsd(0);
    }
    return formatUsd(numAmount * coinPrices[coinType]);
  };

  // Prepare sorted balances: filter wallet balances to only include coins from availableCoins and sort so that topPoolCoins appear first.
  const sortedBalances = walletState.balances
    .filter((coin) => availableCoins.includes(coin.coinType))
    .sort((a, b) => {
      const aPriority = topPoolCoins.includes(a.coinType) ? 0 : 1;
      const bPriority = topPoolCoins.includes(b.coinType) ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.symbol.localeCompare(b.symbol);
    });

  return (
    <div className="swap-page">
      <motion.div
        className="swap-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="swap-header">
          <h1>Swap</h1>
          <div className="swap-settings">
            <div className="slippage-setting">
              <span>Slippage: </span>
              <select
                value={slippage}
                onChange={(e) => setSlippage(parseFloat(e.target.value))}
              >
                <option value="0.1">0.1%</option>
                <option value="0.5">0.5%</option>
                <option value="1.0">1.0%</option>
                <option value="2.0">2.0%</option>
                <option value="5.0">5.0%</option>
              </select>
            </div>
          </div>
        </div>

        {!connected && (
          <div className="connect-prompt">
            <p>Connect your wallet to start swapping</p>
          </div>
        )}

        <div className="swap-form">
          <div className="swap-input">
            <div className="swap-input-header">
              <span>From</span>
              {coinIn && (
                <span className="balance-display">
                  Balance: {formatBalance(coinIn.balance, coinIn.decimals)}
                </span>
              )}
            </div>
            <div className="swap-input-content">
              <input
                type="number"
                placeholder="0.0"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                disabled={!connected || !coinIn}
                min="0"
                step="any"
              />
              <div className="token-selector">
                {coinIn ? (
                  <button
                    className="token-button"
                    onClick={() => setShowCoinSelector("in")}
                  >
                    <span className="token-symbol">{coinIn.symbol}</span>
                    <span className="dropdown-icon">▼</span>
                  </button>
                ) : (
                  <button
                    className="token-button"
                    onClick={() => setShowCoinSelector("in")}
                    disabled={!connected}
                  >
                    Select Token <span className="dropdown-icon">▼</span>
                  </button>
                )}
                {coinIn && (
                  <button className="max-button" onClick={handleMaxClick}>
                    MAX
                  </button>
                )}
              </div>
            </div>
            {coinIn && coinPrices[coinIn.coinType] && amountIn && (
              <div className="swap-input-footer">
                ≈ {calculateUsdValue(amountIn, coinIn.coinType)}
              </div>
            )}
          </div>

          <button className="flip-button" onClick={handleFlipTokens}>
            ⇅
          </button>

          <div className="swap-input">
            <div className="swap-input-header">
              <span>To</span>
              {coinOut && (
                <span className="balance-display">
                  Balance: {formatBalance(coinOut.balance, coinOut.decimals)}
                </span>
              )}
            </div>
            <div className="swap-input-content">
              <input
                type="text"
                placeholder="0.0"
                value={quoteLoading ? "Loading..." : amountOut}
                disabled
              />
              <div className="token-selector">
                {coinOut ? (
                  <button
                    className="token-button"
                    onClick={() => setShowCoinSelector("out")}
                  >
                    <span className="token-symbol">{coinOut.symbol}</span>
                    <span className="dropdown-icon">▼</span>
                  </button>
                ) : (
                  <button
                    className="token-button"
                    onClick={() => setShowCoinSelector("out")}
                    disabled={!connected}
                  >
                    Select Token <span className="dropdown-icon">▼</span>
                  </button>
                )}
              </div>
            </div>
            {coinOut && coinPrices[coinOut.coinType] && amountOut && (
              <div className="swap-input-footer">
                ≈ {calculateUsdValue(amountOut, coinOut.coinType)}
              </div>
            )}
          </div>

          {quoteData && (
            <div className="swap-details">
              <div className="detail-item">
                <span>Rate</span>
                <span>
                  1 {coinIn?.symbol} ≈{" "}
                  {parseFloat(amountIn) > 0
                    ? (parseFloat(amountOut) / parseFloat(amountIn)).toFixed(6)
                    : "0.00"}{" "}
                  {coinOut?.symbol}
                </span>
              </div>
              {quoteData.priceImpact !== null && (
                <div className="detail-item">
                  <span>Price Impact</span>
                  <span
                    className={quoteData.priceImpact > 5 ? "high-impact" : ""}
                  >
                    {quoteData.priceImpact.toFixed(2)}%
                  </span>
                </div>
              )}
              <div className="detail-item">
                <span>Slippage Tolerance</span>
                <span>{slippage}%</span>
              </div>
            </div>
          )}

          {error && (
            <div className="error-message">
              <span>{error}</span>
              {error.includes("slippage") && (
                <button
                  className="increase-slippage-button"
                  onClick={() => setSlippage(Math.min(slippage * 2, 5))}
                >
                  Increase slippage
                </button>
              )}
            </div>
          )}

          <button
            className="swap-button"
            disabled={
              !connected ||
              !coinIn ||
              !coinOut ||
              !amountIn ||
              !amountOut ||
              loading ||
              quoteLoading
            }
            onClick={handleSwap}
          >
            {loading ? "Swapping..." : "Swap"}
          </button>

          <button
            className="refresh-button"
            onClick={fetchQuote}
            disabled={quoteLoading || !amountIn || !coinIn || !coinOut}
            style={{
              marginTop: "10px",
              padding: "8px",
              backgroundColor: "#e0e0e0",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              opacity:
                quoteLoading || !amountIn || !coinIn || !coinOut ? 0.6 : 1,
            }}
          >
            {quoteLoading ? "Refreshing..." : "Refresh Quote"}
          </button>
        </div>

        {showCoinSelector && (
          <div className="coin-selector-modal">
            <div className="coin-selector-content">
              <div className="coin-selector-header">
                <h3>Select a token</h3>
                <button
                  className="close-button"
                  onClick={() => setShowCoinSelector(null)}
                >
                  ✕
                </button>
              </div>
              <div className="coin-list">
                {sortedBalances.map((coin) => (
                  <div
                    key={coin.coinType}
                    className="coin-item"
                    onClick={() => selectCoin(coin)}
                  >
                    <div className="coin-info">
                      <span className="coin-symbol">{coin.symbol}</span>
                      <span className="coin-name">{coin.name}</span>
                    </div>
                    <div className="coin-balance">
                      {formatBalance(coin.balance, coin.decimals)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Swap;
