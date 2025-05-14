import React from 'react';
import { ListGroup } from 'react-bootstrap';
import { type Offer as OfferDetailsType } from '../offer/_helpers'; // Assuming Offer type will be here

// Define a more specific Offer type for this component if needed, or use the shared one
// For now, using a relative path, adjust if Offer type is centralized later

interface OfferInfoDisplayProps {
  offer: OfferDetailsType | null;
  getStatusText: (status: number) => string;
  isCurrentUserOfferCreator: boolean;
  isCurrentUserTaker: boolean;
}

const OfferInfoDisplay: React.FC<OfferInfoDisplayProps> = ({ 
  offer, 
  getStatusText, 
  isCurrentUserOfferCreator, 
  isCurrentUserTaker 
}) => {
  if (!offer) {
    return <p>No offer data to display.</p>;
  }

  return (
    <ListGroup variant="flush">
      <ListGroup.Item><strong>Creator TON Address:</strong> {offer.creator_ton_address}</ListGroup.Item>
      <ListGroup.Item><strong>Creator Stellar Address:</strong> {offer.creator_stellar_address}</ListGroup.Item>
      <hr />
      <ListGroup.Item><strong>Taker TON Address:</strong> {offer.taker_ton_address || 'N/A'}</ListGroup.Item>
      <ListGroup.Item><strong>Taker Stellar Address:</strong> {offer.taker_stellar_address || 'N/A'}</ListGroup.Item>
      <hr />
      <ListGroup.Item><strong>Offering:</strong> {offer.amountfrom} {offer.fromtoken || 'N/A'} (from <strong>{offer.networkfrom}</strong>)</ListGroup.Item>
      <ListGroup.Item><strong>Requesting:</strong> {offer.amountto} {offer.totoken || 'N/A'} (to receive on <strong>{offer.networkto}</strong>)</ListGroup.Item>
      
      <ListGroup.Item><strong>Status:</strong> {getStatusText(offer.status)}</ListGroup.Item>
      <ListGroup.Item><strong>Started At:</strong> {new Date(offer.startedat).toLocaleString()}</ListGroup.Item>
      {offer.fromtoken && <ListGroup.Item><strong>From Token (Master/Asset):</strong> {offer.fromtoken}</ListGroup.Item>}
      {offer.totoken && <ListGroup.Item><strong>To Token (Master/Asset):</strong> {offer.totoken}</ListGroup.Item>}
      
      {offer.privatekey && (isCurrentUserOfferCreator || isCurrentUserTaker) && 
        <ListGroup.Item style={{color: 'orange'}}><strong>Secret (Keep Safe!):</strong> {offer.privatekey}</ListGroup.Item>}
      
      {offer.ton_htlc_address_user_a && <ListGroup.Item><strong>Creator's TON HTLC:</strong> {offer.ton_htlc_address_user_a}</ListGroup.Item>}
      {offer.stellar_htlc_address_user_a && <ListGroup.Item><strong>Creator's Stellar HTLC:</strong> {offer.stellar_htlc_address_user_a}</ListGroup.Item>}
      {offer.ton_htlc_address_user_b && <ListGroup.Item><strong>Taker's TON HTLC:</strong> {offer.ton_htlc_address_user_b}</ListGroup.Item>}
      {offer.stellar_htlc_address_user_b && <ListGroup.Item><strong>Taker's Stellar HTLC:</strong> {offer.stellar_htlc_address_user_b}</ListGroup.Item>}
    </ListGroup>
  );
};

export default OfferInfoDisplay;
