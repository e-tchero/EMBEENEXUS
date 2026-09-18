import type { Metadata } from 'next';

import { SignupForm } from './signup-form';

export const metadata: Metadata = {
  title: 'Create account',
};

export default function SignupPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
          <p className="text-sm text-neutral-500">Join Embee Nexus</p>
        </div>
        <SignupForm />
        <p className="text-center text-sm text-neutral-500">
          Already have an account?{' '}
          <a href="/login" className="font-medium underline underline-offset-4">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
