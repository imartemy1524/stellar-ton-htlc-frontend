import * as sorobanClient from "@stellar/stellar-sdk";
import { Server } from "@stellar/stellar-sdk/rpc";

import { Buffer } from "buffer";

// Define FreighterSigner interface
export interface FreighterSigner {
  getPublicKey: () => Promise<string>;
  signTransaction: (
    xdr: string,
    opts?: {
      network?: string;
      networkPassphrase?: string;
      accountToSign?: string;
    },
  ) => Promise<string>;
  isConnected?: () => Promise<boolean>; // Keep for completeness if useWallet provides
  setAllowed?: () => Promise<void>; // Keep for completeness
}

/**
 * Interface for the DataItem structure in the Stellar smart contract.
 */
export interface StellarDataItem {
  from: string; // Stellar address
  to: string; // Stellar address
  token: string; // Token contract address
  expired_at: string; // u64 as a string
  hash: string; // U256 represented as a 64-character hex string (32 bytes)
  amount: string; // i128 as a string
}

const CONTRACT_ID = "CA7QEAG35YTNJNVMYR5VGUTDZFB5THZPC4LVPDO5LCKXNZ77MT4UL5YL";
const DEFAULT_NETWORK_PASSPHRASE = sorobanClient.Networks.TESTNET;
const DEFAULT_RPC_URL = "https://soroban-testnet.stellar.org";
const DEFAULT_TX_FEE = "10000000";

function i128StringToParts(value: string): sorobanClient.xdr.Int128Parts {
  const bn = BigInt(value);
  const hi = bn >> 64n;
  const lo = bn & 0xffffffffffffffffffffffffffffffffn;

  // hi and lo are already BigInts from the bitwise operations
  return new sorobanClient.xdr.Int128Parts({
    // @ts-expect-error tftfttf
    hi: sorobanClient.Hyper.fromString(hi.toString()),
    // @ts-expect-error tftfttf
    lo: sorobanClient.UnsignedHyper.fromString(lo.toString()),
  });
}
function u256HexToBytes(hexString: string): Buffer {
  // Remove '0x' prefix if present
  const cleanHex = hexString.startsWith("0x") ? hexString.slice(2) : hexString;

  // Ensure the hex string has the correct format (64 characters for a U256)
  if (!cleanHex.match(/^[0-9a-fA-F]{64}$/)) {
    throw new Error(
      `Invalid U256 hex string: ${hexString}. Must be 64 hexadecimal characters (32 bytes).`,
    );
  }

  // Convert hex string to Buffer
  return Buffer.from(cleanHex, "hex");
}

function u256HexToUInt256Parts(
  hexString: string,
): sorobanClient.xdr.UInt256Parts {
  const buffer = u256HexToBytes(hexString); // Your existing function
  if (buffer.length !== 32) {
    throw new Error("U256 hex string must result in 32 bytes.");
  }

  // Read the buffer as four 64-bit unsigned big-endian integers
  const hi_hi = buffer.readBigUInt64BE(0);
  const hi_lo = buffer.readBigUInt64BE(8);
  const lo_hi = buffer.readBigUInt64BE(16);
  const lo_lo = buffer.readBigUInt64BE(24);
  console.log("ok");
  return new sorobanClient.xdr.UInt256Parts({
    // @ts-expect-error tftfttf
    hiHi: sorobanClient.UnsignedHyper.fromString(hi_hi.toString()),
    // @ts-expect-error tftfttf
    hiLo: sorobanClient.UnsignedHyper.fromString(hi_lo.toString()),
    // @ts-expect-error tftfttf
    loHi: sorobanClient.UnsignedHyper.fromString(lo_hi.toString()),
    // @ts-expect-error tftfttf
    loLo: sorobanClient.UnsignedHyper.fromString(lo_lo.toString()),
  });
}

export class StellarHTLCContract {
  private server: Server;
  private sourceAccount?: string; // User's public key
  private freighterSigner?: FreighterSigner; // Passed-in signer
  private networkPassphrase: string;

  constructor(params: {
    sourceAccount?: string; // Optional: if known, used as the signer's PK
    freighterSigner?: FreighterSigner; // For signing
    networkPassphrase?: string;
    rpcUrl?: string;
  }) {
    this.server = new Server(params.rpcUrl || DEFAULT_RPC_URL, {
      allowHttp: false,
    });
    this.sourceAccount = params.sourceAccount;
    this.freighterSigner = params.freighterSigner;
    this.networkPassphrase =
      params.networkPassphrase || DEFAULT_NETWORK_PASSPHRASE;
  }

  // Renamed and refactored from getSourceAccount
  private async ensureSignerAndSource(): Promise<{
    source: string;
    signer: FreighterSigner;
  }> {
    console.log(this.freighterSigner);
    if (
      !this.freighterSigner ||
      typeof this.freighterSigner.signTransaction !== "function" ||
      typeof this.freighterSigner.getPublicKey !== "function"
    ) {
      throw new Error(
        "Freighter signing capabilities (getPublicKey and signTransaction) not provided to StellarHTLCContract.",
      );
    }

    let source = this.sourceAccount;
    if (!source) {
      source = await this.freighterSigner.getPublicKey();
      if (!source) {
        // Double check if getPublicKey could return empty
        throw new Error(
          "Unable to get public key from provided freighterSigner.",
        );
      }
      this.sourceAccount = source; // Cache it for the instance if fetched
    }
    return { source, signer: this.freighterSigner };
  }

  /**
   * Invokes a contract function and handles transaction building, signing, and submission.
   */
  private async invokeContract(
    method: string,
    args: sorobanClient.xdr.ScVal[],
    fee?: string,
  ): Promise<sorobanClient.xdr.ScVal | undefined> {
    const { source, signer } = await this.ensureSignerAndSource();
    console.log("Invoking...", source);
    const account = await this.server.getAccount(source);
    console.log("Account details:", account);
    console.log(this.networkPassphrase);

    // Build the base transaction
    let transaction = new sorobanClient.TransactionBuilder(account, {
      networkPassphrase: this.networkPassphrase,
      fee: fee || DEFAULT_TX_FEE,
    })
      .addOperation(
        sorobanClient.Operation.invokeContractFunction({
          contract: CONTRACT_ID,
          function: method,
          args,
        }),
      )
      .setTimeout(30) // seconds
      .build();

    // Simulate the transaction first to get the resources needed
    const simulationResponse =
      await this.server.simulateTransaction(transaction);
    if ("error" in simulationResponse) {
      console.error("Simulation error:", simulationResponse.error);
      throw new Error(
        `Simulation failed: ${JSON.stringify(simulationResponse.error)}`,
      );
    }

    // Prepare and rebuild the transaction with appropriate auth
    // @ts-expect-error tftfttf
    if (simulationResponse.results && simulationResponse.results[0]?.auth) {
      // If transaction needs authorization, rebuild it
      transaction = sorobanClient
        // @ts-expect-error tftfttf
        .assembleTransaction(
          transaction,
          this.networkPassphrase,
          simulationResponse,
        )
        .build();
    }
    // Sign the transaction
    const signedTxXdr = await signer.signTransaction(transaction.toXDR(), {
      networkPassphrase: this.networkPassphrase,
      accountToSign: source,
    });
    console.log("Signed tx", signedTxXdr);

    if (!signedTxXdr) {
      throw new Error(
        "Transaction signing was cancelled or failed via provided signer.",
      );
    }

    const transactionToSubmit = sorobanClient.TransactionBuilder.fromXDR(
      signedTxXdr,
      this.networkPassphrase,
    );

    const txResult = await this.server.sendTransaction(transactionToSubmit);
    // ... (rest of txResult handling as previously fixed) ...

    if (
      txResult.status === "PENDING" ||
      txResult.status === "TRY_AGAIN_LATER" ||
      txResult.status === "DUPLICATE"
    ) {
      let getTxResponse = await this.server.getTransaction(txResult.hash);
      let attempts = 0;
      const maxAttempts = 20;
      // @ts-expect-error Typescript struggles with string literal enum member comparison here
      while (getTxResponse.status === "PENDING" && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        getTxResponse = await this.server.getTransaction(txResult.hash);
        attempts++;
      }
      if (getTxResponse.status === "SUCCESS") {
        if (!getTxResponse.resultXdr) {
          throw new Error(
            "Polling succeeded (SUCCESS) but no resultXdr found on transaction.",
          );
        }
        return (getTxResponse as any).resultXdr;
      } else {
        console.error(
          "Final Transaction Status after polling:",
          getTxResponse.status,
          getTxResponse,
        );
        throw new Error(
          `Transaction did not succeed after polling. Final Status: ${getTxResponse.status}`,
        );
      }
      // @ts-expect-error tftfttf
    } else if (txResult.status === "SUCCESS") {
      if (!(txResult as any).resultXdr) {
        throw new Error(
          "sendTransaction reported SUCCESS but no resultXdr was found immediately.",
        );
      }
      return (txResult as any).resultXdr;
    }
    console.log(txResult);
    throw new Error(
      `Unhandled transaction status from sendTransaction: ${txResult.status}`,
    );
  }

  async create(
    to: string,
    token: string,
    amount: string,
    expiredAt: bigint,
    hash: string,
  ): Promise<bigint> {
    const { source } = await this.ensureSignerAndSource(); // Get signer's address for 'from'
    console.log(
      "From",
      source,
      "To",
      to,
      "Token",
      token,
      "Amount",
      amount,
      "ExpiredAt",
      expiredAt,
      "Hash",
      hash,
    );
    const resultScVal = await this.invokeContract("create", [
      new sorobanClient.Address(source).toScVal(), // Use the resolved source address
      new sorobanClient.Address(to).toScVal(),
      new sorobanClient.Address(token).toScVal(),
      sorobanClient.xdr.ScVal.scvI128(i128StringToParts(amount)),
      sorobanClient.xdr.ScVal.scvU64(
        // @ts-expect-error tftfttf
        sorobanClient.UnsignedHyper.fromString(expiredAt.toString()),
      ),
      sorobanClient.xdr.ScVal.scvU256(u256HexToUInt256Parts(hash)),
    ]);

    if (!resultScVal) {
      throw new Error(
        "Contract invocation for 'create' did not return a value.",
      );
    }
    return sorobanClient.scValToNative(resultScVal) as bigint;
  }

  async provideData(
    id: bigint,
    data: Uint8Array,
    // submitterAccount param removed, source determined by freighterSigner
  ): Promise<boolean> {
    const resultScVal = await this.invokeContract("provide_data", [
      sorobanClient.xdr.ScVal.scvU64(
        // @ts-expect-error tftfttf
        sorobanClient.UnsignedHyper.fromString(id.toString()),
      ),
      sorobanClient.xdr.ScVal.scvBytes(Buffer.from(data)),
    ]);
    if (!resultScVal) {
      throw new Error(
        "Contract invocation for 'provide_data' did not return a value.",
      );
    }
    const nativeResult = sorobanClient.scValToNative(resultScVal);
    if (typeof nativeResult === "boolean") return nativeResult;
    if (typeof nativeResult === "object" && nativeResult !== null) {
      throw new Error(
        `Contract Error (provide_data): ${JSON.stringify(nativeResult)}`,
      );
    }
    throw new Error(
      `Unexpected result type from provide_data: ${typeof nativeResult}`,
    );
  }

  async cancelExpired(id: bigint): Promise<boolean> {
    // submitterAccount param removed
    const resultScVal = await this.invokeContract("cancel_expired", [
      sorobanClient.xdr.ScVal.scvU64(
        // @ts-expect-error tftfttf
        sorobanClient.UnsignedHyper.fromString(id.toString()),
      ),
    ]);
    if (!resultScVal) {
      throw new Error(
        "Contract invocation for 'cancel_expired' did not return a value.",
      );
    }
    const nativeResult = sorobanClient.scValToNative(resultScVal);
    if (typeof nativeResult === "boolean") return nativeResult;
    if (typeof nativeResult === "object" && nativeResult !== null) {
      throw new Error(
        `Contract Error (cancel_expired): ${JSON.stringify(nativeResult)}`,
      );
    }
    throw new Error(
      `Unexpected result type from cancel_expired: ${typeof nativeResult}`,
    );
  }

  async getOffer(id: bigint): Promise<StellarDataItem | null> {
    let simSourceAccount = this.sourceAccount; // Try pre-set source first
    if (
      !simSourceAccount &&
      this.freighterSigner &&
      typeof this.freighterSigner.getPublicKey === "function"
    ) {
      try {
        simSourceAccount = await this.freighterSigner.getPublicKey();
      } catch {
        /* Fallback if getPublicKey fails */
      }
    }
    if (!simSourceAccount) {
      // If still no source (e.g. no signer or getPublicKey failed/missing)
      simSourceAccount = sorobanClient.Keypair.random().publicKey();
    }
    console.log("Source Account Details getting...");

    const sourceAccDetails = await this.server.getAccount(simSourceAccount);
    console.log("Source Account Details:", sourceAccDetails);
    const transaction = new sorobanClient.TransactionBuilder(sourceAccDetails, {
      networkPassphrase: this.networkPassphrase,
      fee: DEFAULT_TX_FEE,
    })
      .addOperation(
        sorobanClient.Operation.invokeContractFunction({
          contract: CONTRACT_ID,
          function: "get_event",
          args: [
            sorobanClient.xdr.ScVal.scvU64(
              // @ts-expect-error tftfttf
              sorobanClient.UnsignedHyper.fromString(id.toString()),
            ),
          ],
        }),
      )
      .setTimeout(30)
      .build();

    const simulateResponse = await this.server.simulateTransaction(transaction);

    if (!simulateResponse) {
      // @ts-expect-error tftfttf
      console.error("Error simulating get_event:", simulateResponse.error);
      return null;
    }
    // @ts-expect-error tftfttf
    if (!simulateResponse.result?.retval) {
      console.warn(
        "get_event simulation returned no retval. Offer likely not found or contract logic issue.",
      );
      return null;
    }
    const nativeData = sorobanClient.scValToNative(
      // @ts-expect-error tftfttf
      simulateResponse.result.retval,
    );
    if (!nativeData || typeof nativeData !== "object") {
      return null;
    }
    const item = nativeData as {
      from: sorobanClient.Address;
      to: sorobanClient.Address;
      token: sorobanClient.Address;
      expired_at: bigint;
      hash: Buffer;
      amount: bigint;
    };
    return {
      from: item.from.toString(),
      to: item.to.toString(),
      token: item.token.toString(),
      expired_at: item.expired_at.toString(),
      hash: item.hash.toString("hex"),
      amount: item.amount.toString(),
    };
  }
}

// Keep i128StringToParts and u256HexToBytes definitions as they were before this class modification
// Ensure the public methods (create, provideData, etc.) are correctly implemented or pasted if they were complete before
