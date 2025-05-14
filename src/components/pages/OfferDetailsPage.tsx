import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Card, Button, Spinner, Alert, Form, ListGroup } from 'react-bootstrap';

interface Offer {
  id: number;
  fromuser: string;
  touser?: string | null;
  status: number;
  walletfrom: string;
  walletto?: string | null;
  amountfrom: number;
  amountto: number;
  networkfrom: string;
  networkto: string;
  fromtoken?: string | null; // Added
  totoken?: string | null;   // Added
  startedat: string;
  privatekey?: string | null; // Only relevant for specific interactions, be careful with exposure
}

const OfferDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  // const [privateKeyInput, setPrivateKeyInput] = useState<string>(''); // Not currently used

  useEffect(() => {
    const fetchOfferDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`http://localhost:3001/api/offers/${id}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch offer details');
        }
        const data = await response.json();
        setOffer(data.data || null);
      } catch (err: any) {
        setError(err.message || 'An error occurred.');
        setOffer(null);
      }
      setLoading(false);
    };

    if (id) {
      fetchOfferDetails();
    }
  }, [id]);

  const getStatusText = (status: number): string => {
    switch (status) {
      case 0: return 'Open - Ready to be accepted';
      case 1: return 'Pending - User B (Taker) deployed HTLC. User A (Creator) needs to deploy.';
      case 2: return 'Pending - Both HTLCs deployed. Ready for claiming.';
      case 3: return 'Claimed by User A. User B can now claim.';
      case 4: return 'Closed - Claimed by User B. Swap complete.';
      case -1: return 'Expired/Cancelled - Funds can be reclaimed.';
      default: return 'Unknown Status';
    }
  };

  const handleAcceptOffer = async () => {
    setActionError(null);
    setActionSuccess(null);
    if (!offer) return;

    // TODO: Get current user's details (touser, walletto)
    const currentUserAddress = "mockUserStellarAddress"; // Replace with actual connected wallet data
    const currentUserWallet = "mockUserStellarWallet"; // Replace with actual connected wallet data

    const generatedPrivateKey = "ultra-secret-key-" + Math.random().toString(36).substring(2);
    alert(`Generated Private Key (save this securely!): ${generatedPrivateKey}\nThis should be generated and saved locally by the user.`);
    alert("HTLC Deployment on your network (Stellar or TON) - To be implemented by you.");

    try {
      const response = await fetch(`http://localhost:3001/api/offers/${id}/accept`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          touser: currentUserAddress,
          walletto: currentUserWallet,
          privatekey: generatedPrivateKey, 
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to accept offer');
      setActionSuccess(result.message);
      setOffer(prev => prev ? { ...prev, status: 1, touser: currentUserAddress, walletto: currentUserWallet, privatekey: generatedPrivateKey } : null);
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleDeployUserAHTLC = async () => {
    setActionError(null);
    setActionSuccess(null);
    if (!offer || !offer.privatekey) {
        setActionError('Private key from User B is missing or offer is invalid.');
        return;
    }
    alert(`User A: Deploying HTLC on your network (TON or Stellar) using User B's private key: ${offer.privatekey}\nThis part is for you to implement.`);

    try {
        const response = await fetch(`http://localhost:3001/api/offers/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 2 }), 
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to update status for User A HTLC deployment');
        setActionSuccess(result.message);
        setOffer(prev => prev ? { ...prev, status: 2 } : null);
    } catch (err: any) {
        setActionError(err.message);
    }
  };

  const handleClaimFunds = async (userType: 'A' | 'B') => {
    setActionError(null);
    setActionSuccess(null);
    if (!offer || !offer.privatekey) {
      setActionError('Offer details or private key are missing.');
      return;
    }

    alert(`User ${userType}: Claiming funds on your network using private key: ${offer.privatekey}\nThis part is for you to implement.`);

    const newStatus = userType === 'A' ? 3 : 4;
    try {
      const response = await fetch(`http://localhost:3001/api/offers/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to claim funds');
      setActionSuccess(result.message);
      setOffer(prev => prev ? { ...prev, status: newStatus } : null);
    } catch (err: any) {
      setActionError(err.message);
    }
  };
  
  const handleRefund = async () => {
    setActionError(null);
    setActionSuccess(null);
    if (!offer) return;

    alert("Refunding logic to be implemented by you for both networks.");

    try {
      const response = await fetch(`http://localhost:3001/api/offers/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: -1 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to mark offer as refunded/expired');
      setActionSuccess(result.message);
      setOffer(prev => prev ? { ...prev, status: -1 } : null);
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  if (loading) {
    return <Container className="mt-3 text-center"><Spinner animation="border" /><p>Loading offer details...</p></Container>;
  }
  if (error) {
    return <Container className="mt-3"><Alert variant="danger">{error} <Button onClick={() => navigate('/offers')} variant="link">Back to offers</Button></Alert></Container>;
  }
  if (!offer) {
    return <Container className="mt-3"><Alert variant="warning">Offer not found. <Button onClick={() => navigate('/offers')} variant="link">Back to offers</Button></Alert></Container>;
  }

  return (
    <Container className="mt-3">
      <Card>
        <Card.Header as="h5">Offer ID: {offer.id} - {getStatusText(offer.status)}</Card.Header>
        <Card.Body>
          <ListGroup variant="flush">
            <ListGroup.Item><strong>Creator:</strong> {offer.fromuser}</ListGroup.Item>
            <ListGroup.Item><strong>Taker:</strong> {offer.touser || 'N/A'}</ListGroup.Item>
            <ListGroup.Item>
              <strong>Offering:</strong> {offer.amountfrom} {offer.fromtoken || 'Unknown Token'} ({offer.networkfrom})
            </ListGroup.Item>
            <ListGroup.Item>
              <strong>Requesting:</strong> {offer.amountto} {offer.totoken || 'Unknown Token'} ({offer.networkto})
            </ListGroup.Item>
            <ListGroup.Item><strong>Status:</strong> {getStatusText(offer.status)}</ListGroup.Item>
            <ListGroup.Item><strong>Started At:</strong> {new Date(offer.startedat).toLocaleString()}</ListGroup.Item>
            {offer.walletfrom && <ListGroup.Item><strong>Creator Wallet:</strong> {offer.walletfrom}</ListGroup.Item>}
            {offer.walletto && <ListGroup.Item><strong>Taker Wallet:</strong> {offer.walletto}</ListGroup.Item>}
            {offer.fromtoken && <ListGroup.Item><strong>From Token Address:</strong> {offer.fromtoken}</ListGroup.Item>}
            {offer.totoken && <ListGroup.Item><strong>To Token Address:</strong> {offer.totoken}</ListGroup.Item>}
          </ListGroup>

          {actionError && <Alert variant="danger" className="mt-3">{actionError}</Alert>}
          {actionSuccess && <Alert variant="success" className="mt-3">{actionSuccess}</Alert>}

          <div className="mt-3 d-grid gap-2">
            {offer.status === 0 && (
              <Button variant="success" onClick={handleAcceptOffer}>
                Accept Offer & Deploy HTLC (User B)
              </Button>
            )}

            {offer.status === 1 && 
              <Button variant="primary" onClick={handleDeployUserAHTLC}>
                Deploy HTLC with Secret (User A)
              </Button>
            }

            {offer.status === 2 && 
                <Button variant="warning" onClick={() => handleClaimFunds('A') } className="mt-2">
                    Claim Funds (User A)
                </Button>
            }
            {offer.status === 3 && 
                <Button variant="success" onClick={() => handleClaimFunds('B')} className="mt-2">
                    Claim Funds (User B)
                </Button>
            }
            
            {(offer.status >= 0 && offer.status < 4) && (
                <Button variant="danger" onClick={handleRefund} className="mt-2">
                    Cancel & Refund (If Applicable)
                </Button>
            )}
             {offer.status === -1 && (
                <Alert variant='info' className="mt-2">This offer is cancelled/expired. Funds should be reclaimed if applicable.</Alert>
            )}
          </div>

        </Card.Body>
        <Card.Footer>
            <Button variant="secondary" onClick={() => navigate('/offers')}>
                Back to Offer List
            </Button>
        </Card.Footer>
      </Card>
    </Container>
  );
};

export default OfferDetailsPage;
