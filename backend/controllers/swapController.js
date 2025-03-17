const aftermathService = require("../services/aftermathService");

exports.getQuote = async (req, res) => {
  try {
    const { coinInType, coinOutType, coinInAmount } = req.body;

    // Validate required parameters
    if (!coinInType || !coinOutType || !coinInAmount) {
      return res.status(400).json({
        error: "Missing required parameters",
        details: "coinInType, coinOutType, and coinInAmount are required",
      });
    }

    // Parse incoming amount string
    let parsedAmount;
    try {
      parsedAmount = coinInAmount;
    } catch (error) {
      return res.status(400).json({
        error: "Invalid amount format",
        details: "coinInAmount must be a valid number",
      });
    }

    const quote = await aftermathService.getQuote(
      coinInType,
      coinOutType,
      parsedAmount
    );
    res.json(quote);
  } catch (error) {
    console.error("Quote error:", error);
    res.status(500).json({
      error: "Failed to get quote",
      details: error.message,
    });
  }
};

exports.buildTransaction = async (req, res) => {
  try {
    const { walletAddress, routeId, slippage } = req.body;

    // Validate required parameters
    if (!walletAddress || !routeId) {
      return res.status(400).json({
        error: "Missing required parameters",
        details: "walletAddress and routeId are required",
      });
    }

    // Default slippage if not provided
    const slippageValue = slippage || 1.0;

    const transaction = await aftermathService.buildTransaction(
      walletAddress,
      routeId,
      slippageValue
    );
    res.json(transaction);
  } catch (error) {
    console.error("Transaction building error:", error);
    res.status(500).json({
      error: "Failed to build transaction",
      details: error.message,
    });
  }
};

exports.getSupportedCoins = async (req, res) => {
  try {
    const coins = await aftermathService.getSupportedCoins();
    res.json(coins);
  } catch (error) {
    console.error("Error getting supported coins:", error);
    res.status(500).json({
      error: "Failed to get supported coins",
      details: error.message,
    });
  }
};

exports.getCoinPrices = async (req, res) => {
  try {
    const { coins } = req.query;

    if (!coins) {
      return res.status(400).json({
        error: "Missing required parameter",
        details: "coins query parameter is required",
      });
    }

    let coinList;
    try {
      // Parse the coins parameter if it's a JSON string
      coinList = typeof coins === "string" ? coins.split(",") : coins;
    } catch (error) {
      return res.status(400).json({
        error: "Invalid coins format",
        details: "coins must be a comma-separated list or array of coin types",
      });
    }

    const prices = await aftermathService.getCoinPrices(coinList);
    res.json(prices);
  } catch (error) {
    console.error("Error getting coin prices:", error);
    res.status(500).json({
      error: "Failed to get coin prices",
      details: error.message,
    });
  }
};
