export const getStatusText = (status: number): string => {
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

export interface Offer {
  id: number;
  status: number;
  amountfrom: number;
  amountto: number;
  networkfrom: string;
  networkto: string;
  fromtoken?: string | null;
  totoken?: string | null;
  creator_ton_address: string;
  creator_stellar_address: string;
  // Taker addresses might not be shown in list view or could be conditional
  taker_ton_address?: string | null;
  taker_stellar_address?: string | null;
  startedat: string;
  privatekey?: string | null;
  ton_htlc_address_user_a?: string | null;
  ton_htlc_address_user_b?: string | null;
  stellar_htlc_address_user_a?: string | null;
  stellar_htlc_address_user_b?: string | null;
}
