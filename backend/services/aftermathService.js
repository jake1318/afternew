const { Aftermath } = require("aftermath-ts-sdk");
const crypto = require("crypto");

// Cache for storing routes by ID
const routeCache = {};

// Cache expiration time (5 minutes)
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;

class AftermathService {
  constructor() {
    this.sdk = null;
    this.initialized = false;
    this.lastCleanup = Date.now();
    this.initialize();
  }

  async initialize() {
    try {
      const network = process.env.NETWORK || "MAINNET";
      this.sdk = new Aftermath(network);
      await this.sdk.init();
      this.initialized = true;
      console.log(`Aftermath SDK initialized for ${network}`);
    } catch (error) {
      console.error("Failed to initialize Aftermath SDK:", error);
      this.initialized = false;
      // We'll retry on the next request
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }

    // Periodically clean the cache
    if (Date.now() - this.lastCleanup > CACHE_EXPIRATION_MS) {
      this.cleanupCache();
    }
  }

  cleanupCache() {
    const now = Date.now();
    this.lastCleanup = now;

    Object.entries(routeCache).forEach(([id, entry]) => {
      if (entry.timestamp && now - entry.timestamp > CACHE_EXPIRATION_MS) {
        delete routeCache[id];
      }
    });

    console.log(
      `Cache cleaned. Current entries: ${Object.keys(routeCache).length}`
    );
  }

  generateRouteId() {
    return crypto.randomUUID();
  }

  async getSupportedCoins() {
    await this.ensureInitialized();
    try {
      const router = this.sdk.Router();
      return await router.getSupportedCoins();
    } catch (error) {
      console.error("Error getting supported coins:", error);
      throw error;
    }
  }

  async getCoinPrices(coins) {
    await this.ensureInitialized();
    try {
      const prices = this.sdk.Prices();
      return await prices.getCoinsToPrice({ coins });
    } catch (error) {
      console.error("Error getting coin prices:", error);
      throw error;
    }
  }

  async getQuote(coinInType, coinOutType, coinInAmount) {
    await this.ensureInitialized();

    try {
      const router = this.sdk.Router();
      const coinInAmountBigInt = BigInt(coinInAmount);

      console.log("Fetching route for:", {
        coinInType,
        coinOutType,
        coinInAmount: coinInAmountBigInt.toString(),
      });

      // Get the complete trade route
      const completeRoute = await router.getCompleteTradeRouteGivenAmountIn({
        coinInType,
        coinOutType,
        coinInAmount: coinInAmountBigInt,
      });

      console.log("Route received with keys:", Object.keys(completeRoute));

      // Fix missing or empty steps array
      if (!completeRoute.steps || !Array.isArray(completeRoute.steps)) {
        console.log("Creating default steps array as it was missing");
        completeRoute.steps = [
          {
            type: "swap",
            coinIn: completeRoute.coinIn,
            coinOut: completeRoute.coinOut,
            route: "direct",
          },
        ];
      } else if (completeRoute.steps.length === 0) {
        console.log("Steps array was empty, adding default step");
        completeRoute.steps.push({
          type: "swap",
          coinIn: completeRoute.coinIn,
          coinOut: completeRoute.coinOut,
          route: "direct",
        });
      }

      // Generate a unique ID for this route and store it in cache
      const routeId = this.generateRouteId();
      routeCache[routeId] = {
        route: completeRoute,
        timestamp: Date.now(),
      };

      // Calculate price impact
      const coinOutAmount = Number(completeRoute.coinOut.amount);
      const spotPrice = Number(completeRoute.spotPrice);
      const amountIn = Number(coinInAmount);
      const priceImpact = (1 - (coinOutAmount * spotPrice) / amountIn) * 100;

      // Get coin decimals to format output amount
      const coin = this.sdk.Coin();
      const decimalsMap = await coin.getCoinsToDecimals({
        coins: [completeRoute.coinOut.coinType],
      });
      const decimals = decimalsMap[completeRoute.coinOut.coinType] || 9;

      const outputAmount = this.sdk.Coin.balanceWithDecimals(
        completeRoute.coinOut.amount,
        decimals
      );

      return {
        routeId,
        coinIn: {
          type: completeRoute.coinIn.coinType,
          amount: completeRoute.coinIn.amount.toString(),
        },
        coinOut: {
          type: completeRoute.coinOut.coinType,
          amount: completeRoute.coinOut.amount.toString(),
          formatted: outputAmount.toString(),
        },
        spotPrice: completeRoute.spotPrice,
        priceImpact: priceImpact,
        steps: completeRoute.steps.length,
      };
    } catch (error) {
      console.error("Error getting quote:", error);
      throw error;
    }
  }

  async buildTransaction(walletAddress, routeId, slippage) {
    await this.ensureInitialized();

    // Retrieve the cached route
    const cachedEntry = routeCache[routeId];
    if (!cachedEntry) {
      throw new Error("Route expired or not found. Please get a new quote.");
    }

    const completeRoute = cachedEntry.route;

    try {
      const router = this.sdk.Router();
      const slippageDecimal = slippage / 100; // Convert from percentage to decimal

      console.log("Building transaction for route:", routeId);
      console.log("Using slippage:", slippageDecimal);

      // Try to build the transaction using the route-based method first
      try {
        const tx = await router.getTransactionForCompleteTradeRoute({
          walletAddress,
          completeRoute,
          slippage: slippageDecimal,
        });

        console.log("Transaction built successfully using route-based method");

        return {
          transaction: tx,
          method: "route-based",
          coinIn: {
            type: completeRoute.coinIn.coinType,
            amount: completeRoute.coinIn.amount.toString(),
          },
          coinOut: {
            type: completeRoute.coinOut.coinType,
            amount: completeRoute.coinOut.amount.toString(),
          },
        };
      } catch (routeError) {
        console.error(
          "Route-based transaction building failed, trying simple swap:",
          routeError
        );

        // If route-based method fails, try the simple swap approach
        const tx = await router.createSwapTransaction({
          walletAddress,
          coinInType: completeRoute.coinIn.coinType,
          coinOutType: completeRoute.coinOut.coinType,
          coinInAmount: completeRoute.coinIn.amount,
          slippage: slippageDecimal,
        });

        console.log("Transaction built successfully using simple swap method");

        return {
          transaction: tx,
          method: "simple-swap",
          coinIn: {
            type: completeRoute.coinIn.coinType,
            amount: completeRoute.coinIn.amount.toString(),
          },
          coinOut: {
            type: completeRoute.coinOut.coinType,
            amount: completeRoute.coinOut.amount.toString(),
          },
        };
      }
    } catch (error) {
      console.error("Error building transaction:", error);
      throw error;
    }
  }
}

module.exports = new AftermathService();
