import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { requestPersistentStorage } from "./lib/db";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void requestPersistentStorage();
