import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import type { Workspace } from '../types';

type MessagingTab = 'send' | 'templates' | 'campaigns' | 'activity' | 'preferences';
type MessageChannel = 'email' | 'sms';

type ContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  emailOptedOut?: boolean;
  smsOptedOut?: boolean;
};

type MessageTemplate = {
  id: string;
  name: string;
  channel?: MessageChannel;
  subject?: string | null;
  body: string;
  variables?: string[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type Campaign = {
  id: string;
  name: string;
  channel: MessageChannel;
  status: string;
  subject?: string | null;
  body?: string | null;
  scheduledFor?: string | null;
  sentAt?: string | null;
  recipientCount?: number;
  template?: { id: string; name: string } | null;
  createdAt?: string;
};

type DeliveryLog = {
  id: string;
  channel: MessageChannel;
  status: string;
  recipient?: string | null;
  subject?: string | null;
  body?: string | null;
  error?: string | null;
  providerMessageId?: string | null;
  scheduledFor?: string | null;
  createdAt?: string;
  contact?: { id: string; firstName: string; lastName: string } | null;
};

type OptOut = {
  id: string;
  channel: MessageChannel;
  contactId?: string | null;
  recipient?: string | null;
  reason?: string | null;
  createdAt?: string;
  contact?: { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null } | null;
};

function payloadOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const root = value as Record<string, unknown>;
  const data = root.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : root;
}

function listFrom<T>(value: unknown, keys: string[]): T[] {
  const payload = payloadOf(value);
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key] as T[];
  }
  return [];
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function dateOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function templateFrom(value: unknown, channel: MessageChannel): MessageTemplate {
  const item = recordOf(value);
  return {
    id: stringOf(item.id) || '',
    name: stringOf(item.name) || 'Untitled template',
    channel,
    subject: stringOf(item.subject),
    body: stringOf(item.body) || stringOf(item.htmlBody) || stringOf(item.textBody) || '',
    variables: Array.isArray(item.variables) ? item.variables.filter((variable): variable is string => typeof variable === 'string') : undefined,
    isActive: typeof item.isActive === 'boolean' ? item.isActive : undefined,
    createdAt: dateOf(item.createdAt),
    updatedAt: dateOf(item.updatedAt),
  };
}

function campaignFrom(value: unknown): Campaign {
  const item = recordOf(value);
  const template = recordOf(item.template);
  return {
    id: stringOf(item.id) || '',
    name: stringOf(item.name) || 'Untitled campaign',
    channel: item.channel === 'sms' ? 'sms' : 'email',
    status: stringOf(item.status) || 'draft',
    subject: stringOf(item.subject),
    body: stringOf(item.body) || stringOf(item.htmlBody),
    scheduledFor: dateOf(item.scheduledFor),
    sentAt: dateOf(item.sentAt) || dateOf(item.completedAt),
    recipientCount: typeof item.recipientCount === 'number' ? item.recipientCount : undefined,
    template: stringOf(template.id) ? { id: stringOf(template.id)!, name: stringOf(template.name) || 'Template' } : null,
    createdAt: dateOf(item.createdAt),
  };
}

function logFrom(value: unknown): DeliveryLog {
  const item = recordOf(value);
  const contact = recordOf(item.contact);
  return {
    id: stringOf(item.id) || '',
    channel: item.channel === 'sms' ? 'sms' : 'email',
    status: stringOf(item.status) || 'queued',
    recipient: stringOf(item.recipient),
    subject: stringOf(item.subject),
    body: stringOf(item.body) || stringOf(item.htmlBody),
    error: stringOf(item.error) || stringOf(item.errorMessage),
    providerMessageId: stringOf(item.providerMessageId),
    scheduledFor: dateOf(item.scheduledFor),
    createdAt: dateOf(item.createdAt),
    contact: stringOf(contact.id) ? { id: stringOf(contact.id)!, firstName: stringOf(contact.firstName) || '', lastName: stringOf(contact.lastName) || '' } : null,
  };
}

function optOutFrom(value: unknown): OptOut {
  const item = recordOf(value);
  const contact = recordOf(item.contact);
  return {
    id: stringOf(item.id) || '',
    channel: item.channel === 'sms' ? 'sms' : 'email',
    contactId: stringOf(item.contactId),
    recipient: stringOf(item.recipient) || stringOf(item.address),
    reason: stringOf(item.reason),
    createdAt: dateOf(item.createdAt) || dateOf(item.unsubscribedAt),
    contact: stringOf(contact.id) ? {
      id: stringOf(contact.id)!,
      firstName: stringOf(contact.firstName) || '',
      lastName: stringOf(contact.lastName) || '',
      email: stringOf(contact.email),
      phone: stringOf(contact.phone),
    } : null,
  };
}

function messageFor(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { error?: unknown; message?: unknown } } }).response;
    if (typeof response?.data?.error === 'string') return response.data.error;
    if (typeof response?.data?.message === 'string') return response.data.message;
  }
  return fallback;
}

function readableDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function labelFor(channel: MessageChannel): string {
  return channel === 'email' ? 'Email' : 'SMS';
}

const panel = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const primaryButton = 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300';
const secondaryButton = 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400';

export function MessagingPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [tab, setTab] = useState<MessagingTab>('send');
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<MessageTemplate[]>([]);
  const [smsTemplates, setSmsTemplates] = useState<MessageTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [optOuts, setOptOuts] = useState<OptOut[]>([]);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<{ channel: MessageChannel; template?: MessageTemplate }>({ channel: 'email' });
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [showOptOutForm, setShowOptOutForm] = useState(false);
  const [sendChannel, setSendChannel] = useState<MessageChannel>('email');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [sendTemplateId, setSendTemplateId] = useState('');
  const [sendSubject, setSendSubject] = useState('');
  const [sendBody, setSendBody] = useState('');
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendScheduleAt, setSendScheduleAt] = useState('');

  const selectedContact = useMemo(() => contacts.find((contact) => contact.id === selectedContactId) ?? null, [contacts, selectedContactId]);
  const selectedTemplates = sendChannel === 'email' ? emailTemplates : smsTemplates;

  useEffect(() => {
    api.get('/workspaces')
      .then((response) => {
        const loaded = listFrom<Workspace>(response.data, ['workspaces']);
        setWorkspaces(loaded);
        setWorkspaceId(loaded[0]?.id || '');
      })
      .catch((error: unknown) => setNotice(messageFor(error, 'Unable to load workspaces.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (workspaceId) void loadWorkspaceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (!selectedContact) return;
    const address = sendChannel === 'email' ? selectedContact.email : selectedContact.phone;
    if (address) setSendRecipient(address);
  }, [selectedContact, sendChannel]);

  useEffect(() => {
    const template = selectedTemplates.find((item) => item.id === sendTemplateId);
    if (!template) return;
    setSendBody(template.body);
    if (sendChannel === 'email') setSendSubject(template.subject || '');
  }, [sendTemplateId, selectedTemplates, sendChannel]);

  async function loadWorkspaceData() {
    setLoading(true);
    const base = `/messaging/workspaces/${workspaceId}`;
    const requests = await Promise.allSettled([
      api.get(`${base}/templates/email`),
      api.get(`${base}/templates/sms`),
      api.get(`${base}/campaigns`),
      api.get(`${base}/messages?limit=100`),
      api.get(`${base}/opt-outs`),
      api.get(`/crm/workspaces/${workspaceId}/contacts?limit=100`),
    ]);
    const [emailResult, smsResult, campaignResult, logResult, optOutResult, contactsResult] = requests;
    if (emailResult.status === 'fulfilled') setEmailTemplates(listFrom<unknown>(emailResult.value.data, ['templates', 'emailTemplates']).map((item) => templateFrom(item, 'email')));
    if (smsResult.status === 'fulfilled') setSmsTemplates(listFrom<unknown>(smsResult.value.data, ['templates', 'smsTemplates']).map((item) => templateFrom(item, 'sms')));
    if (campaignResult.status === 'fulfilled') setCampaigns(listFrom<unknown>(campaignResult.value.data, ['campaigns']).map(campaignFrom));
    if (logResult.status === 'fulfilled') setLogs(listFrom<unknown>(logResult.value.data, ['logs', 'messageLogs', 'deliveryLogs']).map(logFrom));
    if (optOutResult.status === 'fulfilled') setOptOuts(listFrom<unknown>(optOutResult.value.data, ['optOuts', 'subscriptions']).map(optOutFrom));
    if (contactsResult.status === 'fulfilled') setContacts(listFrom<ContactOption>(contactsResult.value.data, ['contacts']));
    const failed = requests.some((result) => result.status === 'rejected');
    if (failed) setNotice('Some communication data could not be loaded. Refresh after the messaging service is available.');
    setLoading(false);
  }

  function updateSendTemplate(id: string) {
    setSendTemplateId(id);
    const template = selectedTemplates.find((item) => item.id === id);
    if (!template) return;
    setSendBody(template.body);
    if (sendChannel === 'email') setSendSubject(template.subject || '');
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>, schedule = false) {
    event.preventDefault();
    if (!workspaceId || !sendRecipient.trim() || !sendBody.trim()) {
      setNotice('Choose a recipient and enter a message before sending.');
      return;
    }
    if (schedule && !sendScheduleAt) {
      setNotice('Choose when this message should be sent.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        contactId: selectedContactId || undefined,
        to: sendRecipient.trim(),
        recipient: sendRecipient.trim(),
        subject: sendChannel === 'email' ? sendSubject.trim() || undefined : undefined,
        body: sendBody,
        templateId: sendTemplateId || undefined,
        scheduledFor: schedule ? new Date(sendScheduleAt).toISOString() : undefined,
      };
      const endpoint = `/messaging/workspaces/${workspaceId}/send/${sendChannel}`;
      await api.post(endpoint, payload);
      setNotice(schedule ? `${labelFor(sendChannel)} scheduled.` : `${labelFor(sendChannel)} queued for delivery.`);
      setSendBody('');
      setSendSubject('');
      setSendTemplateId('');
      setSendScheduleAt('');
      void loadWorkspaceData();
    } catch (error: unknown) {
      setNotice(messageFor(error, `Unable to ${schedule ? 'schedule' : 'send'} ${labelFor(sendChannel).toLowerCase()}.`));
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const channel = templateDraft.channel;
    const body = String(form.get('body') || '').trim();
    const name = String(form.get('name') || '').trim();
    if (!name || !body) return;
    setSaving(true);
    try {
      const payload = {
        name,
        subject: channel === 'email' ? String(form.get('subject') || '').trim() : undefined,
        body,
        variables: ['firstName', 'lastName', 'email', 'phone', 'company'],
      };
      const base = `/messaging/workspaces/${workspaceId}/templates/${channel}`;
      if (templateDraft.template) await api.put(`${base}/${templateDraft.template.id}`, payload);
      else await api.post(base, payload);
      setNotice(templateDraft.template ? 'Template updated.' : 'Template created.');
      setShowTemplateForm(false);
      void loadWorkspaceData();
    } catch (error: unknown) {
      setNotice(messageFor(error, 'Unable to save template.'));
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(template: MessageTemplate, channel: MessageChannel) {
    if (!window.confirm(`Delete “${template.name}”?`)) return;
    setSaving(true);
    try {
      await api.delete(`/messaging/workspaces/${workspaceId}/templates/${channel}/${template.id}`);
      setNotice('Template deleted.');
      void loadWorkspaceData();
    } catch (error: unknown) {
      setNotice(messageFor(error, 'Unable to delete template.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const channel = String(form.get('channel')) === 'sms' ? 'sms' : 'email';
    const recipientIds = form.getAll('recipientIds').map(String);
    setSaving(true);
    try {
      await api.post(`/messaging/workspaces/${workspaceId}/campaigns`, {
        name: String(form.get('name') || '').trim(),
        channel,
        templateId: String(form.get('templateId') || '') || undefined,
        subject: channel === 'email' ? String(form.get('subject') || '').trim() || undefined : undefined,
        body: String(form.get('body') || '').trim() || undefined,
        recipientIds,
        scheduledFor: String(form.get('scheduledFor') || '') || undefined,
      });
      setNotice('Campaign saved.');
      setShowCampaignForm(false);
      void loadWorkspaceData();
    } catch (error: unknown) {
      setNotice(messageFor(error, 'Unable to save campaign.'));
    } finally {
      setSaving(false);
    }
  }

  async function runCampaign(campaign: Campaign, action: 'send' | 'schedule') {
    setSaving(true);
    try {
      await api.post(`/messaging/workspaces/${workspaceId}/campaigns/${campaign.id}/${action}`, action === 'schedule' ? { scheduledFor: campaign.scheduledFor } : {});
      setNotice(action === 'send' ? 'Campaign queued for delivery.' : 'Campaign scheduled.');
      void loadWorkspaceData();
    } catch (error: unknown) {
      setNotice(messageFor(error, `Unable to ${action} campaign.`));
    } finally {
      setSaving(false);
    }
  }

  async function updateOptOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contactId = String(form.get('contactId') || '');
    const channel = String(form.get('channel')) === 'sms' ? 'sms' : 'email';
    if (!contactId) return;
    setSaving(true);
    try {
      await api.post(`/messaging/workspaces/${workspaceId}/opt-outs`, {
        contactId,
        channel,
        reason: String(form.get('reason') || '').trim() || undefined,
      });
      setNotice(`${labelFor(channel)} opt-out recorded.`);
      setShowOptOutForm(false);
      void loadWorkspaceData();
    } catch (error: unknown) {
      setNotice(messageFor(error, 'Unable to update consent status.'));
    } finally {
      setSaving(false);
    }
  }

  async function removeOptOut(optOut: OptOut) {
    setSaving(true);
    try {
      await api.delete(`/messaging/workspaces/${workspaceId}/opt-outs/${optOut.id}`);
      setNotice(`${labelFor(optOut.channel)} opt-out removed.`);
      void loadWorkspaceData();
    } catch (error: unknown) {
      setNotice(messageFor(error, 'Unable to remove opt-out.'));
    } finally {
      setSaving(false);
    }
  }

  if (!loading && !workspaces.length) {
    return <main className="p-8"><h1 className="text-2xl font-bold">Communications</h1><p className="mt-3">Create a workspace before sending email or SMS.</p><Link className="mt-3 inline-block text-blue-600" to="/organizations">Go to organizations</Link></main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link to="/dashboard" className="text-sm font-medium text-blue-600">← Dashboard</Link>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Communications</h1>
            <p className="mt-1 text-slate-600">Create, schedule, and track customer email and SMS without exposing provider credentials.</p>
          </div>
          <select aria-label="Workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm">
            {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </header>

        <nav className="mb-6 flex gap-2 overflow-x-auto border-b border-slate-200 pb-3" aria-label="Communications sections">
          {([
            ['send', 'Compose'],
            ['templates', 'Templates'],
            ['campaigns', 'Campaigns'],
            ['activity', 'Delivery activity'],
            ['preferences', 'Opt-outs'],
          ] as Array<[MessagingTab, string]>).map(([value, label]) => (
            <button key={value} onClick={() => setTab(value)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ${tab === value ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'}`}>{label}</button>
          ))}
        </nav>

        {notice && <div role="status" className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')} className="font-bold">×</button></div>}
        {loading && <div className="mb-5 rounded-lg bg-white p-4 text-sm text-slate-500 shadow-sm">Loading communications…</div>}

        {tab === 'send' && <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form className={panel} onSubmit={(event) => void sendMessage(event, false)}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Send a message</h2><p className="mt-1 text-sm text-slate-500">Use templates and CRM data to personalize each delivery.</p></div><div className="rounded-lg bg-slate-100 p-1"><button type="button" onClick={() => { setSendChannel('email'); setSendTemplateId(''); }} className={`rounded-md px-3 py-1.5 text-sm ${sendChannel === 'email' ? 'bg-white font-medium text-blue-700 shadow-sm' : 'text-slate-600'}`}>Email</button><button type="button" onClick={() => { setSendChannel('sms'); setSendTemplateId(''); }} className={`rounded-md px-3 py-1.5 text-sm ${sendChannel === 'sms' ? 'bg-white font-medium text-blue-700 shadow-sm' : 'text-slate-600'}`}>SMS</button></div></div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">CRM contact<select value={selectedContactId} onChange={(event) => setSelectedContactId(event.target.value)} className={`mt-1 ${field}`}><option value="">Choose a contact (optional)</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName}{sendChannel === 'email' ? contact.email ? ` · ${contact.email}` : ' · no email' : contact.phone ? ` · ${contact.phone}` : ' · no phone'}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Recipient {sendChannel === 'email' ? 'email' : 'phone'}<input value={sendRecipient} onChange={(event) => setSendRecipient(event.target.value)} type={sendChannel === 'email' ? 'email' : 'tel'} required placeholder={sendChannel === 'email' ? 'contact@example.com' : '+15551234567'} className={`mt-1 ${field}`}/></label>
              <label className="text-sm font-medium text-slate-700">Template<select value={sendTemplateId} onChange={(event) => updateSendTemplate(event.target.value)} className={`mt-1 ${field}`}><option value="">Start from scratch</option>{selectedTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Schedule for later<input value={sendScheduleAt} onChange={(event) => setSendScheduleAt(event.target.value)} type="datetime-local" className={`mt-1 ${field}`}/></label>
            </div>
            {sendChannel === 'email' && <label className="mt-4 block text-sm font-medium text-slate-700">Subject<input value={sendSubject} onChange={(event) => setSendSubject(event.target.value)} placeholder="A useful subject line" className={`mt-1 ${field}`}/></label>}
            <label className="mt-4 block text-sm font-medium text-slate-700">Message<textarea value={sendBody} onChange={(event) => setSendBody(event.target.value)} required rows={10} placeholder="Hi {{firstName}}, …" className={`mt-1 ${field} resize-y font-mono`}/></label>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500"><span>Available variables:</span>{['{{firstName}}', '{{lastName}}', '{{email}}', '{{phone}}', '{{company}}'].map((variable) => <button type="button" key={variable} onClick={() => setSendBody((body) => `${body}${body ? ' ' : ''}${variable}`)} className="rounded bg-slate-100 px-2 py-1 hover:bg-slate-200">{variable}</button>)}</div>
            {selectedContact && ((sendChannel === 'email' && selectedContact.emailOptedOut) || (sendChannel === 'sms' && selectedContact.smsOptedOut)) && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This contact has opted out of {labelFor(sendChannel)}. Delivery will be blocked by the server.</p>}
            <div className="mt-6 flex flex-wrap justify-end gap-3"><button disabled={saving || !sendScheduleAt} onClick={(event) => void sendMessage(event as unknown as FormEvent<HTMLFormElement>, true)} type="button" className={secondaryButton}>Schedule message</button><button disabled={saving} className={primaryButton}>{saving ? 'Working…' : `Send ${labelFor(sendChannel)}`}</button></div>
          </form>
          <aside className="space-y-4"><div className={panel}><h2 className="font-semibold">Send safely</h2><ul className="mt-3 space-y-3 text-sm text-slate-600"><li>• Provider keys stay on the server.</li><li>• Delivery errors are recorded in activity.</li><li>• Contacts who opt out are excluded automatically.</li><li>• Scheduled messages are processed by the queue.</li></ul></div><div className={panel}><h2 className="font-semibold">Quick links</h2><button onClick={() => setTab('templates')} className="mt-3 block text-sm text-blue-600 hover:underline">Create a reusable template</button><button onClick={() => setTab('campaigns')} className="mt-2 block text-sm text-blue-600 hover:underline">Send a campaign</button><button onClick={() => setTab('activity')} className="mt-2 block text-sm text-blue-600 hover:underline">Review delivery activity</button></div></aside>
        </section>}

        {tab === 'templates' && <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Message templates</h2><p className="mt-1 text-sm text-slate-600">Reusable content with contact variables.</p></div><div className="flex gap-2"><button onClick={() => { setTemplateDraft({ channel: 'email' }); setShowTemplateForm(true); }} className={primaryButton}>New email template</button><button onClick={() => { setTemplateDraft({ channel: 'sms' }); setShowTemplateForm(true); }} className={secondaryButton}>New SMS template</button></div></div>
          <div className="grid gap-5 lg:grid-cols-2">
            {(['email', 'sms'] as MessageChannel[]).map((channel) => <div key={channel} className={panel}><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">{labelFor(channel)} templates</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{(channel === 'email' ? emailTemplates : smsTemplates).length}</span></div><div className="space-y-3">{(channel === 'email' ? emailTemplates : smsTemplates).map((template) => <article key={template.id} className="rounded-lg border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="font-medium text-slate-900">{template.name}</h4>{template.subject && <p className="mt-1 text-sm text-slate-600">{template.subject}</p>}</div><span className={`rounded-full px-2 py-1 text-xs ${template.isActive === false ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{template.isActive === false ? 'Inactive' : 'Active'}</span></div><p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{template.body}</p><div className="mt-4 flex gap-3"><button onClick={() => { setTemplateDraft({ channel, template }); setShowTemplateForm(true); }} className="text-sm font-medium text-blue-600">Edit</button><button onClick={() => void deleteTemplate(template, channel)} disabled={saving} className="text-sm font-medium text-red-600">Delete</button></div></article>)}{(channel === 'email' ? emailTemplates : smsTemplates).length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No {labelFor(channel).toLowerCase()} templates yet.</p>}</div></div>)}
          </div>
        </section>}

        {tab === 'campaigns' && <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Email campaigns</h2><p className="mt-1 text-sm text-slate-600">Send a grouped email message now or schedule it for later. Schedule one-off SMS from Compose.</p></div><button onClick={() => setShowCampaignForm(true)} className={primaryButton}>New campaign</button></div>
          <div className={panel}><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Campaign</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Recipients</th><th className="px-3 py-3">When</th><th className="px-3 py-3">Action</th></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.id} className="border-b border-slate-100 last:border-0"><td className="px-3 py-4"><p className="font-medium text-slate-900">{campaign.name}</p><p className="mt-1 text-xs text-slate-500">{campaign.template?.name || campaign.subject || 'Custom message'}</p></td><td className="px-3 py-4 capitalize">{campaign.channel}</td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-xs ${campaign.status === 'sent' || campaign.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : campaign.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{campaign.status}</span></td><td className="px-3 py-4">{campaign.recipientCount ?? '—'}</td><td className="px-3 py-4 text-slate-600">{readableDate(campaign.scheduledFor || campaign.sentAt || campaign.createdAt)}</td><td className="px-3 py-4">{['draft', 'scheduled'].includes(campaign.status) && <button disabled={saving} onClick={() => void runCampaign(campaign, campaign.scheduledFor ? 'schedule' : 'send')} className="text-sm font-medium text-blue-600">{campaign.scheduledFor ? 'Reschedule' : 'Send now'}</button>}</td></tr>)}{campaigns.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-500">No campaigns created yet.</td></tr>}</tbody></table></div></div>
        </section>}

        {tab === 'activity' && <section>
          <div className="mb-5"><h2 className="text-xl font-semibold">Delivery activity</h2><p className="mt-1 text-sm text-slate-600">Provider responses, scheduled deliveries, and failed-message details.</p></div>
          <div className={panel}><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Recipient</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Details</th><th className="px-3 py-3">Created</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-b border-slate-100 last:border-0"><td className="px-3 py-4"><p className="font-medium">{log.recipient || (log.contact ? `${log.contact.firstName} ${log.contact.lastName}` : 'Unknown recipient')}</p><p className="mt-1 text-xs text-slate-500">{log.providerMessageId || 'Pending provider ID'}</p></td><td className="px-3 py-4 capitalize">{log.channel}</td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-xs ${['delivered', 'sent', 'queued', 'scheduled'].includes(log.status) ? 'bg-blue-50 text-blue-700' : log.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>{log.status}</span></td><td className="max-w-xs px-3 py-4 text-slate-600"><p className="truncate">{log.error || log.subject || log.body || 'No details'}</p>{log.scheduledFor && <p className="mt-1 text-xs">Scheduled {readableDate(log.scheduledFor)}</p>}</td><td className="px-3 py-4 text-slate-600">{readableDate(log.createdAt)}</td></tr>)}{logs.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-500">No delivery activity yet.</td></tr>}</tbody></table></div></div>
        </section>}

        {tab === 'preferences' && <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Opt-outs & consent</h2><p className="mt-1 text-sm text-slate-600">Respect channel-specific preferences for every workspace contact.</p></div><button onClick={() => setShowOptOutForm(true)} className={primaryButton}>Record opt-out</button></div>
          <div className={panel}><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Reason</th><th className="px-3 py-3">Recorded</th><th className="px-3 py-3"></th></tr></thead><tbody>{optOuts.map((optOut) => <tr key={optOut.id} className="border-b border-slate-100 last:border-0"><td className="px-3 py-4"><p className="font-medium">{optOut.contact ? `${optOut.contact.firstName} ${optOut.contact.lastName}` : optOut.recipient || 'Unknown contact'}</p><p className="mt-1 text-xs text-slate-500">{optOut.contact?.email || optOut.contact?.phone || optOut.recipient}</p></td><td className="px-3 py-4 capitalize">{optOut.channel}</td><td className="px-3 py-4 text-slate-600">{optOut.reason || 'No reason provided'}</td><td className="px-3 py-4 text-slate-600">{readableDate(optOut.createdAt)}</td><td className="px-3 py-4"><button disabled={saving} onClick={() => void removeOptOut(optOut)} className="text-sm font-medium text-blue-600">Restore consent</button></td></tr>)}{optOuts.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-500">No opt-outs recorded in this workspace.</td></tr>}</tbody></table></div></div>
        </section>}
      </div>

      {showTemplateForm && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={(event) => void saveTemplate(event)} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{templateDraft.template ? 'Edit' : 'New'} {labelFor(templateDraft.channel)} template</h2><p className="mt-1 text-sm text-slate-500">Variables are resolved from the linked CRM contact at delivery time.</p></div><button type="button" onClick={() => setShowTemplateForm(false)} aria-label="Close" className="text-xl text-slate-500">×</button></div><div className="space-y-4"><label className="block text-sm font-medium text-slate-700">Template name<input name="name" defaultValue={templateDraft.template?.name} required className={`mt-1 ${field}`}/></label>{templateDraft.channel === 'email' && <label className="block text-sm font-medium text-slate-700">Subject<input name="subject" defaultValue={templateDraft.template?.subject || ''} className={`mt-1 ${field}`}/></label>}<label className="block text-sm font-medium text-slate-700">Message<textarea name="body" defaultValue={templateDraft.template?.body} required rows={12} placeholder="Hello {{firstName}}, …" className={`mt-1 ${field} resize-y font-mono`}/></label><p className="text-xs text-slate-500">Use: {'{{firstName}}'}, {'{{lastName}}'}, {'{{email}}'}, {'{{phone}}'}, {'{{company}}'}</p></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowTemplateForm(false)} className={secondaryButton}>Cancel</button><button disabled={saving} className={primaryButton}>{saving ? 'Saving…' : 'Save template'}</button></div></form></div>}

      {showCampaignForm && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={(event) => void saveCampaign(event)} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">New email campaign</h2><p className="mt-1 text-sm text-slate-500">Contacts who opt out are skipped at send time.</p></div><button type="button" onClick={() => setShowCampaignForm(false)} aria-label="Close" className="text-xl text-slate-500">×</button></div><CampaignForm emailTemplates={emailTemplates} contacts={contacts}/><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowCampaignForm(false)} className={secondaryButton}>Cancel</button><button disabled={saving} className={primaryButton}>{saving ? 'Saving…' : 'Save campaign'}</button></div></form></div>}

      {showOptOutForm && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={(event) => void updateOptOut(event)} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Record opt-out</h2><p className="mt-1 text-sm text-slate-500">This prevents future automated and campaign delivery on the selected channel.</p></div><button type="button" onClick={() => setShowOptOutForm(false)} aria-label="Close" className="text-xl text-slate-500">×</button></div><div className="space-y-4"><label className="block text-sm font-medium text-slate-700">Contact<select name="contactId" required className={`mt-1 ${field}`}><option value="">Select a contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName}</option>)}</select></label><label className="block text-sm font-medium text-slate-700">Channel<select name="channel" className={`mt-1 ${field}`}><option value="email">Email</option><option value="sms">SMS</option></select></label><label className="block text-sm font-medium text-slate-700">Reason (optional)<input name="reason" placeholder="Requested through support" className={`mt-1 ${field}`}/></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setShowOptOutForm(false)} className={secondaryButton}>Cancel</button><button disabled={saving} className={primaryButton}>Record opt-out</button></div></form></div>}
    </main>
  );
}

function CampaignForm({ emailTemplates, contacts }: { emailTemplates: MessageTemplate[]; contacts: ContactOption[] }) {
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-medium text-slate-700">Campaign name<input name="name" required placeholder="July welcome series" className={`mt-1 ${field}`}/></label><label className="block text-sm font-medium text-slate-700">Template<select name="templateId" className={`mt-1 ${field}`}><option value="">Custom message</option>{emailTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label className="block text-sm font-medium text-slate-700">Schedule (optional)<input name="scheduledFor" type="datetime-local" className={`mt-1 ${field}`}/></label></div><label className="block text-sm font-medium text-slate-700">Subject<input name="subject" placeholder="A helpful update" className={`mt-1 ${field}`}/></label><label className="block text-sm font-medium text-slate-700">Custom message (optional)<textarea name="body" rows={5} placeholder="Use this when no template is selected" className={`mt-1 ${field} resize-y`}/></label><label className="block text-sm font-medium text-slate-700">Recipients<select name="recipientIds" multiple size={Math.min(Math.max(contacts.length, 4), 8)} className={`mt-1 ${field}`}>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.firstName} {contact.lastName} · {contact.email || 'no email'}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Select one or more contacts. Leave none selected to let the server apply its campaign audience rules.</span></label></div>;
}
