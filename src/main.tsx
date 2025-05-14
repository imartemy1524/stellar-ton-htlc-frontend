import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';
import App from './App.tsx';

// Determine the manifest URL based on the environment
const manifestUrl = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:5173/tonconnect-manifest.json' // Adjust port if your Vite dev server uses a different one
  : 'https://<YOUR_DEPLOYED_APP_URL>/tonconnect-manifest.json'; // Replace with your actual deployed URL

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <Router>
        <App />
      </Router>
    </TonConnectUIProvider>
  </StrictMode>,
)
