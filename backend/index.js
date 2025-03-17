// index.js

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Aftermath } = require("aftermath-ts-sdk");

const app = express();

// Enable CORS for requests from http://localhost:3000
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// Global caches
const routeCache = {}; // For caching routes (used by /api/quote)
let afSdk; // Global Aftermath SDK instance

// Variables for pooling data caching
let allPools = []; // Array of all pool objects
const poolVolumes = new Map(); // Map: pool.objectId -> volume
let topPoolCoinsCache = []; // Cached array of coin types from top pools
let lastBatchIndex = 0; // Index to keep track of which batch to update next

// Initialize the Aftermath SDK
async function initSdk() {
  try {
    afSdk = new Aftermath("MAINNET");
    await afSdk.init();
    console.log("Aftermath SDK initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize Aftermath SDK:", error);
    process.exit(1);
  }
}

// Initialize all pools and set up initial volume cache
async function initializePools() {
  try {
    const poolsInstance = afSdk.Pools();
    allPools = await poolsInstance.getAllPools();
    console.log(`Fetched ${allPools.length} pools.`);
    // Initialize volume map with 0 for each pool
    allPools.forEach((pool) => poolVolumes.set(pool.objectId, 0));
  } catch (error) {
    console.error("Error initializing pools:", error);
  }
}

// Update the next batch of 100 pools' volume data
async function updateNextBatch() {
  // Get a slice of 100 pools
  const batch = allPools.slice(lastBatchIndex, lastBatchIndex + 100);
  console.log(
    `Updating pool volumes for batch indexes ${lastBatchIndex} - ${
      lastBatchIndex + batch.length
    }`
  );
  const results = await Promise.allSettled(
    batch.map(async (pool) => {
      try {
        const volume = await pool.getVolume24hrs();
        return { pool, volume };
      } catch (e) {
        console.error("Error getting volume for pool", pool.objectId, e);
        return null;
      }
    })
  );
  results.forEach((result) => {
    if (result.status === "fulfilled" && result.value) {
      const { pool, volume } = result.value;
      poolVolumes.set(pool.objectId, volume);
    }
  });
  // Update the batch index for next call
  lastBatchIndex += 100;
  if (lastBatchIndex >= allPools.length) {
    lastBatchIndex = 0;
  }
  updateTopPoolCoinsCache();
}

// Recalculate the top 100 pools by volume and update the coin cache
function updateTopPoolCoinsCache() {
  const poolsWithVolume = allPools.map((pool) => ({
    pool,
    volume: poolVolumes.get(pool.objectId) || 0,
  }));
  poolsWithVolume.sort((a, b) => b.volume - a.volume);
  const top100Pools = poolsWithVolume.slice(0, 100).map((item) => item.pool);
  // Collect coin types from the top 100 pools (assuming pool.coins is an object keyed by coin type)
  const coinSet = new Set();
  top100Pools.forEach((pool) => {
    if (pool.coins) {
      Object.keys(pool.coins).forEach((coinType) => coinSet.add(coinType));
    }
  });
  topPoolCoinsCache = Array.from(coinSet);
  console.log("Updated topPoolCoinsCache:", topPoolCoinsCache);
}

// Background job: update a batch every 10 seconds
function startBatchUpdater() {
  setInterval(updateNextBatch, 10000);
}

// -----------------------------
// Existing endpoints below
// -----------------------------

// Endpoint: Return supported coins from the SDK
app.get("/api/supportedCoins", async (req, res) => {
  try {
    const router = afSdk.Router();
    const supportedCoins = await router.getSupportedCoins();
    console.log("Supported coins:", supportedCoins);
    res.json({ supportedCoins });
  } catch (error) {
    console.error("Error fetching supported coins:", error);
    res.status(500).json({
      error: "Failed to fetch supported coins",
      details: error.message,
    });
  }
});

// Endpoint: Return top pool coin types (from our cache)
app.get("/api/topPoolCoins", (req, res) => {
  res.json({ topPoolCoins: topPoolCoinsCache });
});

// Endpoint: Fetch a trade route (quote)
app.post("/api/quote", async (req, res) => {
  const { coinInType, coinOutType, coinInAmount } = req.body;
  if (!coinInType || !coinOutType || !coinInAmount) {
    return res.status(400).json({ error: "Missing required parameters" });
  }
  try {
    const router = afSdk.Router();
    const coin = afSdk.Coin();
    // Check that both coin types are supported
    const supportedCoins = await router.getSupportedCoins();
    if (
      !supportedCoins.includes(coinInType) ||
      !supportedCoins.includes(coinOutType)
    ) {
      return res.status(400).json({
        error: "Unsupported coin types",
        details: {
          coinInSupported: supportedCoins.includes(coinInType),
          coinOutSupported: supportedCoins.includes(coinOutType),
        },
      });
    }
    // Get decimals for coins
    const decimalsMap = await coin.getCoinsToDecimals({
      coins: [coinInType, coinOutType],
    });
    const inDecimals = decimalsMap[coinInType] || 9;
    const outDecimals = decimalsMap[coinOutType] || 9;
    // Convert coinInAmount string to BigInt (handle decimals)
    let formattedCoinInAmount;
    if (typeof coinInAmount === "string" && coinInAmount.includes(".")) {
      const parts = coinInAmount.split(".");
      const wholePart = parts[0];
      const fractionalPart = parts[1]
        .padEnd(inDecimals, "0")
        .substring(0, inDecimals);
      formattedCoinInAmount = BigInt(wholePart + fractionalPart);
      console.log(
        `Converted decimal input ${coinInAmount} to ${formattedCoinInAmount} base units`
      );
    } else {
      formattedCoinInAmount = BigInt(coinInAmount);
      console.log(
        `Using raw input amount: ${formattedCoinInAmount} base units`
      );
    }
    console.log(
      `Fetching route for: ${JSON.stringify({
        coinInType,
        coinOutType,
        coinInAmount: formattedCoinInAmount.toString(),
        inDecimals,
        outDecimals,
      })}`
    );
    // Retry logic for fetching trade route
    const MAX_RETRIES = 3;
    let retries = 0;
    let completeRoute = null;
    let lastError = null;
    while (retries < MAX_RETRIES && !completeRoute) {
      try {
        completeRoute = await router.getCompleteTradeRouteGivenAmountIn({
          coinInType,
          coinOutType,
          coinInAmount: formattedCoinInAmount,
        });
      } catch (error) {
        lastError = error;
        retries++;
        console.log(`Retry attempt ${retries} after error: ${error.message}`);
        if (retries < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
    if (!completeRoute) {
      console.error("Failed after max retries:", lastError);
      throw lastError || new Error("Failed to get trade route");
    }
    console.log(`Route received with keys: ${Object.keys(completeRoute)}`);
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
    const routeId = crypto.randomUUID();
    routeCache[routeId] = { route: completeRoute, timestamp: Date.now() };
    const outputAmount = coin.balanceWithDecimals(
      completeRoute.coinOut.amount,
      outDecimals
    );
    return res.json({
      routeId,
      coinIn: {
        type: completeRoute.coinIn.coinType,
        amount: completeRoute.coinIn.amount.toString(),
        formattedAmount: coin
          .balanceWithDecimals(completeRoute.coinIn.amount, inDecimals)
          .toString(),
      },
      coinOut: {
        type: completeRoute.coinOut.coinType,
        amount: completeRoute.coinOut.amount.toString(),
        formatted: outputAmount.toString(),
      },
      spotPrice: completeRoute.spotPrice,
      priceImpact: completeRoute.priceImpact || 0,
      steps: completeRoute.steps.length,
    });
  } catch (error) {
    console.error("Quote error:", error);
    return res
      .status(500)
      .json({ error: "Failed to get quote", details: error.message });
  }
});

// Endpoint: Build a transaction using a cached trade route
app.post("/api/transaction", async (req, res) => {
  const { walletAddress, routeId, slippage } = req.body;
  if (!walletAddress || !routeId || slippage === undefined) {
    return res.status(400).json({ error: "Missing required parameters" });
  }
  try {
    const cached = routeCache[routeId];
    if (!cached) {
      return res.status(400).json({ error: "Invalid routeId" });
    }
    const completeRoute = cached.route;
    const router = afSdk.Router();
    const transaction = await router.getTransactionForCompleteTradeRoute({
      walletAddress,
      completeRoute,
      slippage,
      // isSponsoredTx: false, // Uncomment if using sponsored transactions
    });
    return res.json({ transaction });
  } catch (error) {
    console.error("Transaction error:", error);
    return res
      .status(500)
      .json({ error: "Failed to build transaction", details: error.message });
  }
});

// -----------------------------
// Start the server and background jobs
// -----------------------------
const PORT = process.env.PORT || 3001;
initSdk().then(async () => {
  await initializePools();
  startBatchUpdater(); // Begin updating pool volumes in batches
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
