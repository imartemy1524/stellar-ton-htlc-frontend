import React, { useState, useEffect } from "react";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";
import { isConnected, getPublicKey, setAllowed } from "@stellar/freighter-api";
import { Button, Alert, Card, Row, Col } from "react-bootstrap"; // Assuming Row and Col are correctly imported
import { useWallet } from "../../contexts/WalletContext"; // Import useWallet

const walletSectionStyle: React.CSSProperties = {
  marginBottom: "2rem",
  padding: "1rem",
  border: "1px solid #ddd",
  borderRadius: "0.25rem",
};

const HomePage: React.FC = () => {
  const { tonAddress, stellarPublicKey, setTonAddress, setStellarPublicKey } =
    useWallet();
  const connectedTonWallet = useTonWallet();

  const [stellarError, setStellarError] = useState<string | null>(null);

  // Effect to update context from TonConnect wallet changes
  useEffect(() => {
    if (connectedTonWallet) {
      setTonAddress(connectedTonWallet.account.address);
    } else {
      setTonAddress(null);
    }
  }, [connectedTonWallet, setTonAddress]);

  // Effect to check initial Freighter connection and update context
  useEffect(() => {
    const checkStellarConnection = async () => {
      try {
        if (await isConnected()) {
          const publicKey = await getPublicKey();
          setStellarPublicKey(publicKey);
        }
      } catch (e) {
        console.error("Error checking Stellar connection:", e);
        const errorMessage =
          e instanceof Error
            ? e.message
            : "Could not check Freighter connection initially.";
        setStellarError(errorMessage);
      }
    };
    checkStellarConnection();
  }, [setStellarPublicKey]);

  const connectStellarWallet = async () => {
    setStellarError(null);
    try {
      // @ts-expect-error tftfttf
      if (typeof window.freighter === "undefined") {
        setStellarError("Freighter is not installed.");
        return;
      }
      await setAllowed();
      if (await isConnected()) {
        const publicKey = await getPublicKey();
        setStellarPublicKey(publicKey);
      } else {
        setStellarError("Connection to Freighter was not successful.");
      }
    } catch (e) {
      console.error("Freighter connection error:", e);
      const errorMessage =
        e instanceof Error
          ? e.message
          : "An error occurred connecting to Freighter.";
      setStellarError(errorMessage);
    }
  };

  const disconnectStellarWallet = () => {
    setStellarPublicKey(null);
    setStellarError(null);
    // No explicit disconnect in Freighter API, user manages through extension
    alert("To fully manage Freighter permissions, please use the extension.");
  };

  return (
    <div className="container mt-3">
      <h2>Welcome to HTLC Swap</h2>
      <p>Please connect your wallets to continue.</p>

      {stellarError && (
        <Alert variant="danger" className="mt-2">
          {stellarError}
        </Alert>
      )}

      <Row className="mt-4">
        <Col md={6}>
          <Card style={walletSectionStyle}>
            <Card.Body>
              <Card.Title>TON Wallet</Card.Title>
              <TonConnectButton />
              {tonAddress && (
                <Alert variant="success" className="mt-2">
                  TON Wallet Connected:{" "}
                  <small>
                    {tonAddress.substring(0, 6)}...
                    {tonAddress.substring(tonAddress.length - 4)}
                  </small>
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card style={walletSectionStyle}>
            <Card.Body>
              <Card.Title>Stellar Wallet (Freighter)</Card.Title>
              {!stellarPublicKey ? (
                <Button variant="primary" onClick={connectStellarWallet}>
                  Connect Freighter
                </Button>
              ) : (
                <>
                  <Alert variant="success">
                    Freighter Connected:{" "}
                    <small>
                      {stellarPublicKey.substring(0, 8)}...
                      {stellarPublicKey.substring(stellarPublicKey.length - 8)}
                    </small>
                  </Alert>
                  <Button
                    variant="outline-secondary"
                    onClick={disconnectStellarWallet}
                    size="sm"
                  >
                    Disconnect Freighter (UI)
                  </Button>
                </>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <div className="mt-4">
        <h4>Current Context State:</h4>
        <p>TON Address: {tonAddress || "Not Connected"}</p>
        <p>Stellar Public Key: {stellarPublicKey || "Not Connected"}</p>
      </div>
    </div>
  );
};

export default HomePage;
