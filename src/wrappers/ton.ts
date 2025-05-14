import {
  Address,
  beginCell,
  Cell,
  type Contract, // type-only
  contractAddress,
  type ContractProvider, // type-only
  type Sender, // type-only
  SendMode,
  Slice,
} from "@ton/core";
import { Buffer } from "buffer"; // Added

export type HTLCSmartContractConfig = {
  jetton_address: Address | null;
  giver_address: Address;
  receiver_address: Address;
  amount: bigint;
  expiration_time: number;
  hash: bigint;
};

export function hTLCSmartContractConfigToCell(
  config: HTLCSmartContractConfig,
): Cell {
  return beginCell()
    .storeRef(
      beginCell()
        .storeAddress(config.jetton_address)
        .storeAddress(config.giver_address)
        .storeAddress(config.receiver_address)
        .endCell(),
    )
    .storeCoins(config.amount)
    .storeUint(config.expiration_time, 40)
    .storeUint(config.hash, 256)
    .endCell();
}

export const Opcodes = {
  deploy: 0x822d8ae,
  provide_data: 0xe64ad8ec,
  withdraw_expired: 0xd0066d3b,
};

export class HTLCSmartContract implements Contract {
  readonly address: Address;
  readonly init?: { code: Cell; data: Cell };

  constructor(
    address: Address,
    init?: { code: Cell; data: Cell },
  ) {
    this.address = address;
    this.init = init;
  }

  static createFromAddress(address: Address) {
    return new HTLCSmartContract(address);
  }

  static createFromConfig(
    config: HTLCSmartContractConfig,
    code: Cell,
    workchain = 0,
  ) {
    const data = hTLCSmartContractConfigToCell(config);
    const init = { code, data };
    return new HTLCSmartContract(contractAddress(workchain, init), init);
  }

  async sendDeploy(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    jettonAddress: Address,
  ) {
    return provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.deploy, 32)
        .storeAddress(jettonAddress)
        .endCell(),
    });
  }

  async sendProvideData(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    data: Slice | Buffer,
  ) {
    if (Buffer.isBuffer(data)) {
      data = beginCell().storeBuffer(data).endCell().asSlice();
    }
    if (data.remainingBits > 904 || data.remainingRefs)
      throw new Error("Data is too large");
    if (data.remainingBits % 8) throw new Error("Data is not byte-aligned");
    return provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.provide_data, 32)
        .storeSlice(data)
        .endCell(),
    });
  }
  async sendWithdrawExpired(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
  ) {
    return provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeUint(Opcodes.withdraw_expired, 32).endCell(),
    });
  }

  async getData(provider: ContractProvider): Promise<HTLCSmartContractConfig> {
    const result = await provider.get("data", []);
    return {
      jetton_address: result.stack.readAddress(),
      giver_address: result.stack.readAddress(),
      receiver_address: result.stack.readAddress(),
      amount: result.stack.readBigNumber(),
      expiration_time: result.stack.readNumber(),
      hash: result.stack.readBigNumber(),
    };
  }
}
export const CodeTonCell = Cell.fromHex(
  "b5ee9c7241020701000166000114ff00f4a413f4bcf2c80b01020162020502f8d020c700915be001d0d3030171b0915be0fa403001d31fdb3c2182100822d8aeba8e5931f841d70b01c000f2e4d1fa4030f861f846f845c8f841cf16f842cf16f843cf16c9c8ccf844fa02cb27cbffc9ed548228737563636573738038820898968072fb028018c8cb055003cf1602a620a66f12cf01c9810083fb000603027ee0218210e64ad8ecba8e9631f845f823b9f2d4d2f902f846bdf2d4d4f84301db3ce0308210d0066d3bba8e8df845f823bef2d4d3f84201db3ce030840ff2f0040400a6f8276f2230820afaf080b9f2d4d58260636f696e73207265636569766564c8cb8fc981020382100f8a7ea5aa3fc8cb5ff844fa025004cf1658cf1612cb0dccc9718018c8cb05f841cf16cb6eccc98100b0fb000121a10ec5b679f083f085f087f089f08bf08d06004ced44d0d401d0fa4001f861fa4001f862fa4001f863d1fa0001f864d32701f865d3ff01f866d1f60eba26",
);
