import { lazy, Suspense } from "react";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";

import { LibraryView } from "./features/library/LibraryView";
import { Loading } from "./features/Loading";
import { useApplyTheme } from "./state/hooks";
import { ToastProvider, TooltipProvider } from "./ui";

const PlayView = lazy(() => import("./features/play/PlayView"));
const ImportView = lazy(() => import("./features/importer/ImportView"));

export function App() {
  useApplyTheme();
  return (
    <TooltipProvider delay={400}>
      <ToastProvider>
        {/* Hash routing works on any static host (e.g. GitHub Pages) without rewrites. */}
        {/* oxlint-disable-next-line react/hooks -- wouter takes the location hook itself */}
        <Router hook={useHashLocation}>
          <Suspense fallback={<Loading />}>
            <Switch>
              <Route path="/play/:id">
                {(params) => <PlayView key={params.id} id={params.id} />}
              </Route>
              <Route path="/import" component={ImportView} />
              <Route component={LibraryView} />
            </Switch>
          </Suspense>
        </Router>
      </ToastProvider>
    </TooltipProvider>
  );
}
