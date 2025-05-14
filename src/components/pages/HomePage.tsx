import React, { useState, useEffect } from 'react';
import { TonConnectButton, useTonConnectUI } from '@tonconnect/ui-react';
import { isConnected, getPublicKey, setAllowed } from "@stellar/freighter-api";
import { Button, Alert, Card } from 'react-bootstrap';

// Basic styling for the button container, you can move this to a CSS file
const walletSectionStyle: React.CSSProperties = {
  marginBottom: '2rem',
  padding: '1rem',
  border: '1px solid #ddd',
  borderRadius: '0.25rem'
};

const HomePage: React.FC = () => {
  const [tonConnectUI] = useTonConnectUI(); // Get the TonConnectUI instance
  const [stellarPublicKey, setStellarPublicKey] = useState<string | null>(null);
  const [stellarError, setStellarError] = useState<string | null>(null);

  // Check Stellar connection status on component mount
  useEffect(() => {
    const checkStellarConnection = async () => {
      try {
        if (await isConnected()) {
          const publicKey = await getPublicKey();
          setStellarPublicKey(publicKey);
        }
      } catch (e: any) {
        console.error("Error checking Stellar connection:", e);
        setStellarError("Could not check Freighter connection. Make sure Freighter is installed and enabled.");
      }
    };
    checkStellarConnection();
  }, []);

  const connectStellarWallet = async () => {
    setStellarError(null);
    try {
      // Check if Freighter is available
      if (typeof window.freighter === 'undefined') {
        setStellarError("Freighter is not installed. Please install the Freighter browser extension.");
        return;
      }

      // Request access. This will prompt the user if not already allowed.
      // setAllowed is useful to "wake up" Freighter if it's installed but not active on the page.
      await setAllowed(); 
      
      if (await isConnected()) {
        const publicKey = await getPublicKey();
        setStellarPublicKey(publicKey);
      } else {
        // This case might not be reached if setAllowed() successfully connects, 
        // but it's good for completeness.
        setStellarError("Connection to Freighter was not successful. Please try again.");
      }
    } catch (e: any) {
      console.error("Freighter connection error:", e);
      setStellarError(e.message || "An error occurred while connecting to Freighter.");
    }
  };

  const disconnectStellarWallet = () => {
    // Freighter doesn't have an explicit programmatic disconnect API that revokes permissions.
    // Users manage connections through the extension itself.
    // We can clear our local state to reflect a "disconnected" UI state.
    setStellarPublicKey(null);
    setStellarError(null);
    // You might want to also call setAllowed() again to see if it prompts or if it's truly disconnected by the user.
    // For now, simply clearing state is sufficient for the UI.
    alert("To fully disconnect or manage permissions, please use the Freighter extension.")
  };

  return (
    <div className="container mt-3">
      <h2>Welcome to HTLC Swap</h2>
      <p>Please connect your wallets to continue.</p>

      {stellarError && <Alert variant="danger" className="mt-2">{stellarError}</Alert>}

      <Row className="mt-4">
        <Col md={6}>
          <Card style={walletSectionStyle}>
            <Card.Body>
              <Card.Title>TON Wallet</Card.Title>
              <Card.Text>
                Connect your TON wallet using Tonkeeper or other compatible wallets.
              </Card.Text>
              <TonConnectButton />
              {tonConnectUI.connected && (
                <Alert variant="success" className="mt-2">
                  TON Wallet Connected!
                  {/* You can access wallet info via useTonWallet() hook if needed here */}
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
                <>
                  <Card.Text>
                    Connect your Stellar wallet using the Freighter browser extension.
                  </Card.Text>
                  <Button variant="primary" onClick={connectStellarWallet}>
                    Connect Freighter
                  </Button>
                </>
              ) : (
                <>
                  <Alert variant="success">
                    Freighter Connected!
                    <br />
                    Public Key: <strong>{stellarPublicKey.substring(0, 8)}...{stellarPublicKey.substring(stellarPublicKey.length - 8)}</strong>
                  </Alert>
                  <Button variant="outline-secondary" onClick={disconnectStellarWallet} size="sm">
                    Disconnect Freighter (UI)
                  </Button>
                </>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* TODO: Global wallet connection status check before proceeding to other app functions */}
    </div>
  );
};

// Dummy Row and Col for structure - in a real app, import from react-bootstrap
const Row: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => <div className={`row ${className}`}>{children}</div>;
const Col: React.FC<{ children: React.ReactNode, md?: number }> = ({ children, md }) => <div className={`col-md-${md}`}>{children}</div>;

export default HomePage;
