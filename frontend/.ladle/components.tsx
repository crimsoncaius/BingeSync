import type { GlobalProvider } from "@ladle/react";
import { ThemeProvider } from "../src/theme";
import "../src/style.css";

export const Provider: GlobalProvider = ({ children }) => (
  <ThemeProvider>{children}</ThemeProvider>
);
