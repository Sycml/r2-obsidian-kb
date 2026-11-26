import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/app.css";
import { App } from "./App";
import {
  applyThemePreference,
  getSavedAccentPreference,
  getSavedThemePreference,
} from "./lib/theme";

// Apply theme & accent tokens synchronously before React mounts
applyThemePreference(getSavedThemePreference(), getSavedAccentPreference());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
