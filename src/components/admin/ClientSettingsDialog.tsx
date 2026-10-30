'use client';

import { type FormEvent, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClientAccountManager } from './ClientAccountManager';
import { useLocale } from './LocaleContext';

type ClientSettings = {
  id: string;
  code: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  city: string;
  isActive: boolean;
};

type ClientUpdateFields = Pick<ClientSettings, 'name' | 'contactName' | 'phone' | 'address' | 'city' | 'isActive'>;

export function ClientSettingsDialog({ client, onUpdated }: { client: ClientSettings; onUpdated: (client: ClientSettings) => void }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(client.name);
  const [contactName, setContactName] = useState(client.contactName);
  const [phone, setPhone] = useState(client.phone);
  const [address, setAddress] = useState(client.address);
  const [city, setCity] = useState(client.city);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const updateClient = async (fields: ClientUpdateFields) => {
    const response = await fetch('/api/operations/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: client.id,
        isActive: fields.isActive,
        name: fields.name,
        contactName: fields.contactName,
        phone: fields.phone,
        address: fields.address,
        city: fields.city,
      }),
    });
    const result = await response.json() as { client?: { name: string; contact_name: string; phone: string; address: string; city: string; is_active: boolean }; error?: string };
    if (!response.ok || !result.client) throw new Error(result.error || 'Could not update this client record.');
    return result.client;
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await updateClient({ name, contactName, phone, address, city, isActive: client.isActive });
      onUpdated({
        ...client,
        name: updated.name,
        contactName: updated.contact_name,
        phone: updated.phone,
        address: updated.address,
        city: updated.city,
        isActive: updated.is_active,
      });
      setNotice(t('clientUpdated'));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not update this client record.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await updateClient({
        name: client.name,
        contactName: client.contactName,
        phone: client.phone,
        address: client.address,
        city: client.city,
        isActive: !client.isActive,
      });
      const updated = { ...client, isActive: result.is_active };
      onUpdated(updated);
      setNotice(t(updated.isActive ? 'clientReactivated' : 'clientDeactivated'));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update this client record.');
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => { setName(client.name); setContactName(client.contactName); setPhone(client.phone); setAddress(client.address); setCity(client.city); setError(''); setNotice(''); setOpen(true); }}>
      <Settings2 size={15} />{t('clientSettings')}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{t('clientSettings')}</DialogTitle>
          <DialogDescription>{client.name} · {client.code}</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[min(70vh,620px)] gap-5 overflow-y-auto">
          {error && <p className="m-0 rounded-md bg-destructive-soft p-3 text-xs text-destructive" role="alert">{error}</p>}
          {notice && <p className="m-0 rounded-md bg-secondary p-3 text-xs text-success" role="status">{notice}</p>}
          <form id="client-settings-form" className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
            <Label className="grid gap-1 text-xs font-medium sm:col-span-2">{t('customerOrStore')}<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required /></Label>
            <Label className="grid gap-1 text-xs font-medium">{t('contact')}<Input value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={160} /></Label>
            <Label className="grid gap-1 text-xs font-medium">{t('phone')}<Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} dir="ltr" /></Label>
            <Label className="grid gap-1 text-xs font-medium">{t('city')}<Input value={city} onChange={(event) => setCity(event.target.value)} maxLength={120} /></Label>
            <Label className="grid gap-1 text-xs font-medium">{t('address')}<Input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={240} /></Label>
          </form>

          <div className="grid gap-2 border-t border-border pt-4">
            <h3 className="m-0 text-sm font-semibold text-foreground">{t('customerAccountDetails')}</h3>
            <p className="m-0 text-xs text-subtle">{t('customerAccountSeparation')}</p>
            <details className="rounded-md border border-border">
              <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-saffron/50">{t('manageCustomerAccounts')}</summary>
              <div className="border-t border-border p-3">
                <ClientAccountManager clientId={client.id} clientName={client.name} clientActive={client.isActive} />
              </div>
            </details>
          </div>
        </DialogBody>
        <DialogFooter className="flex-row flex-wrap items-center justify-between">
          <Button type="button" variant={client.isActive ? 'outline' : 'secondary'} disabled={busy} onClick={() => void toggleActive()}>{client.isActive ? t('clientDeactivate') : t('clientReactivate')}</Button>
          <Button type="submit" form="client-settings-form" variant="primary" disabled={busy}>{busy ? t('saving') : t('saveChanges')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
