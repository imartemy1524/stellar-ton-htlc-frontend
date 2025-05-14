import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Container,
  Card,
  Button,
  Spinner,
  Alert,
  ListGroup,
} from "react-bootstrap";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { Address, toNano, Cell, beginCell } from "@ton/core";
import { Buffer } from "buffer";
import {
  HTLCSmartContract,
  CodeTonCell,
  type HTLCSmartContractConfig,
} from "../../wrappers/ton"; // Adjust path

// Helper for SHA256 hash - In a real app, use a robust crypto library and handle errors.
async function sha256(message: string): Promise<Buffer> {
  const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8); // hash the message
  return Buffer.from(hashBuffer); // convert buffer to Buffer
}

function bufferToBigInt(buffer: Buffer): bigint {
  return BigInt("0x" + buffer.toString("hex"));
}

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
  fromtoken?: string | null;
  totoken?: string | null;
  startedat: string;
  privatekey?: string | null; // SECRET PREIMAGE
  ton_htlc_address_user_a?: string | null; // HTLC for User A (creator, if on TON)
  ton_htlc_address_user_b?: string | null; // HTLC for User B (taker, if on TON)
}

const OFFER_EXPIRATION_SECONDS = 3600; // 1 hour
const DEFAULT_GAS_FEE = toNano("0.1"); // Default gas for operations

const OfferDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();

  useEffect(() => {
    const fetchOfferDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`http://localhost:3001/api/offers/${id}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch offer details");
        }
        const data = await response.json();
        setOffer(data.data || null);
      } catch (err: any) {
        setError(err.message || "An error occurred.");
        setOffer(null);
      }
      setLoading(false);
    };
    if (id) fetchOfferDetails();
  }, [id]);

  const getStatusText = (status: number): string => {
    switch (status) {
      case 0:
        return "Open - Ready to be accepted";
      case 1:
        return "Pending - User B (Taker) created HTLC. User A (Creator) needs to create theirs.";
      case 2:
        return "Pending - Both HTLCs created. Ready for claiming.";
      case 3:
        return "Claimed by User A. User B can now claim.";
      case 4:
        return "Closed - Claimed by User B. Swap complete.";
      case -1:
        return "Expired/Cancelled - Funds can be reclaimed.";
      default:
        return "Unknown Status";
    }
  };

  const updateBackendStatus = async (
    newStatus: number,
    extraData?: Partial<Offer>,
  ) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const response = await fetch(
        `http://localhost:3001/api/offers/${id}/status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus, ...extraData }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || `Failed to update status to ${newStatus}`,
        );

      // Optimistically update local offer state
      setOffer((prev) =>
        prev ? { ...prev, status: newStatus, ...extraData } : null,
      );
      setActionSuccess(result.message || "Offer status updated.");
      return true;
    } catch (err: any) {
      setActionError(err.message);
      return false;
    }
  };

  // User B (Taker) accepts offer and deploys their HTLC
  const handleAcceptOfferAndDeploy = async () => {
    if (!offer || !tonWallet || offer.networkto !== "TON") {
      setActionError(
        "Conditions not met: Offer invalid, TON wallet not connected, or target is not TON.",
      );
      return;
    }
    if (!offer.totoken || !offer.fromuser) {
      setActionError(
        "Missing TO_TOKEN address for User B (Taker) or FROM_USER (Creator) address.",
      );
      return;
    }

    setActionError(null);
    setActionSuccess(null);

    try {
      const secretPreimage = `secret-${offer.id}-${Date.now()}`;
      alert(
        `IMPORTANT (User B): Your secret key is: ${secretPreimage}\nSAVE THIS KEY SECURELY!`,
      );

      const secretHashBuffer = await sha256(secretPreimage);
      const secretHashBigInt = bufferToBigInt(secretHashBuffer);

      const htlcConfig: HTLCSmartContractConfig = {
        jetton_address: Address.parse(offer.totoken), // Jetton User B will send
        giver_address: Address.parse(tonWallet.account.address), // User B
        receiver_address: Address.parse(offer.fromuser), // User A
        amount: toNano(offer.amountto.toString()), // Amount User B locks
        expiration_time:
          Math.floor(Date.now() / 1000) + OFFER_EXPIRATION_SECONDS,
        hash: secretHashBigInt,
      };

      const htlc = HTLCSmartContract.createFromConfig(htlcConfig, CodeTonCell);
      const userB_htlcAddress = htlc.address.toString({
        urlSafe: true,
        bounceable: true,
      });
      console.log("User B's TON HTLC Address:", userB_htlcAddress);
      // TODO: Store userB_htlcAddress with the offer, perhaps locally or send to backend.

      const deployMessagePayload = beginCell()
        .storeUint(0x822d8ae, 32) // Opcodes.deploy from your wrapper
        .storeAddress(Address.parse(offer.totoken)) // jetton_address passed to the contract on-chain
        .endCell();

      await tonConnectUI.sendTransaction({
        messages: [
          {
            address: htlc.address.toString(),
            amount: DEFAULT_GAS_FEE.toString(),
            stateInit: beginCell()
              .storeWritable(Cell.fromBoc(htlc.init!.code.toBoc())[0])
              .storeWritable(Cell.fromBoc(htlc.init!.data.toBoc())[0])
              .endCell()
              .toBoc()
              .toString("base64"),
            payload: deployMessagePayload.toBoc().toString("base64"),
          },
        ],
        validUntil: Math.floor(Date.now() / 1000) + 600,
      });

      setActionSuccess(
        "User B: TON HTLC deployment tx sent. Check wallet for confirmation.",
      );
      await updateBackendStatus(1, {
        touser: tonWallet.account.address,
        walletto: tonWallet.account.address,
        privatekey: secretPreimage,
        ton_htlc_address_user_b: userB_htlcAddress,
      });
    } catch (e: any) {
      console.error("TON HTLC (User B) deployment error:", e);
      setActionError(`User B Deploy Error: ${e.message}`);
    }
  };

  // User A (Creator) deploys their HTLC, using the secret from User B
  const handleDeployUserAHTLC = async () => {
    if (
      !offer ||
      !offer.privatekey ||
      !tonWallet ||
      offer.status !== 1 ||
      offer.networkfrom !== "TON"
    ) {
      setActionError("Conditions not met for User A HTLC deployment.");
      return;
    }
    if (!offer.fromtoken || !offer.touser) {
      setActionError(
        "Missing FROM_TOKEN for User A (Creator) or TO_USER (Taker) address.",
      );
      return;
    }
    setActionError(null);
    setActionSuccess(null);

    try {
      const secretHashBuffer = await sha256(offer.privatekey);
      const secretHashBigInt = bufferToBigInt(secretHashBuffer);

      const htlcConfig: HTLCSmartContractConfig = {
        jetton_address: Address.parse(offer.fromtoken), // Jetton User A will send
        giver_address: Address.parse(tonWallet.account.address), // User A
        receiver_address: Address.parse(offer.touser), // User B
        amount: toNano(offer.amountfrom.toString()), // Amount User A locks
        expiration_time:
          Math.floor(Date.now() / 1000) + OFFER_EXPIRATION_SECONDS - 120, // User A HTLC expires slightly sooner
        hash: secretHashBigInt,
      };
      const htlc = HTLCSmartContract.createFromConfig(htlcConfig, CodeTonCell);
      const userA_htlcAddress = htlc.address.toString({
        urlSafe: true,
        bounceable: true,
      });
      console.log("User A's TON HTLC Address:", userA_htlcAddress);

      const deployMessagePayload = beginCell()
        .storeUint(0x822d8ae, 32) // Opcodes.deploy
        .storeAddress(Address.parse(offer.fromtoken))
        .endCell();

      await tonConnectUI.sendTransaction({
        messages: [
          {
            address: htlc.address.toString(),
            amount: DEFAULT_GAS_FEE.toString(),
            stateInit: beginCell()
              .storeWritable(Cell.fromBoc(htlc.init!.code.toBoc())[0])
              .storeWritable(Cell.fromBoc(htlc.init!.data.toBoc())[0])
              .endCell()
              .toBoc()
              .toString("base64"),
            payload: deployMessagePayload.toBoc().toString("base64"),
          },
        ],
        validUntil: Math.floor(Date.now() / 1000) + 600,
      });
      setActionSuccess(
        "User A: TON HTLC deployment tx sent. Check wallet for confirmation.",
      );
      await updateBackendStatus(2, {
        ton_htlc_address_user_a: userA_htlcAddress,
      });
    } catch (e: any) {
      console.error("TON HTLC (User A) deployment error:", e);
      setActionError(`User A Deploy Error: ${e.message}`);
    }
  };

  const handleClaimFundsTON = async (claimingUserType: "A" | "B") => {
    if (!offer || !offer.privatekey || !tonWallet) {
      setActionError("Cannot claim: Offer/secret/wallet missing.");
      return;
    }
    setActionError(null);
    setActionSuccess(null);

    let targetHtlcAddressStr: string | undefined | null;
    let newStatusAfterClaim: number = offer.status;

    if (
      claimingUserType === "A" &&
      offer.status === 2 &&
      offer.networkto === "TON"
    ) {
      targetHtlcAddressStr = offer.ton_htlc_address_user_b; // User A claims on User B's HTLC
      newStatusAfterClaim = 3;
    } else if (
      claimingUserType === "B" &&
      offer.status === 3 &&
      offer.networkfrom === "TON"
    ) {
      targetHtlcAddressStr = offer.ton_htlc_address_user_a; // User B claims on User A's HTLC
      newStatusAfterClaim = 4;
    } else {
      setActionError("Claim conditions not met for TON network.");
      return;
    }

    if (!targetHtlcAddressStr) {
      setActionError(
        "Target HTLC address for TON claim is not defined in offer details.",
      );
      return;
    }

    try {
      const secretSlice = beginCell()
        .storeBuffer(Buffer.from(offer.privatekey, "utf-8"))
        .endCell()
        .asSlice();
      const claimPayload = beginCell()
        .storeUint(0xe64ad8ec, 32) // Opcodes.provide_data
        .storeSlice(secretSlice)
        .endCell();

      await tonConnectUI.sendTransaction({
        messages: [
          {
            address: Address.parse(targetHtlcAddressStr).toString(),
            amount: DEFAULT_GAS_FEE.toString(),
            payload: claimPayload.toBoc().toString("base64"),
          },
        ],
        validUntil: Math.floor(Date.now() / 1000) + 600,
      });
      setActionSuccess(
        `User ${claimingUserType}: TON Claim tx sent. Check confirmation.`,
      );
      await updateBackendStatus(newStatusAfterClaim);
    } catch (e: any) {
      console.error(`TON Claim (User ${claimingUserType}) error:`, e);
      setActionError(`Claim Error: ${e.message}`);
    }
  };

  const handleRefundTON = async (htlcUserType: "A" | "B") => {
    if (!offer || !tonWallet) {
      setActionError("Cannot refund: Offer/wallet missing.");
      return;
    }
    setActionError(null);
    setActionSuccess(null);

    let targetHtlcAddressStr: string | undefined | null;
    if (htlcUserType === "A" && offer.networkfrom === "TON")
      targetHtlcAddressStr = offer.ton_htlc_address_user_a;
    else if (htlcUserType === "B" && offer.networkto === "TON")
      targetHtlcAddressStr = offer.ton_htlc_address_user_b;
    else {
      setActionError("Refund conditions not met for TON.");
      return;
    }

    if (!targetHtlcAddressStr) {
      setActionError("Target HTLC for TON refund not defined.");
      return;
    }

    try {
      const refundPayload = beginCell().storeUint(0xd0066d3b, 32).endCell(); // Opcodes.withdraw_expired

      await tonConnectUI.sendTransaction({
        messages: [
          {
            address: Address.parse(targetHtlcAddressStr).toString(),
            amount: DEFAULT_GAS_FEE.toString(),
            payload: refundPayload.toBoc().toString("base64"),
          },
        ],
        validUntil: Math.floor(Date.now() / 1000) + 600,
      });
      setActionSuccess(
        `User ${htlcUserType}: TON Refund tx sent. Check confirmation.`,
      );
      await updateBackendStatus(-1); // Central status update
    } catch (e: any) {
      console.error(`TON Refund (User ${htlcUserType}'s HTLC) error:`, e);
      setActionError(`Refund Error: ${e.message}`);
    }
  };

  if (loading)
    return (
      <Container className="mt-3 text-center">
        <Spinner animation="border" />
        <p>Loading...</p>
      </Container>
    );
  if (error)
    return (
      <Container className="mt-3">
        <Alert variant="danger">
          {error}{" "}
          <Button onClick={() => navigate("/offers")} variant="link">
            Back
          </Button>
        </Alert>
      </Container>
    );
  if (!offer)
    return (
      <Container className="mt-3">
        <Alert variant="warning">
          Offer not found.{" "}
          <Button onClick={() => navigate("/offers")} variant="link">
            Back
          </Button>
        </Alert>
      </Container>
    );

  const isCurrentUserOfferCreator =
    tonWallet &&
    Address.parse(offer.fromuser).equals(
      Address.parse(tonWallet.account.address),
    );
  const canCurrentUserBeTaker =
    tonWallet && !offer.touser && !isCurrentUserOfferCreator;
  const isCurrentUserTaker =
    tonWallet &&
    offer.touser &&
    Address.parse(offer.touser).equals(
      Address.parse(tonWallet.account.address),
    );

  return (
    <Container className="mt-3">
      <Card>
        <Card.Header as="h5">
          Offer ID: {offer.id} - {getStatusText(offer.status)}
        </Card.Header>
        <Card.Body>
          <ListGroup variant="flush">
            <ListGroup.Item>
              <strong>Creator:</strong> {offer.fromuser} ({offer.networkfrom})
            </ListGroup.Item>
            <ListGroup.Item>
              <strong>Taker:</strong> {offer.touser || "N/A"} ({offer.networkto}
              )
            </ListGroup.Item>
            <ListGroup.Item>
              <strong>Offering:</strong> {offer.amountfrom}{" "}
              {offer.fromtoken || "N/A"}
            </ListGroup.Item>
            <ListGroup.Item>
              <strong>Requesting:</strong> {offer.amountto}{" "}
              {offer.totoken || "N/A"}
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
                <ListGroup.Item>
                  <strong>Secret (Keep Safe!):</strong> {offer.privatekey}
                </ListGroup.Item>
              )}
            {offer.ton_htlc_address_user_a && (
              <ListGroup.Item>
                <strong>Creator's TON HTLC:</strong>{" "}
                {offer.ton_htlc_address_user_a}
              </ListGroup.Item>
            )}
            {offer.ton_htlc_address_user_b && (
              <ListGroup.Item>
                <strong>Taker's TON HTLC:</strong>{" "}
                {offer.ton_htlc_address_user_b}
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

            {offer.status >= 0 && offer.status < 4 && (
              <>
                {isCurrentUserOfferCreator &&
                  offer.networkfrom === "TON" &&
                  offer.ton_htlc_address_user_a && (
                    <Button
                      variant="danger"
                      onClick={() => handleRefundTON("A")}
                      className="mt-2"
                      disabled={!tonWallet}
                    >
                      Refund My TON HTLC (Creator)
                    </Button>
                  )}
                {isCurrentUserTaker &&
                  offer.networkto === "TON" &&
                  offer.ton_htlc_address_user_b && (
                    <Button
                      variant="danger"
                      onClick={() => handleRefundTON("B")}
                      className="mt-2"
                      disabled={!tonWallet}
                    >
                      Refund My TON HTLC (Taker)
                    </Button>
                  )}
                {/* TODO: Add Stellar Refund Buttons */}
              </>
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
};

export default OfferDetailsPage;
