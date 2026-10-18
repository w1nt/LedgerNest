import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./styles/ui.css";
import "./styles/data-controls.css";
import "./styles/motion.css";
import RootRouter from "./router/RootRouter.tsx";
import ThemeProvider from "./context/ThemeProvider.tsx";
import SessionProvider from "./context/SessionProvider.tsx";
import LanguageProvider from "./i18n/LanguageProvider.tsx";
import { initializeLanguage } from "./i18n/initialize.ts";

initializeLanguage();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <SessionProvider>
          <RootRouter />
        </SessionProvider>
      </ThemeProvider>
    </LanguageProvider>
  </React.StrictMode>,
);
