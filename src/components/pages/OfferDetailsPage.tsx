import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Container,
  Button,
  Spinner,
  Alert,
} from "react-bootstrap";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { Address, toNano, Cell, beginCell } from "@ton/core";
import { Buffer } from "buffer";
import {
  HTLCSmartContract,
  CodeTonCell,
  type HTLCSmartContractConfig,
} from "../../wrappers/ton"; // Adjust path
import type { Offer } from "../offer/_helpers";
import OfferDetailsPageHtml from "../offer/OffersDetailPageHtml";

// Helper for SHA256 hash - In a real app, use a robust crypto library and handle errors.
async function sha256(message: string): Promise<Buffer> {
  const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8); // hash the message
  return Buffer.from(hashBuffer); // convert buffer to Buffer
}

function bufferToBigInt(buffer: Buffer): bigint {
  return BigInt("0x" + buffer.toString("hex"));
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
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "An error occurred.";
        setError(errorMessage);
        setOffer(null);
      }
      setLoading(false);
    };
    if (id) fetchOfferDetails();
  }, [id]);

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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update offer status";
      setActionError(errorMessage);
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
    if (!offer.totoken || !offer.creator_ton_address) {
      setActionError(
        "Missing TO_TOKEN address for User B (Taker) or Creator TON address.",
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
        receiver_address: Address.parse(offer.creator_ton_address), // User A
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
              .storeRef(Cell.fromBoc(htlc.init!.code.toBoc())[0])
              .storeRef(Cell.fromBoc(htlc.init!.data.toBoc())[0])
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
        taker_ton_address: tonWallet.account.address, // Updated from touser and walletto
        privatekey: secretPreimage,
        ton_htlc_address_user_b: userB_htlcAddress,
      });
    } catch (e) {
      console.error("TON HTLC (User B) deployment error:", e);
      const errorMessage = e instanceof Error ? e.message : "User B Deploy Error";
      setActionError(errorMessage);
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
    if (!offer.fromtoken || !offer.taker_ton_address) {
      setActionError(
        "Missing FROM_TOKEN for User A (Creator) or Taker TON address.",
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
        receiver_address: Address.parse(offer.taker_ton_address), // User B
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
              .storeRef(Cell.fromBoc(htlc.init!.code.toBoc())[0])
              .storeRef(Cell.fromBoc(htlc.init!.data.toBoc())[0])
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
    } catch (e) {
      console.error("TON HTLC (User A) deployment error:", e);
      const errorMessage = e instanceof Error ? e.message : "User A Deploy Error";
      setActionError(errorMessage);
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
    } catch (e) {
      console.error(`TON Claim (User ${claimingUserType}) error:`, e);
      const errorMessage = e instanceof Error ? e.message : "Claim Error";
      setActionError(errorMessage);
    }
  };

  // const handleRefundTON = async (htlcUserType: "A" | "B") => {
  //   if (!offer || !tonWallet) {
  //     setActionError("Cannot refund: Offer/wallet missing.");
  //     return;
  //   }
  //   setActionError(null);
  //   setActionSuccess(null);

  //   let targetHtlcAddressStr: string | undefined | null;
  //   if (htlcUserType === "A" && offer.networkfrom === "TON")
  //     targetHtlcAddressStr = offer.ton_htlc_address_user_a;
  //   else if (htlcUserType === "B" && offer.networkto === "TON")
  //     targetHtlcAddressStr = offer.ton_htlc_address_user_b;
  //   else {
  //     setActionError("Refund conditions not met for TON.");
  //     return;
  //   }

  //   if (!targetHtlcAddressStr) {
  //     setActionError("Target HTLC for TON refund not defined.");
  //     return;
  //   }

  //   try {
  //     const refundPayload = beginCell().storeUint(0xd0066d3b, 32).endCell(); // Opcodes.withdraw_expired

  //     await tonConnectUI.sendTransaction({
  //       messages: [
  //         {
  //           address: Address.parse(targetHtlcAddressStr).toString(),
  //           amount: DEFAULT_GAS_FEE.toString(),
  //           payload: refundPayload.toBoc().toString("base64"),
  //         },
  //       ],
  //       validUntil: Math.floor(Date.now() / 1000) + 600,
  //     });
  //     setActionSuccess(
  //       `User ${htlcUserType}: TON Refund tx sent. Check confirmation.`,
  //     );
  //     await updateBackendStatus(-1); // Central status update
  //   } catch (e) {
  //     console.error(`TON Refund (User ${htlcUserType}'s HTLC) error:`, e);
  //     const errorMessage = e instanceof Error ? e.message : "Refund Error";
  //     setActionError(errorMessage);
  //   }
  // };

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
    Address.parse(offer.creator_ton_address).equals( // Replaced fromuser
      Address.parse(tonWallet.account.address),
    );
  const canCurrentUserBeTaker =
    tonWallet && !offer.taker_ton_address && !isCurrentUserOfferCreator; // Replaced touser
  const isCurrentUserTaker =
    tonWallet &&
    offer.taker_ton_address && // Replaced touser
    Address.parse(offer.taker_ton_address).equals( // Replaced touser
      Address.parse(tonWallet.account.address),
    );
  return (
    <OfferDetailsPageHtml
      offer={offer}
      isCurrentUserOfferCreator={!!isCurrentUserOfferCreator}
      isCurrentUserTaker={!!isCurrentUserTaker}
      canCurrentUserBeTaker={!!canCurrentUserBeTaker} 
      tonWallet={tonWallet?.account.address} 
      handleAcceptOfferAndDeploy={handleAcceptOfferAndDeploy}
      handleDeployUserAHTLC={handleDeployUserAHTLC}
      handleClaimFundsTON={handleClaimFundsTON}
      actionSuccess={actionSuccess}
      actionError={actionError}
    />
  );
};

export default OfferDetailsPage;
