import {
  Address,
  beginCell,
  storeStateInit,
  type Sender,
  type SenderArguments,
} from "@ton/core";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { useMemo } from "react";
import { TonClient } from "@ton/ton";

let messageToSend: {
  amount: string;
  payload: string | undefined;
  stateInit: string;
  address: string;
}[] = [];

export function useProviderSender(): Sender {
  const [tonConnectUI] = useTonConnectUI();
  const addr = useTonAddress();
  return useMemo(
    () => ({
      async send(args: SenderArguments): Promise<void> {
        messageToSend.push({
          amount: args.value.toString(),
          payload: args.body?.toBoc()?.toString("base64"),
          stateInit: args.init
            ? beginCell()
                .storeWritable(storeStateInit(args.init))
                .endCell()
                .toBoc()
                .toString("base64")
            : "",
          address: args.to.toString(
            args.bounce === false
              ? { bounceable: false }
              : { bounceable: true },
          ),
        });
        // wait for all messages to be sent
        await new Promise((r) => setTimeout(r, 300));
        if (messageToSend.length) {
          console.log(
            "Sending",
            messageToSend.length,
            "messages",
            ...messageToSend,
          );
          const messages = messageToSend;
          messageToSend = [];
          await tonConnectUI.sendTransaction({
            messages,
            validUntil: Math.floor((Date.now() + 5 * 60 * 1000) / 1000),
          });
        }
      },
      address: addr ? Address.parse(addr) : undefined,
    }),
    [tonConnectUI, addr],
  );
}
export const tonClient = new TonClient({
  endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC"!,
  apiKey: "2db49944718dbcf2e451b32750675be789e23a573597a46f66313efa64f22da1",
});
