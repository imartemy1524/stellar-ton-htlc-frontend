import React, { useState, useEffect } from 'react';
import { Form, Button, Container, Row, Col, Alert } from 'react-bootstrap';
import { useWallet } from '../../contexts/WalletContext'; // Import useWallet

interface OfferFormData {
  amountFrom: string;
  networkFrom: 'TON' | 'Stellar';
  networkTo: 'TON' | 'Stellar';
  fromToken: string; 
  toToken: string;   
}

const PREDEFINED_TOKENS = {
  TON: [
    { symbol: 'MyTONJetton', address: 'kQAp_H-fVRrcAhNS7LaXGQ4GsP_yBQT98t0kwNohtaUjLg7r' },
  ],
  Stellar: [
    { symbol: 'MyStellarToken', address: 'CAUZ75CBHKSJDGJQQEGQXMZIQ32ZWOIO5T47GXLBC6NTYG7SQXH5ML7M' },
  ],
};

const CreateOfferPage: React.FC = () => {
  const { tonAddress, stellarPublicKey } = useWallet(); // Get connected wallet addresses

  const [formData, setFormData] = useState<OfferFormData>({
    amountFrom: '',
    networkFrom: 'TON',
    networkTo: 'Stellar',
    fromToken: PREDEFINED_TOKENS.TON[0]?.address || '', 
    toToken: PREDEFINED_TOKENS.Stellar[0]?.address || '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const currentFromTokenInfo = PREDEFINED_TOKENS[formData.networkFrom]?.find(t => t.address === formData.fromToken);
    if (!currentFromTokenInfo && PREDEFINED_TOKENS[formData.networkFrom]?.[0]) {
      setFormData(prev => ({ ...prev, fromToken: PREDEFINED_TOKENS[formData.networkFrom][0].address }));
    }
  }, [formData.networkFrom, formData.fromToken]);

  useEffect(() => {
    const currentToTokenInfo = PREDEFINED_TOKENS[formData.networkTo]?.find(t => t.address === formData.toToken);
    if (!currentToTokenInfo && PREDEFINED_TOKENS[formData.networkTo]?.[0]) {
      setFormData(prev => ({ ...prev, toToken: PREDEFINED_TOKENS[formData.networkTo][0].address }));
    }
  }, [formData.networkTo, formData.toToken]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };
  
  const handleTokenChange = (e: React.ChangeEvent<HTMLSelectElement>, field: 'fromToken' | 'toToken') => {
    const address = e.target.value;
    setFormData(prev => ({
        ...prev,
        [field]: address
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!tonAddress || !stellarPublicKey) {
      setError('Both TON and Stellar wallets must be connected to create an offer.');
      return;
    }

    if (formData.networkFrom === formData.networkTo) {
      setError('Network From and Network To cannot be the same.');
      return;
    }
    if (!formData.amountFrom || parseFloat(formData.amountFrom) <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    if (!formData.fromToken.trim() || !formData.toToken.trim()) {
      setError('Please specify both From Token and To Token symbols/addresses.');
      return;
    }

    // Determine amountTo, possibly via an oracle or another input - MOCK for now
    const mockAmountTo = parseFloat(formData.amountFrom) * 0.98; 

    try {
      const response = await fetch('http://localhost:3001/api/offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amountfrom: parseFloat(formData.amountFrom),
          amountto: mockAmountTo, 
          networkfrom: formData.networkFrom,
          networkto: formData.networkTo,
          fromtoken: formData.fromToken.trim(), 
          totoken: formData.toToken.trim(),
          creator_ton_address: tonAddress, // Added
          creator_stellar_address: stellarPublicKey, // Added
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create offer');
      }

      setSuccess(`Offer created successfully! Offer ID: ${result.offerId}`);
      setFormData({
        amountFrom: '',
        networkFrom: 'TON',
        networkTo: 'Stellar',
        fromToken: PREDEFINED_TOKENS.TON[0]?.address || '', 
        toToken: PREDEFINED_TOKENS.Stellar[0]?.address || '',
      }); 
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    }
  };

  const renderTokenOptions = (network: 'TON' | 'Stellar') => {
    return PREDEFINED_TOKENS[network]?.map(token => (
      <option key={token.address} value={token.address}>
        {token.symbol} ({token.address.substring(0, 6)}...{token.address.substring(token.address.length - 4)})
      </option>
    ));
  };

  return (
    <Container className="mt-3">
      <h2>Create a New Swap Offer</h2>
      {!tonAddress || !stellarPublicKey ? (
        <Alert variant="warning">Please connect both your TON and Stellar wallets to create an offer.</Alert>
      ) : (
        <p>Specify the details of the tokens you want to swap.</p>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}
      <Form onSubmit={handleSubmit}>
        <Row>
          <Col md={6}>
            <Form.Group className="mb-3" controlId="networkFrom">
              <Form.Label>From Network</Form.Label>
              <Form.Select name="networkFrom" value={formData.networkFrom} onChange={handleChange} disabled={!tonAddress || !stellarPublicKey}>
                <option value="TON">TON</option>
                <option value="Stellar">Stellar</option>
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3" controlId="networkTo">
              <Form.Label>To Network</Form.Label>
              <Form.Select name="networkTo" value={formData.networkTo} onChange={handleChange} disabled={!tonAddress || !stellarPublicKey}>
                <option value="Stellar">Stellar</option>
                <option value="TON">TON</option>
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>

        <Row>
          <Col md={6}>
            <Form.Group className="mb-3" controlId="fromTokenSelect">
              <Form.Label>From Token (on {formData.networkFrom})</Form.Label>
              <Form.Select name="fromToken" value={formData.fromToken} onChange={(e) => handleTokenChange(e, 'fromToken')} disabled={!tonAddress || !stellarPublicKey}>
                {renderTokenOptions(formData.networkFrom)}
                <option value="">Other (Specify Address Below)</option> 
              </Form.Select>
            </Form.Group>
            {formData.fromToken === '' && (
                <Form.Group className="mb-3" controlId="fromTokenManual">
                    <Form.Control
                        type="text"
                        name="fromTokenManualInput"
                        placeholder="Enter From Token Address manually"
                        onChange={(e) => setFormData(prev => ({...prev, fromToken: e.target.value}))}
                        disabled={!tonAddress || !stellarPublicKey}
                    />
                </Form.Group>
            )}
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3" controlId="toTokenSelect">
              <Form.Label>To Token (on {formData.networkTo})</Form.Label>
              <Form.Select name="toToken" value={formData.toToken} onChange={(e) => handleTokenChange(e, 'toToken')} disabled={!tonAddress || !stellarPublicKey}>
                {renderTokenOptions(formData.networkTo)}
                <option value="">Other (Specify Address Below)</option>
              </Form.Select>
            </Form.Group>
            {formData.toToken === '' && (
                <Form.Group className="mb-3" controlId="toTokenManual">
                    <Form.Control
                        type="text"
                        name="toTokenManualInput"
                        placeholder="Enter To Token Address manually"
                        onChange={(e) => setFormData(prev => ({...prev, toToken: e.target.value}))}
                        disabled={!tonAddress || !stellarPublicKey}
                    />
                </Form.Group>
            )}
          </Col>
        </Row>

        <Form.Group className="mb-3" controlId="amountFrom">
          <Form.Label>
            Amount of {PREDEFINED_TOKENS[formData.networkFrom]?.find(t => t.address === formData.fromToken)?.symbol || formData.fromToken || 'token'} to Swap
          </Form.Label>
          <Form.Control
            type="number"
            name="amountFrom"
            value={formData.amountFrom}
            onChange={handleChange}
            placeholder="e.g., 1000"
            min="0"
            disabled={!tonAddress || !stellarPublicKey}
          />
        </Form.Group>

        <Button variant="primary" type="submit" disabled={!tonAddress || !stellarPublicKey}>
          Create Offer
        </Button>
      </Form>
    </Container>
  );
};

export default CreateOfferPage;
