import { Container, Card, Button, Alert, ListGroup } from "react-bootstrap";
import { useNavigate } from "react-router-dom"; // Added
import { getStatusText, type Offer } from "../offer/_helpers";

export default function OfferDetailsPageHtml({
  offer,
  isCurrentUserOfferCreator,
  handleClaimFundsTON,
  actionSuccess,
  actionError,
  handleDeployUserAHTLC,
  tonWallet,
  isCurrentUserTaker,
  canCurrentUserBeTaker, 
  handleAcceptOfferAndDeploy,
}: {
  offer: Offer;
  isCurrentUserOfferCreator: boolean;
  handleClaimFundsTON: (claimingUserType: "A" | "B") => void; // Updated signature
  actionSuccess?: string | null;
  actionError?: string | null;
  handleDeployUserAHTLC?: () => void;
  tonWallet?: string;
  isCurrentUserTaker?: boolean;
  canCurrentUserBeTaker?: boolean; // Added
  handleAcceptOfferAndDeploy?: () => void;
  // handleRefundTON?: (htlcUserType: "A" | "B") => void; // Removed for now
}) {
  const navigate = useNavigate(); // Initialized
  return (
    <Container className="mt-3">
      <Card>
        <Card.Header as="h5">
          Offer ID: {offer.id} - {getStatusText(offer.status)}
        </Card.Header>
        <Card.Body>
          <ListGroup variant="flush">
            <ListGroup.Item>
              <strong>Creator TON Address:</strong> {offer.creator_ton_address}
            </ListGroup.Item>
            <ListGroup.Item>
              <strong>Creator Stellar Address:</strong>{" "}
              {offer.creator_stellar_address}
            </ListGroup.Item>
            <hr />
            <ListGroup.Item>
              <strong>Taker TON Address:</strong>{" "}
              {offer.taker_ton_address || "N/A"}
            </ListGroup.Item>
            <ListGroup.Item>
              <strong>Taker Stellar Address:</strong>{" "}
              {offer.taker_stellar_address || "N/A"}
            </ListGroup.Item>
            <hr />
            <ListGroup.Item>
              <strong>Offering:</strong> {offer.amountfrom}{" "}
              {offer.fromtoken || "N/A"} (from{" "}
              <strong>{offer.networkfrom}</strong>)
            </ListGroup.Item>
            <ListGroup.Item>
              <strong>Requesting:</strong> {offer.amountto}{" "}
              {offer.totoken || "N/A"} (to receive on{" "}
              <strong>{offer.networkto}</strong>)
            </ListGroup.Item>

            <ListGroup.Item>
              <strong>Status:</strong> {getStatusText(offer.status)}
            </ListGroup.Item>
            <ListGroup.Item>
              <strong>Started At:</strong>{" "}
              {new Date(offer.startedat).toLocaleString()}
            </ListGroup.Item>
            {offer.fromtoken && (
              <ListGroup.Item>
                <strong>From Token (Master/Asset):</strong> {offer.fromtoken}
              </ListGroup.Item>
            )}
            {offer.totoken && (
              <ListGroup.Item>
                <strong>To Token (Master/Asset):</strong> {offer.totoken}
              </ListGroup.Item>
            )}

            {offer.privatekey &&
              (isCurrentUserOfferCreator || isCurrentUserTaker) && (
                <ListGroup.Item style={{ color: "orange" }}>
                  <strong>Secret (Keep Safe!):</strong> {offer.privatekey}
                </ListGroup.Item>
              )}

            {offer.ton_htlc_address_user_a && (
              <ListGroup.Item>
                <strong>Creator's TON HTLC:</strong>{" "}
                {offer.ton_htlc_address_user_a}
              </ListGroup.Item>
            )}
            {offer.stellar_htlc_address_user_a && (
              <ListGroup.Item>
                <strong>Creator's Stellar HTLC:</strong>{" "}
                {offer.stellar_htlc_address_user_a}
              </ListGroup.Item>
            )}
            {offer.ton_htlc_address_user_b && (
              <ListGroup.Item>
                <strong>Taker's TON HTLC:</strong>{" "}
                {offer.ton_htlc_address_user_b}
              </ListGroup.Item>
            )}
            {offer.stellar_htlc_address_user_b && (
              <ListGroup.Item>
                <strong>Taker's Stellar HTLC:</strong>{" "}
                {offer.stellar_htlc_address_user_b}
              </ListGroup.Item>
            )}
          </ListGroup>

          {actionError && (
            <Alert variant="danger" className="mt-3">
              {actionError}
            </Alert>
          )}
          {actionSuccess && (
            <Alert variant="success" className="mt-3">
              {actionSuccess}
            </Alert>
          )}

          <div className="mt-3 d-grid gap-2">
            {offer.status === 0 && canCurrentUserBeTaker && (
              <Button
                variant="success"
                onClick={handleAcceptOfferAndDeploy}
                disabled={!tonWallet && offer.networkto === "TON"}
              >
                Accept & Deploy My HTLC ({offer.networkto})
              </Button>
            )}
            {offer.status === 1 && isCurrentUserOfferCreator && (
              <Button
                variant="primary"
                onClick={handleDeployUserAHTLC}
                disabled={!tonWallet && offer.networkfrom === "TON"}
              >
                Deploy My HTLC ({offer.networkfrom})
              </Button>
            )}
            {offer.status === 2 &&
              isCurrentUserOfferCreator &&
              offer.networkto === "TON" && (
                <Button
                  variant="warning"
                  onClick={() => handleClaimFundsTON("A")}
                  className="mt-2"
                  disabled={!tonWallet || !offer.ton_htlc_address_user_b}
                >
                  Claim from Taker's TON HTLC
                </Button>
              )}
            {offer.status === 3 &&
              isCurrentUserTaker &&
              offer.networkfrom === "TON" && (
                <Button
                  variant="success"
                  onClick={() => handleClaimFundsTON("B")}
                  className="mt-2"
                  disabled={!tonWallet || !offer.ton_htlc_address_user_a}
                >
                  Claim from Creator's TON HTLC
                </Button>
              )}

            {/* Stellar claim placeholders - similar logic needed */}
            {offer.status === 2 &&
              isCurrentUserOfferCreator &&
              offer.networkto === "Stellar" && (
                <Button
                  variant="warning"
                  onClick={() =>
                    alert("User A: Stellar Claim to be implemented")
                  }
                  className="mt-2"
                >
                  Claim (Stellar)
                </Button>
              )}
            {offer.status === 3 &&
              isCurrentUserTaker &&
              offer.networkfrom === "Stellar" && (
                <Button
                  variant="success"
                  onClick={() =>
                    alert("User B: Stellar Claim to be implemented")
                  }
                  className="mt-2"
                >
                  Claim (Stellar)
                </Button>
              )}


            {offer.status === -1 && (
              <Alert variant="info" className="mt-2">
                Offer Cancelled/Expired.
              </Alert>
            )}
          </div>
        </Card.Body>
        <Card.Footer>
          <Button variant="secondary" onClick={() => navigate("/offers")}>
            Back to List
          </Button>
        </Card.Footer>
      </Card>
    </Container>
  );
}
