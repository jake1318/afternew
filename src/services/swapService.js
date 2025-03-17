const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001/api";

export const getQuote = async (coinInType, coinOutType, amount) => {
  try {
    const response = await fetch(`${API_URL}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coinInType,
        coinOutType,
        coinInAmount: amount.toString(),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to get quote");
    }

    return await response.json();
  } catch (error) {
    console.error("Quote error:", error);
    throw error;
  }
};

export const buildTransaction = async (walletAddress, routeId, slippage) => {
  try {
    const response = await fetch(`${API_URL}/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress,
        routeId,
        slippage,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to build transaction");
    }

    return await response.json();
  } catch (error) {
    console.error("Transaction building error:", error);
    throw error;
  }
};

export const getSupportedCoins = async () => {
  try {
    const response = await fetch(`${API_URL}/coins`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to get coins");
    }

    return await response.json();
  } catch (error) {
    console.error("Get coins error:", error);
    throw error;
  }
};

export const getCoinPrices = async (coins) => {
  try {
    const coinParam = coins.join(",");
    const response = await fetch(`${API_URL}/prices?coins=${coinParam}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to get prices");
    }

    return await response.json();
  } catch (error) {
    console.error("Get prices error:", error);
    throw error;
  }
};
