import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

const Chat = lazy(() => import("@/pages/chat"));
const Login = lazy(() => import("@/pages/login"));

const queryClient = new QueryClient();

function Router() {
  const { session, loading } = useAuth();
  if (loading)
    return (
      <div
        role="status"
        className="grid min-h-[100dvh] place-items-center bg-background font-serif text-xl text-primary"
      >
        Preparando tu espacio…
      </div>
    );
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/auth/callback" component={Login} />
      <Route path="/">
        {session ? (
          <Chat key={session.user.id} />
        ) : (
          <Redirect to="/login" />
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <Suspense
                fallback={
                  <div
                    role="status"
                    className="grid min-h-[100dvh] place-items-center font-serif text-xl text-primary"
                  >
                    Abriendo tu espacio…
                  </div>
                }
              >
                <Router />
              </Suspense>
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
