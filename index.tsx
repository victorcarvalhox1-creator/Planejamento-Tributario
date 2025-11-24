import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Google AI Studio usa <div id="root"> (como no seu index.html)
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento #root não encontrado no index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);