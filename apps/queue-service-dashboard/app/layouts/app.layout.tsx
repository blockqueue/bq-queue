import { Outlet, redirect } from 'react-router';
import type { Route } from './+types/app.layout';

import { Breadcrumbs } from '~/components/breadcrumbs';
import { AppSidebar } from '~/components/sidebar';
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '~/components/ui/sidebar';
import { isAuthenticatedRequest } from '~/lib/jwt-auth.server';
import { cn } from '~/lib/utils';

export async function loader({ request }: Route.LoaderArgs) {
  const isAuthenticated = await isAuthenticatedRequest(request);

  if (!isAuthenticated) {
    const url = new URL(request.url);
    const redirectTo = encodeURIComponent(url.pathname + url.search);
    throw redirect(`/login?redirectTo=${redirectTo}`);
  }

  return null;
}

export default function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <MainContent>
        <Outlet />
      </MainContent>
    </SidebarProvider>
  );
}

function MainContent({ children }: { children: React.ReactNode }) {
  const { open, isMobile, state } = useSidebar();

  return (
    <main
      className={cn(
        'flex-1 min-w-0 overflow-x-hidden bg-gray-50 dark:bg-black transition-[padding] duration-200 ease-linear',
        !isMobile &&
          (state === 'expanded'
            ? 'md:pl-(--sidebar-width)'
            : 'md:pl-(--sidebar-width-icon)'),
      )}
    >
      <div className="flex items-center justify-between px-6 py-2">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <Breadcrumbs />
        </div>
        {!open && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-600 flex items-center justify-center md:hidden">
              <span className="text-white font-bold text-xs">PG</span>
            </div>
            <span className="font-semibold text-sidebar-foreground md:hidden">
              pg-boss
            </span>
          </div>
        )}
      </div>
      <div className="px-6 pb-6 lg:px-8 lg:pb-8">{children}</div>
    </main>
  );
}
