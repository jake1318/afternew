const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { Aftermath } = require("aftermath-ts-sdk");
const crypto = require("crypto");

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Aftermath SDK
const network = process.env.NETWORK || "MAINNET";
let aftermathSDK = null;
let initialized = false;

// Route cache
const routeCache = {};

// Initialize SDK
async function initSDK() {
  try {
    aftermathSDK = new Aftermath(network);
    await aftermathSDK.init();
    initialized = true;
    console.log(`Aftermath SDK initialized for ${network}`);
    return true;
  } catch (error) {
    console.error("Failed to initialize Aftermath SDK:", error);
    return false;
  }
}

// Ensure SDK is initialized
async function ensureSDK() {
  if (!initialized) {
    return await initSDK();
  }
  return true;
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", initialized });
});

// Get quote
app.post("/api/quote", async (req, res) => {
  const { coinInType, coinOutType, coinInAmount } = req.body;

  if (!coinInType || !coinOutType || !coinInAmount) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    await ensureSDK();

    const router = aftermathSDK.Router();
    console.log(
      `Fetching route for: ${JSON.stringify({
        coinInType,
        coinOutType,
        coinInAmount,
      })}`
    );

    // Get trade route
    const completeRoute = await router.getCompleteTradeRouteGivenAmountIn({
      coinInType,
      coinOutType,
      coinInAmount: BigInt(coinInAmount),
    });

    console.log(`Route received with keys: ${Object.keys(completeRoute)}`);

    // Fix missing steps array if needed
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
    }

    // Generate route ID
    const routeId = crypto.randomUUID();
    routeCache[routeId] = {
      route: completeRoute,
      timestamp: Date.now(),
    };

    // Get coin decimals
    const coin = aftermathSDK.Coin();
    const decimalsMap = await coin.getCoinsToDecimals({
      coins: [completeRoute.coinOut.coinType],
    });
    const decimals = decimalsMap[completeRoute.coinOut.coinType] || 9;

    // Format output
    const outputAmount = aftermathSDK.Coin.balanceWithDecimals(
      completeRoute.coinOut.amount,
      decimals
    );

    return res.json({
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
      priceImpact: 0, // Simplified - not calculating price impact
      steps: completeRoute.steps.length,
    });
  } catch (error) {
    console.error("Quote error:", error);

    // Try simpler approach as fallback
    try {
      const router = aftermathSDK.Router();
      const tx = await router.createSwapTransaction({
        walletAddress: "0x0000000000000000000000000000000000000000", // Temporary dummy address
        coinInType,
        coinOutType,
        coinInAmount: BigInt(coinInAmount),
        slippage: 0.01,
      });

      // If we reach here, we can create a transaction, so return a simplified quote
      const routeId = crypto.randomUUID();

      return res.json({
        routeId,
        coinIn: {
          type: coinInType,
          amount: coinInAmount,
        },
        coinOut: {
          type: coinOutType,
          amount: "0", // We don't have the exact amount
          formatted: "0", // We don't have the exact amount
        },
        spotPrice: 0,
        priceImpact: 0,
        steps: 1,
      });
    } catch (fallbackError) {
      return res.status(500).json({ error: "Failed to get quote" });
    }
  }
});

// Build transaction
app.post("/api/transaction", async (req, res) => {
  const { walletAddress, routeId, slippage } = req.body;

  if (!walletAddress || !routeId) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    await ensureSDK();

    const cachedRoute = routeCache[routeId];
    if (!cachedRoute) {
      return res
        .status(404)
        .json({ error: "Route not found. Please get a new quote." });
    }

    const router = aftermathSDK.Router();
    let tx;

    // Try using route transaction first
    try {
      tx = await router.getTransactionForCompleteTradeRoute({
        walletAddress,
        completeRoute: cachedRoute.route,
        slippage: slippage ? slippage / 100 : 0.01,
      });
    } catch (routeError) {
      // Fallback to simple swap
      tx = await router.createSwapTransaction({
        walletAddress,
        coinInType: cachedRoute.route.coinIn.coinType,
        coinOutType: cachedRoute.route.coinOut.coinType,
        coinInAmount: BigInt(cachedRoute.route.coinIn.amount.toString()),
        slippage: slippage ? slippage / 100 : 0.01,
      });
    }

    return res.json({ transaction: tx });
  } catch (error) {
    console.error("Transaction error:", error);
    return res.status(500).json({ error: "Failed to build transaction" });
  }
});

// Get supported coins
app.get("/api/coins", async (req, res) => {
  try {
    await ensureSDK();
    const router = aftermathSDK.Router();
    const coins = await router.getSupportedCoins();
    res.json(coins);
  } catch (error) {
    console.error("Error getting supported coins:", error);
    res.status(500).json({ error: "Failed to get supported coins" });
  }
});

// Get coin prices
app.get("/api/prices", async (req, res) => {
  try {
    const { coins } = req.query;
    if (!coins) {
      return res.status(400).json({ error: "Missing coins parameter" });
    }

    await ensureSDK();
    const prices = aftermathSDK.Prices();
    const coinList = coins.split(",");
    const priceData = await prices.getCoinsToPrice({ coins: coinList });
    res.json(priceData);
  } catch (error) {
    console.error("Error getting coin prices:", error);
    res.status(500).json({ error: "Failed to get coin prices" });
  }
});

// Start the server
app.listen(port, async () => {
  await initSDK();
  console.log(`Aftermath Swap Backend running on port ${port}`);
});
