// @refresh reload
import { Router, query, useLocation } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense, createEffect, type ParentProps } from "solid-js";
import "./app.css";
import { ThemeProvider } from "./components/ui/Theme";
import { ToastProvider } from "./components/ui/Toast";
import { LoadingScreen } from "./components/ui/Loading";
import { AppErrorBoundary } from "./components/app/AppErrorBoundary";
import { AnalyticsPageviews } from "./components/app/AnalyticsPageviews";
import { LocaleProvider } from "./i18n/LocaleProvider";
import { useI18n } from "./i18n/LocaleProvider";

function CacheBoundary(props: ParentProps) {
  const location = useLocation();
  createEffect(() => {
    if (location.pathname === "/login" || location.pathname === "/register") {
      query.clear();
    }
  });
  return <>{props.children}</>;
}

function AppRouter() {
  const { t } = useI18n();
  return (
    <Router
      root={props => (
        <CacheBoundary>
          <AnalyticsPageviews />
          <Suspense fallback={<LoadingScreen />}>
            <AppErrorBoundary
              title={t("error.title")}
              back={{ href: "/", label: t("error.goHome") }}
            >
              {props.children}
            </AppErrorBoundary>
          </Suspense>
        </CacheBoundary>
      )}
    >
      <FileRoutes />
    </Router>
  );
}

export default function App() {
  return (
    <LocaleProvider>
      <ThemeProvider>
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
