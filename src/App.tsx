import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider as SuietWalletProvider } from "@suiet/wallet-kit";
import { WalletProvider } from "./contexts/WalletContext";
import { AftermathProvider } from "./contexts/AftermathContext";
import Navbar from "./components/Navbar/Navbar";
import Footer from "./components/Footer/Footer";
import Home from "./pages/Home/Home";
import Swap from "./pages/Swap/Swap";
import Pools from "./pages/Pools/Pools";
import "./App.scss";
import "@suiet/wallet-kit/style.css"; // Import Suiet wallet kit styles
import "./wallet-kit-overrides.css"; // Import our overrides after the original styles

// Create a client
const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuietWalletProvider>
        <BrowserRouter>
          <WalletProvider>
            <AftermathProvider>
              <div className="app">
                <Navbar />
                <main className="main-content">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/swap" element={<Swap />} />
                    <Route path="/pools" element={<Pools />} />
                  </Routes>
                </main>
                <Footer />
              </div>
            </AftermathProvider>
          </WalletProvider>
        </BrowserRouter>
      </SuietWalletProvider>
    </QueryClientProvider>
  );
}

export default App;
