import "./_polyfill"; // Import Buffer polyfill first
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter as Router } from "react-router-dom";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { WalletProvider } from "./contexts/WalletContext"; // Import WalletProvider
import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css";
import App from "./App.tsx";

const manifestUrl =
  import.meta.env.MODE === "development"
    ? "https://gist.githubusercontent.com/imartemy1524/fea1877b4a30d7154dcfacf8b2619659/raw/fd97b37ba3eb3ef0dfd35271de319593dd540150/manifest.json"
    : "https://<YOUR_DEPLOYED_APP_URL>/tonconnect-manifest.json";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <WalletProvider>
        {" "}
        {/* Wrap with WalletProvider */}
        <Router>
          <App />
        </Router>
      </WalletProvider>
    </TonConnectUIProvider>
  </StrictMode>,
);
