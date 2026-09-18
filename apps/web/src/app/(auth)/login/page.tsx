import type { Metadata } from 'next';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-neutral-500">Welcome back to Embee Nexus</p>
        </div>
        <LoginForm />
        <p className="text-center text-sm text-neutral-500">
          No account?{' '}
          <a href="/signup" className="font-medium underline underline-offset-4">
            Create one
          </a>
        </p>
      </div>
    </main>
  );
}
