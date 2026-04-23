import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from 'react-router';

import type { Route } from './+types/root';

import { LoadingBar } from '~/components/loading-bar';
import { ThemeProvider } from '~/components/theme-provider';
import './app.css';

// Inline script to prevent flash of wrong theme
const themeScript = `
  (function() {
    const stored = localStorage.getItem('pg-boss-theme');
    let theme = stored || 'system';
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.classList.add(theme);
  })();
`;

export async function loader({ context }: Route.LoaderArgs) {
  return {
    databases: context.databases,
    currentDb: context.currentDb,
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-gray-50 dark:bg-black">
        <ThemeProvider>
          <LoadingBar />
          {children}
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error';
    details =
      error.status === 404
        ? 'The requested page could not be found.'
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        {message}
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-4">{details}</p>
      {stack && (
        <pre className="text-left bg-gray-100 dark:bg-gray-800 p-4 rounded-lg text-sm overflow-auto max-w-full">
          {stack}
        </pre>
      )}
    </div>
  );
}

export function meta() {
  return [
    { title: 'pg-boss Dashboard' },
    { name: 'description', content: 'Monitor and manage pg-boss job queues' },
  ];
}

export function links() {
  return [];
}
