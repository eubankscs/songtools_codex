import React from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

function App() {
  return <main aria-label="Songtools application shell" />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
