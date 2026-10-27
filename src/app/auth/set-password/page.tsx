'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { FormEvent, useState } from 'react';
import { KeyRound } from 'lucide-react';
import Link from 'next/link';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function SetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const configured = Boolean(getSupabasePublicConfig());

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (password.length < 10) {
      setError('Use at least 10 characters for your password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (!configured) {
      setError('Supabase is not configured. Add the public URL and key to .env.local.');
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError('The invitation session expired. Ask the administrator to send a new invitation.');
        return;
      }
      setMessage('Password saved. Opening your workspace…');
      window.location.assign('/staff');
    } catch {
      setError('Could not save your password. Try again or request a new invitation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground" lang="en" dir="ltr">
      <Card className="w-full max-w-md overflow-hidden rounded-xl shadow-lg">
        <CardHeader className="items-center gap-3 px-6 pb-5 pt-8 text-center sm:px-8">
          <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-primary" aria-hidden="true">
            <KeyRound size={20} />
          </span>
          <div className="grid gap-2">
            <p className="text-caption font-bold tracking-[0.16em] text-muted-foreground">ELBARAKA OPERATIONS</p>
            <h1 className="text-xl font-semibold leading-none tracking-tight sm:text-2xl">Set your password</h1>
          </div>
          <CardDescription className="max-w-sm leading-relaxed">
            Create a password to finish accepting your workspace invitation.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-7 sm:px-8">
          {error && <p className="mb-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm leading-relaxed text-destructive" role="alert">{error}</p>}
          {message && <p className="mb-4 rounded-md border border-primary/20 bg-secondary p-3 text-sm leading-relaxed text-primary" role="status">{message}</p>}
          <form className="grid gap-4" onSubmit={submit}>
            <Label className="grid gap-2 text-sm font-medium">
              <span>New password</span>
              <Input className="h-10 text-sm" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </Label>
            <Label className="grid gap-2 text-sm font-medium">
              <span>Confirm password</span>
              <Input className="h-10 text-sm" type="password" autoComplete="new-password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            </Label>
            <Button variant="primary" size="lg" className="mt-1 w-full" type="submit" disabled={!configured || saving}>
              {saving ? 'Saving…' : 'Save password'}
            </Button>
          </form>
          <div className="mt-5 flex justify-center border-t border-border pt-4">
            <Link className="rounded text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/login">
              Return to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}