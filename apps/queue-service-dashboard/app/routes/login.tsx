import {
  Form,
  Link,
  redirect,
  useActionData,
  useNavigation,
} from 'react-router';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import {
  createAuthCookie,
  createJwtToken,
  isAuthenticatedRequest,
  validateLoginCredentials,
} from '~/lib/jwt-auth.server';
import type { Route } from './+types/login';

function sanitizeRedirectTarget(target: string | null): string {
  if (!target || !target.startsWith('/')) return '/';
  if (target.startsWith('//')) return '/';
  return target;
}

export async function loader({ request }: Route.LoaderArgs) {
  const isAuthenticated = await isAuthenticatedRequest(request);
  if (isAuthenticated) throw redirect('/');
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const rememberMe = formData.get('rememberMe') === 'on';

  const authenticatedUser = await validateLoginCredentials(email, password);
  if (!authenticatedUser) {
    return { error: 'Invalid credentials. Please try again.' };
  }

  const requestUrl = new URL(request.url);
  const redirectTarget = sanitizeRedirectTarget(
    requestUrl.searchParams.get('redirectTo'),
  );
  const token = await createJwtToken(authenticatedUser.email, rememberMe);

  return redirect(redirectTarget, {
    headers: {
      'Set-Cookie': createAuthCookie(token, rememberMe),
    },
  });
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10 dark:bg-gray-950">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to Queue Dashboard</CardTitle>
          <CardDescription>
            Manage jobs, queues, and schedules from one place.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Form method="post" className="space-y-5">
            {actionData?.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                {actionData.error}
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                placeholder="you@company.com"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Password
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Use your dashboard credentials
                </span>
              </div>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                placeholder="Enter your password"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                name="rememberMe"
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600 dark:border-gray-700 dark:bg-gray-900"
              />
              Remember me
            </label>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </Form>

          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Not sure what this is?{' '}
            <Link
              to="/"
              className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Visit the dashboard home
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
