// @refresh reload
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import "./app.css";
import { ThemeProvider } from "./components/ui/Theme";
import { ToastProvider } from "./components/ui/Toast";
import { LoadingScreen } from "./components/ui/Loading";

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Router
          root={props => (
            <Suspense fallback={<LoadingScreen />}>
              {props.children}
            </Suspense>
          )}
        >
          <FileRoutes />
        </Router>
      </ToastProvider>
    </ThemeProvider>
  );
}
