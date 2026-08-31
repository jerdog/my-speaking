import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigation,
  useRevalidator,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export function links(): Route.LinkDescriptors {
  return [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-neutral-950 text-neutral-100">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * A page-wide hint that something is in flight. Several actions here talk to
 * Noti.st or Sessionize and can take seconds, which otherwise looks like a
 * hang.
 */
function NavigationProgress() {
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const busy = navigation.state !== "idle" || revalidator.state !== "idle";

  if (!busy) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-neutral-800"
    >
      <div className="progress-sweep h-full w-1/4 bg-white" />
    </div>
  );
}

export default function App() {
  return (
    <>
      <NavigationProgress />
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold">{message}</h1>
      <p className="mt-2 text-neutral-400">{details}</p>
      {stack && (
        <pre className="mt-4 w-full overflow-x-auto rounded bg-neutral-900 p-4 text-sm">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
