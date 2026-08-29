import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { takeRecoveryFromUrl } from './lib/supabase';
import './styles.css';
import './modules/modules.css';

// A password-reset link lands as a token fragment; grab it before the router
// (which owns the hash) gets a chance to rewrite the URL.
takeRecoveryFromUrl();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
