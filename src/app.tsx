// @refresh reload
import { Router, query, useLocation } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense, createEffect, type ParentProps } from "solid-js";
import "./app.css";
import { ThemeProvider } from "./components/ui/Theme";
import { ToastProvider } from "./components/ui/Toast";
import { LoadingScreen } from "./components/ui/Loading";
import { AppErrorBoundary } from "./components/app/AppErrorBoundary";

function CacheBoundary(props: ParentProps) {
  const location = useLocation();
  createEffect(() => {
    if (location.pathname === "/login" || location.pathname === "/register") {
      query.clear();
    }
  });
  return <>{props.children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Router
          root={props => (
            <CacheBoundary>
              <Suspense fallback={<LoadingScreen />}>
                <AppErrorBoundary
                  title="Something went wrong"
                  back={{ href: "/", label: "Go home" }}
                >
                  {props.children}
                </AppErrorBoundary>
              </Suspense>
            </CacheBoundary>
          )}
        >
          <FileRoutes />
        </Router>
      </ToastProvider>
    </ThemeProvider>
  );
}
