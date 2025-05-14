import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface WalletState {
  tonAddress: string | null;
  stellarPublicKey: string | null;
  setTonAddress: (address: string | null) => void;
  setStellarPublicKey: (publicKey: string | null) => void;
}

const WalletContext = createContext<WalletState | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tonAddress, setTonAddress] = useState<string | null>(null);
  const [stellarPublicKey, setStellarPublicKey] = useState<string | null>(null);

  return (
    <WalletContext.Provider value={{ tonAddress, stellarPublicKey, setTonAddress, setStellarPublicKey }}>
      {children}
    </WalletContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useWallet = (): WalletState => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
