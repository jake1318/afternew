import React from "react";
import "./Footer.scss";

const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="footer__content">
        <div className="footer__section">
          <h3 className="footer__title">Cerebra Network</h3>
          <p className="footer__description">
            The future of decentralized finance on the Sui blockchain. Trade
            tokens, provide liquidity, and earn rewards with our cutting-edge
            DeFi platform.
          </p>
        </div>

        <div className="footer__section">
          <h3 className="footer__title">Quick Links</h3>
          <ul className="footer__links">
            <li>
              <a href="/">Home</a>
            </li>
            <li>
              <a href="/swap">Swap</a>
            </li>
            <li>
              <a href="/pools">LP Pools</a>
            </li>
          </ul>
        </div>

        <div className="footer__section">
          <h3 className="footer__title">Resources</h3>
          <ul className="footer__links">
            <li>
              <a
                href="https://docs.sui.io/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Sui Docs
              </a>
            </li>
            <li>
              <a
                href="https://aftermath.finance/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Aftermath Finance
              </a>
            </li>
            <li>
              <a
                href="https://suiet.app/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Suiet Wallet
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="footer__bottom">
        <p>
          &copy; {new Date().getFullYear()} Cerebra Network. All rights
          reserved.
        </p>
        <div className="footer__social">
          <a
            href="https://twitter.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Twitter
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            href="https://discord.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Discord
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
