import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Table, Button, Alert, Container, Spinner } from "react-bootstrap";
import type { Offer } from "../offer/_helpers";

const OfferListPage: React.FC = () => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOffers = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("http://localhost:3001/api/offers");
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch offers");
        }
        const data = await response.json();
        setOffers(data.data || []);
      } catch (err: unknown) {
        setError(
          (err as { message: string }).message ||
            "An error occurred while fetching offers.",
        );
        setOffers([]);
      }
      setLoading(false);
    };

    fetchOffers();
  }, []);

  const getStatusText = (status: number): string => {
    switch (status) {
      case 0:
        return "Open";
      case 1:
        return "Pending (Taker Accepted)";
      case 2:
        return "Pending (Creator Confirmed)";
      case 3:
        return "Claimed by Creator";
      case 4:
        return "Closed (Claimed by Taker)";
      case -1:
        return "Expired/Cancelled";
      default:
        return "Unknown";
    }
  };

  if (loading) {
    return (
      <Container className="mt-3 text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading offers...</span>
        </Spinner>
        <p>Loading offers...</p>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-3">
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container className="mt-3">
      <h2>Available Swap Offers</h2>
      {offers.length === 0 ? (
        <p>
          No offers available at the moment.{" "}
          <Link to="/create-offer">Create one!</Link>
        </p>
      ) : (
        <Table striped bordered hover responsive className="mt-3">
          <thead>
            <tr>
              <th>ID</th>
              <th>Swap From ({/* Network */})</th>
              <th>Amount</th>
              <th>For Token ({/* Network */})</th>
              <th>Amount</th>
              <th>Creator (TON)</th>
              <th>Creator (Stellar)</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => (
              <tr key={offer.id}>
                <td>{offer.id}</td>
                <td>
                  {offer.fromtoken || "N/A"} ({offer.networkfrom})
                </td>
                <td>{offer.amountfrom}</td>
                <td>
                  {offer.totoken || "N/A"} ({offer.networkto})
                </td>
                <td>{offer.amountto}</td>
                <td>{offer.creator_ton_address.substring(0, 6)}...</td>
                <td>{offer.creator_stellar_address.substring(0, 6)}...</td>
                <td>{getStatusText(offer.status)}</td>
                <td>
                  <Link to={`/offer/${offer.id}`}>
                    <Button variant="info" size="sm">
                      View Details
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Container>
  );
};

export default OfferListPage;
