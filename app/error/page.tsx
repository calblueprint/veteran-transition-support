import { ButtonLink } from '@/components/Button';

/**
 * Landing page for failed email confirmations - see
 * app/(auth)/auth/confirm/route.ts, which redirects here when
 * the one-time token cannot be verified.
 */
export default function ErrorPage() {
  return (
    <div className="flex size-full flex-col items-center justify-center">
      <div className="flex w-106 flex-col gap-4 rounded-2xl bg-gray-1 p-8">
        <h1 className="text-3xl font-medium">Something went wrong.</h1>

        <p className="text-gray-11">
          That link is invalid or has expired. Try signing in again to request a
          new one.
        </p>

        <ButtonLink href="/login" variant="primary" className="mt-2">
          Back to login
        </ButtonLink>
      </div>
    </div>
  );
}
