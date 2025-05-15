import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Button, Spinner, Alert } from "react-bootstrap";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { Address, toNano, Cell, beginCell } from "@ton/core";
import { Buffer } from "buffer";
import {
  HTLCSmartContract,
  CodeTonCell,
  type HTLCSmartContractConfig,
  JettonMinter,
  JettonWallet,
} from "../../wrappers/ton"; // Adjust path
import type { Offer } from "../offer/_helpers";
import OfferDetailsPageHtml from "../offer/OffersDetailPageHtml";
import { tonClient, useProviderSender } from "../../wrappers/ton_utils";
import {
  StellarHTLCContract,
  type FreighterSigner,
} from "../../wrappers/stellar"; // Added FreighterSigner
import { useWallet } from "../../contexts/WalletContext";
import { signTransaction as freighterSignTransaction } from "@stellar/freighter-api"; // Added

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

async function deployStellarHTLC(
  contractSide: "userA" | "userB",
  currentOffer: Offer,
  secretForHash: string,
  userStellarAddress: string,
  freighterSigner: FreighterSigner,
): Promise<bigint> {
  if (
    !freighterSigner ||
    typeof freighterSigner.getPublicKey !== "function" ||
    typeof freighterSigner.signTransaction !== "function"
  ) {
    throw new Error(
      "Valid Freighter signer capabilities (getPublicKey, signTransaction) not provided.",
    );
  }
  // Ensure critical fields are present on the offer object based on contractSide
  if (
    contractSide === "userA" &&
    (!currentOffer.taker_stellar_address || !currentOffer.fromtoken)
  ) {
    throw new Error(
      "Missing taker_stellar_address or fromtoken for User A Stellar HTLC.",
    );
  }
  if (
    contractSide === "userB" &&
    (!currentOffer.creator_stellar_address || !currentOffer.totoken)
  ) {
    throw new Error(
      "Missing creator_stellar_address or totoken for User B Stellar HTLC.",
    );
  }

  const stellarHtlc = new StellarHTLCContract({
    // Updated instantiation
    sourceAccount: userStellarAddress,
    freighterSigner: freighterSigner,
  });

  let toAddress: string;
  let tokenAddress: string;
  let amount: string;
  let expirationTimeBase = OFFER_EXPIRATION_SECONDS;

  if (contractSide === "userA") {
    toAddress = currentOffer.taker_stellar_address!;
    tokenAddress = currentOffer.fromtoken!;
    amount = currentOffer.amountfrom.toString();
    expirationTimeBase -= 120; // User A HTLC expires slightly sooner
  } else {
    // userB
    toAddress = currentOffer.creator_stellar_address!;
    tokenAddress = currentOffer.totoken!;
    amount = currentOffer.amountto.toString();
  }

  const expirationTime = BigInt(
    Math.floor(Date.now() / 1000) + expirationTimeBase,
  );
  const secretHashBufferLocal = await sha256(secretForHash); // Renamed to avoid conflict if sha256 is global
  const secretHashHex = secretHashBufferLocal.toString("hex");

  return stellarHtlc.create(
    toAddress,
    tokenAddress,
    amount,
    expirationTime,
    secretHashHex,
  );
}

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
  const { stellarPublicKey } = useWallet(); // Get Stellar public key from context

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
        const errorMessage =
          err instanceof Error ? err.message : "An error occurred.";
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
      const errorMessage =
        err instanceof Error ? err.message : "Failed to update offer status";
      setActionError(errorMessage);
      return false;
    }
  };
  const sender = useProviderSender();

  // User B (Taker) accepts offer and deploys their HTLC
  const handleAcceptOfferAndDeploy = async () => {
    if (!offer) {
      setActionError("Offer data is not available.");
      return;
    }
    // General checks for accepting an offer
    if (offer.status !== 0) {
      // Can only accept open offers
      setActionError("Offer is not open for acceptance.");
      return;
    }

    setActionError(null);
    setActionSuccess(null);

    const secretPreimage = `secret-${offer.id}-${Date.now()}`;
    alert(
      `IMPORTANT (User B - Taker): Your secret key is: ${secretPreimage}\nSAVE THIS KEY SECURELY! You will need this to claim funds if User A completes their part, or for refunds.`,
    );
    const secretHashBuffer = await sha256(secretPreimage);

    if (offer.networkto === "TON") {
      if (!tonWallet) {
        setActionError("TON wallet not connected for TON HTLC deployment.");
        return;
      }
      if (!offer.totoken || !offer.creator_ton_address) {
        setActionError(
          "Missing TO_TOKEN for User B (Taker) or Creator TON address for TON HTLC.",
        );
        return;
      }
      try {
        const secretHashBigInt = bufferToBigInt(secretHashBuffer);
        const htlcConfig: HTLCSmartContractConfig = {
          jetton_address: null,
          giver_address: Address.parse(tonWallet.account.address),
          receiver_address: Address.parse(offer.creator_ton_address),
          amount: toNano(offer.amountto.toString()),
          expiration_time:
            Math.floor(Date.now() / 1000) + OFFER_EXPIRATION_SECONDS,
          hash: secretHashBigInt,
        };
        const htlc = HTLCSmartContract.createFromConfig(
          htlcConfig,
          CodeTonCell,
        );
        const userB_htlcAddress = htlc.address.toString({
          urlSafe: true,
          bounceable: true,
        });
        console.log("User B's TON HTLC Address:", userB_htlcAddress);

        const jettonAddress = await tonClient
          .open(JettonMinter.createFromAddress(Address.parse(offer.totoken)))
          .getWalletAddressOf(htlc.address);
        await Promise.all([
          tonClient
            .open(htlc)
            .sendDeploy(sender, toNano("0.02"), jettonAddress),
          tonClient
            .open(
              JettonWallet.createFromAddress(
                await tonClient
                  .open(
                    JettonMinter.createFromAddress(
                      Address.parse(offer.totoken),
                    ),
                  )
                  .getWalletAddressOf(sender.address!),
              ),
            )
            .sendTransfer(
              sender,
              toNano("0.1"),
              1n, // Query ID, can be anything
              htlc.address, // Destination (HTLC contract)
              toNano(offer.amountto.toString()), // Jetton amount
              beginCell() // forward_payload (optional, for notifications etc.)
                .storeUint(0, 1) // Assuming 0 for simple transfer notification or specific opcode
                .storeRef(
                  beginCell()
                    .storeUint(0, 32) // Opcode for comment or simple text
                    .storeStringTail("User B HTLC funding")
                    .endCell(),
                )
                .endCell(),
            ),
        ]);
        setActionSuccess(
          "User B: TON HTLC deployment tx sent. Check wallet for confirmation.",
        );
        await updateBackendStatus(1, {
          taker_ton_address: tonWallet.account.address,
          privatekey: secretPreimage,
          ton_htlc_address_user_b: userB_htlcAddress,
        });
      } catch (e) {
        console.error("TON HTLC (User B) deployment error:", e);
        const errorMessage =
          e instanceof Error ? e.message : "User B Deploy Error (TON)";
        setActionError(errorMessage);
      }
    } else if (offer.networkto === "Stellar") {
      // secretPreimage and secretHashBuffer are generated at the start of handleAcceptOfferAndDeploy
      // General checks for Freighter and offer fields are now within deployStellarHTLC or initial checks
      try {
        // const stellarHtlc = new StellarHTLCContract(); // Instance created within deployStellarHTLC
        // const userBStellarAddress = await stellarHtlc.getSourceAccount(); // Private method, not needed here
        if (!stellarPublicKey) {
          setActionError(
            "Stellar wallet (Freighter) not connected or public key not available.",
          );
          return;
        }
        const userBStellarAddress = stellarPublicKey;

        setActionSuccess(
          "Deploying User B's Stellar HTLC... Please confirm in Freighter.",
        );

        const freighterSignerForUserB: FreighterSigner = {
          getPublicKey: async () => userBStellarAddress,
          signTransaction: freighterSignTransaction,
        };
        const stellarHtlcId = await deployStellarHTLC(
          "userB",
          offer,
          secretPreimage,
          userBStellarAddress,
          freighterSignerForUserB,
        );

        setActionSuccess(
          `User B: Stellar HTLC created successfully. HTLC ID: ${stellarHtlcId.toString()}`,
        );
        await updateBackendStatus(1, {
          taker_stellar_address: userBStellarAddress,
          privatekey: secretPreimage,
          stellar_htlc_address_user_b: stellarHtlcId.toString(),
        });
      } catch (e) {
        console.error("Stellar HTLC (User B) deployment error:", e);
        const errorMessage =
          e instanceof Error ? e.message : "User B Deploy Error (Stellar)";
        setActionError(errorMessage);
      }
    } else {
      setActionError(
        `Unsupported networkto for HTLC deployment: ${offer.networkto}`,
      );
    }
  };

  // User A (Creator) deploys their HTLC, using the secret from User B
  const handleDeployUserAHTLC = async () => {
    if (!offer || !offer.privatekey || offer.status !== 1) {
      setActionError(
        "Offer conditions not met (must exist, have private key, and status 1).",
      );
      return;
    }

    setActionError(null);
    setActionSuccess(null);

    if (offer.networkfrom === "TON") {
      if (!tonWallet) {
        setActionError("TON wallet not connected for TON HTLC deployment.");
        return;
      }
      if (!offer.fromtoken || !offer.taker_ton_address) {
        setActionError(
          "Missing FROM_TOKEN for User A (Creator) or Taker TON address for TON HTLC.",
        );
        return;
      }
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
        const htlc = HTLCSmartContract.createFromConfig(
          htlcConfig,
          CodeTonCell,
        );
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
        const errorMessage =
          e instanceof Error ? e.message : "User A Deploy Error (TON)";
        setActionError(errorMessage);
      }
    } else if (offer.networkfrom === "Stellar") {
      if (!offer.privatekey) {
        // User A needs the private key (secret from User B)
        setActionError(
          "Missing private key (secret) for User A's Stellar HTLC deployment.",
        );
        return;
      }
      // Other necessary fields like fromtoken, taker_stellar_address will be checked by deployStellarHTLC
      try {
        if (
          !stellarPublicKey ||
          stellarPublicKey !== offer.creator_stellar_address
        ) {
          console.log(stellarPublicKey, offer.creator_stellar_address);
          setActionError(
            "Connected Stellar wallet does not match offer creator or is not available.",
          );
          return;
        }
        const freighterSignerForUserA: FreighterSigner = {
          getPublicKey: async () => stellarPublicKey, // Already fetched
          signTransaction: freighterSignTransaction, // Imported function
          // isConnected and setAllowed can be omitted if not strictly needed by StellarHTLCContract
        };

        setActionSuccess(
          "Deploying User A's Stellar HTLC... Please confirm in Freighter.",
        );
        const stellarHtlcId = await deployStellarHTLC(
          "userA",
          offer,
          offer.privatekey,
          offer.creator_stellar_address,
          freighterSignerForUserA,
        );

        setActionSuccess(
          `User A: Stellar HTLC created successfully. HTLC ID: ${stellarHtlcId.toString()}`,
        );
        await updateBackendStatus(2, {
          stellar_htlc_address_user_a: stellarHtlcId.toString(),
        });
      } catch (e) {
        console.error("Stellar HTLC (User A) deployment error:", e);
        const errorMessage =
          e instanceof Error ? e.message : "User A Deploy Error (Stellar)";
        setActionError(errorMessage);
      }
    } else {
      setActionError(`Unsupported networkfrom: ${offer.networkfrom}`);
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
    Address.parse(offer.creator_ton_address).equals(
      // Replaced fromuser
      Address.parse(tonWallet.account.address),
    );
  const canCurrentUserBeTaker =
    tonWallet && !offer.taker_ton_address && !isCurrentUserOfferCreator; // Replaced touser
  const isCurrentUserTaker =
    tonWallet &&
    offer.taker_ton_address && // Replaced touser
    Address.parse(offer.taker_ton_address).equals(
      // Replaced touser
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
