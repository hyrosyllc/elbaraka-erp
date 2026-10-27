'use client';

import { Input } from '@/components/ui/input';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

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
      window.location.assign('/');
    } catch {
      setError('Could not save your password. Try again or request a new invitation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="auth-page" lang="en" dir="ltr">
      <section className="auth-content">
        <div className="auth-icon"><KeyRound size={20} /></div>
        <p className="auth-eyebrow">ELBARAKA OPERATIONS</p>
        <h1>Set your password</h1>
        <p className="auth-intro">Create a password to finish accepting your workspace invitation.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-success" role="status">{message}</p>}
        <form className="auth-form" onSubmit={submit}>
          <Label className="field"><span>New password</span><Input type="password" autoComplete="new-password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></Label>
          <Label className="field"><span>Confirm password</span><Input type="password" autoComplete="new-password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></Label>
          <Button variant="primary" className="button button-primary auth-submit" type="submit" disabled={!configured || saving}>{saving ? 'Saving…' : 'Save password'}</Button>
        </form>
        <Link className="auth-back" href="/login">Return to sign in</Link>
      </section>
    </main>
  );
}