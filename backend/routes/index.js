const express = require("express");
const router = express.Router();
const swapController = require("../controllers/swapController");

// Swap routes
router.post("/quote", swapController.getQuote);
router.post("/transaction", swapController.buildTransaction);
router.get("/coins", swapController.getSupportedCoins);
router.get("/prices", swapController.getCoinPrices);

module.exports = router;
