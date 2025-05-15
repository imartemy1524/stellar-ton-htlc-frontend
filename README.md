# HTLC Cross-Chain Swap Frontend

This frontend application provides a user interface for creating and managing Hashed Timelock Contracts (HTLC) between TON and Stellar blockchains. It enables secure cross-chain token swaps without requiring trust between parties.

## Features

- Connect to TON and Stellar wallets (TON Connect and Freighter)
- Create swap offers between TON and Stellar
- View and accept open swap offers
- Deploy HTLC smart contracts
- Claim funds with secret preimages
- View offer history and status

## Setup & Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Start API service:

```bash
cd backend
npm install
npm start
```

3. Start the development server:

```bash
npm run dev
```

## Technology Stack

- **React**: Frontend framework
- **TypeScript**: Type-safe JavaScript
- **Vite**: Modern build tool
- **React Bootstrap**: UI components
- **TON Connect**: TON wallet integration
- **Freighter API**: Stellar wallet integration
- **@ton/core**: TON blockchain interaction
- **@stellar/stellar-sdk**: Stellar blockchain interaction

## Wallet Requirements

- For TON operations: Any TON Connect compatible wallet
- For Stellar operations: Freighter browser extension

## Backend Integration

This frontend connects to a backend service (expected at `http://localhost:3001`) that manages offer persistence and tracking.

## Smart Contracts

The application interacts with:

- TON HTLC contracts (deployed on-demand)
- Stellar HTLC contracts (deployed on-demand)

## HTLC Workflow

1. **Creator** creates an offer specifying tokens and amounts
2. **Taker** accepts the offer and deploys their HTLC with a secret
3. **Creator** deploys their HTLC using the same hash
4. **Taker** claims funds using the secret, revealing it
5. **Creator** uses the revealed secret to claim the counterparty funds

## Development

Built with React + TypeScript + Vite with HMR and ESLint rules.

### Building for Production

```bash
npm run build
```

## License

MIT
