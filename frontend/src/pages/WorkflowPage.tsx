import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import type { Workspace } from '../types';

type WorkflowStatus = 'draft' | 'active' | 'inactive';
type WorkflowNodeType = 'trigger' | 'action' | 'delay' | 'condition' | 'branch';

type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  label?: string | null;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
};

type WorkflowEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
  targetHandle?: string;
  config?: Record<string, unknown>;
};

type Workflow = {
  id: string;
  name: string;
  description?: string | null;
  status?: WorkflowStatus;
  isActive?: boolean;
  triggerType?: string | null;
  triggerConfig?: Record<string, unknown> | null;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  updatedAt?: string;
};

type Execution = {
  id: string;
  status: string;
  triggerType?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string | null;
  logs?: { id: string; status?: string; event?: string; message?: string; createdAt?: string }[];
};

const nodeLibrary: Array<{ type: WorkflowNodeType; title: string; description: string; color: string; icon: string }> = [
  { type: 'trigger', title: 'Trigger', description: 'Starts the workflow', color: 'emerald', icon: '⚡' },
  { type: 'action', title: 'Action', description: 'Changes or sends something', color: 'blue', icon: '→' },
  { type: 'delay', title: 'Delay', description: 'Waits before continuing', color: 'amber', icon: '◷' },
  { type: 'condition', title: 'Condition', description: 'Checks a rule', color: 'violet', icon: '?' },
  { type: 'branch', title: 'Branch', description: 'Splits the next path', color: 'rose', icon: '⑂' },
];

const triggerOptions = [
  ['contact_created', 'Contact created'],
  ['contact_tag_added', 'Contact tag added'],
  ['contact_tag_removed', 'Contact tag removed'],
  ['form_submitted', 'Form submitted'],
  ['opportunity_created', 'Opportunity created'],
  ['opportunity_stage_changed', 'Opportunity stage changed'],
  ['appointment_booked', 'Appointment booked'],
  ['incoming_message_received', 'Incoming message received'],
] as const;

const actionOptions = [
  ['add_tag', 'Add tag'],
  ['remove_tag', 'Remove tag'],
  ['create_task', 'Create task'],
  ['update_contact', 'Update contact'],
  ['move_opportunity', 'Move opportunity'],
  ['send_email', 'Send email'],
  ['send_sms', 'Send SMS'],
  ['wait', 'Wait'],
  ['webhook', 'Webhook'],
  ['assign_user', 'Assign user'],
] as const;

const conditionOptions = [
  ['contact_has_tag', 'Contact has tag'],
  ['contact_field_equals', 'Contact field equals value'],
  ['opportunity_stage', 'Opportunity stage'],
  ['email_status', 'Email status'],
  ['appointment_status', 'Appointment status'],
] as const;

function isNodeType(value: unknown): value is WorkflowNodeType {
  return ['trigger', 'action', 'delay', 'condition', 'branch'].includes(String(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numeric(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function configValue(config: Record<string, unknown>, key: string, fallback = ''): string {
  const value = config[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

function nodeDefaults(type: WorkflowNodeType): Record<string, unknown> {
  if (type === 'trigger') return { triggerType: 'contact_created' };
  if (type === 'action') return { actionType: 'add_tag', value: '' };
  if (type === 'delay') return { amount: 1, unit: 'hours' };
  if (type === 'condition') return { conditionType: 'contact_has_tag', value: '' };
  return { trueLabel: 'Yes', falseLabel: 'No' };
}

function labelFor(type: WorkflowNodeType): string {
  return nodeLibrary.find((item) => item.type === type)?.title || 'Node';
}

function normalizeNode(raw: any): WorkflowNode {
  const position = asRecord(raw?.position);
  const config = asRecord(raw?.config ?? raw?.data);
  const type: WorkflowNodeType = isNodeType(raw?.type) ? raw.type : 'action';
  return {
    id: String(raw?.id || crypto.randomUUID()),
    type,
    label: typeof raw?.label === 'string' ? raw.label : typeof raw?.name === 'string' ? raw.name : null,
    config: Object.keys(config).length ? config : nodeDefaults(type),
    positionX: numeric(raw?.positionX ?? raw?.x ?? position.x, 80),
    positionY: numeric(raw?.positionY ?? raw?.y ?? position.y, 80),
  };
}

function normalizeEdge(raw: any): WorkflowEdge {
  return {
    id: String(raw?.id || crypto.randomUUID()),
    sourceNodeId: String(raw?.sourceNodeId ?? raw?.source ?? ''),
    targetNodeId: String(raw?.targetNodeId ?? raw?.target ?? ''),
    sourceHandle: raw?.sourceHandle || 'default',
    targetHandle: raw?.targetHandle || 'default',
    config: asRecord(raw?.config),
  };
}

function normalizeWorkflow(raw: any): Workflow {
  return {
    id: String(raw.id),
    name: String(raw.name || 'Untitled workflow'),
    description: typeof raw.description === 'string' ? raw.description : null,
    status: raw.status === 'active' || raw.status === 'inactive' ? raw.status : 'draft',
    isActive: Boolean(raw.isActive) || raw.status === 'active',
    triggerType: typeof raw.triggerType === 'string' ? raw.triggerType : null,
    triggerConfig: asRecord(raw.triggerConfig),
    nodes: Array.isArray(raw.nodes) ? raw.nodes.map(normalizeNode) : [],
    edges: Array.isArray(raw.edges) ? raw.edges.map(normalizeEdge) : [],
    updatedAt: raw.updatedAt,
  };
}

function responseData(response: any): any {
  return response?.data?.data ?? response?.data ?? {};
}

function colorClasses(color: string): string {
  const classes: Record<string, string> = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    violet: 'border-violet-200 bg-violet-50 text-violet-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
  };
  return classes[color] || classes.blue;
}

export function WorkflowPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedEdgeId, setSelectedEdgeId] = useState('');
  const [connectingFrom, setConnectingFrom] = useState('');
  const [connectingHandle, setConnectingHandle] = useState('default');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'builder' | 'history'>('builder');
  const [executions, setExecutions] = useState<Execution[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  const endpoint = workspaceId ? `/workflows/workspaces/${workspaceId}/workflows` : '';
  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) || null,
    [workflows, selectedWorkflowId],
  );
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );
  const existingNodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const visibleEdges = useMemo(
    () => edges.filter((edge) => existingNodeIds.has(edge.sourceNodeId) && existingNodeIds.has(edge.targetNodeId)),
    [edges, existingNodeIds],
  );

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    setSelectedWorkflowId('');
    setNodes([]);
    setEdges([]);
    setDirty(false);
    void loadWorkflows();
  }, [workspaceId]);

  useEffect(() => {
    if (view === 'history' && selectedWorkflowId) void loadExecutions();
  }, [view, selectedWorkflowId]);

  async function loadWorkspaces() {
    try {
      const data = responseData(await api.get('/workspaces'));
      const list = (data.workspaces || []) as Workspace[];
      setWorkspaces(list);
      setWorkspaceId(list[0]?.id || '');
    } catch {
      setNotice('Unable to load workspaces.');
    }
  }

  async function loadWorkflows(openFirst = true) {
    if (!endpoint) return;
    try {
      const data = responseData(await api.get(endpoint));
      const list = Array.isArray(data.workflows) ? data.workflows.map(normalizeWorkflow) : [];
      setWorkflows(list);
      if (openFirst && list.length) await openWorkflow(list[0].id);
    } catch {
      setNotice('Unable to load workflows for this workspace.');
    }
  }

  async function openWorkflow(workflowId: string) {
    if (!endpoint) return;
    try {
      const data = responseData(await api.get(`${endpoint}/${workflowId}`));
      const workflow = normalizeWorkflow(data.workflow || data);
      setWorkflows((current) => current.map((item) => item.id === workflow.id ? { ...item, ...workflow } : item));
      setSelectedWorkflowId(workflow.id);
      setNodes(workflow.nodes || []);
      setEdges(workflow.edges || []);
      setSelectedNodeId('');
      setSelectedEdgeId('');
      setConnectingFrom('');
      setConnectingHandle('default');
      setDirty(false);
      setView('builder');
    } catch {
      setNotice('Unable to open this workflow.');
    }
  }

  async function createWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!endpoint) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const description = String(form.get('description') || '').trim();
    if (!name) return;
    setCreating(true);
    try {
      const data = responseData(await api.post(endpoint, { name, description }));
      const workflow = normalizeWorkflow(data.workflow || data);
      setWorkflows((current) => [workflow, ...current]);
      setShowCreate(false);
      setNotice('Workflow created. Add a trigger, then connect your next steps.');
      await openWorkflow(workflow.id);
    } catch (error: any) {
      setNotice(error?.response?.data?.error || 'Could not create the workflow.');
    } finally {
      setCreating(false);
    }
  }

  function updateWorkflow(field: 'name' | 'description', value: string) {
    if (!selectedWorkflowId) return;
    setWorkflows((current) => current.map((workflow) => workflow.id === selectedWorkflowId ? { ...workflow, [field]: value } : workflow));
    setDirty(true);
  }

  function addNode(type: WorkflowNodeType, x = 120, y = 120) {
    const node: WorkflowNode = {
      id: crypto.randomUUID(),
      type,
      label: labelFor(type),
      config: nodeDefaults(type),
      positionX: Math.max(20, Math.min(1270, x)),
      positionY: Math.max(20, Math.min(620, y)),
    };
    setNodes((current) => [...current, node]);
    setSelectedNodeId(node.id);
    setSelectedEdgeId('');
    setDirty(true);
  }

  function onCanvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const movingNodeId = event.dataTransfer.getData('application/x-workflow-node-move');
    const libraryType = event.dataTransfer.getData('application/x-workflow-node');
    const x = event.clientX - bounds.left - 108;
    const y = event.clientY - bounds.top - 52;
    if (movingNodeId) {
      setNodes((current) => current.map((node) => node.id === movingNodeId ? {
        ...node,
        positionX: Math.max(20, Math.min(1270, x)),
        positionY: Math.max(20, Math.min(620, y)),
      } : node));
      setDirty(true);
    } else if (isNodeType(libraryType)) {
      addNode(libraryType, x, y);
    }
  }

  function startLibraryDrag(event: DragEvent<HTMLButtonElement>, type: WorkflowNodeType) {
    event.dataTransfer.setData('application/x-workflow-node', type);
    event.dataTransfer.effectAllowed = 'copy';
  }

  function startNodeDrag(event: DragEvent<HTMLDivElement>, nodeId: string) {
    event.dataTransfer.setData('application/x-workflow-node-move', nodeId);
    event.dataTransfer.effectAllowed = 'move';
  }

  function updateNode(nodeId: string, update: Partial<WorkflowNode>) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, ...update } : node));
    setDirty(true);
  }

  function updateNodeConfig(nodeId: string, key: string, value: unknown) {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, config: { ...node.config, [key]: value } } : node));
    setDirty(true);
  }

  function connectTo(targetNodeId: string) {
    if (!connectingFrom || connectingFrom === targetNodeId) return;
    const sourceHandle = connectingHandle || 'default';
    if (edges.some((edge) => edge.sourceNodeId === connectingFrom && edge.targetNodeId === targetNodeId && edge.sourceHandle === sourceHandle)) {
      setNotice('Those nodes are already connected.');
      setConnectingFrom('');
      setConnectingHandle('default');
      return;
    }
    setEdges((current) => [...current, {
      id: crypto.randomUUID(),
      sourceNodeId: connectingFrom,
      targetNodeId,
      sourceHandle,
      targetHandle: 'default',
      config: {},
    }]);
    setConnectingFrom('');
    setConnectingHandle('default');
    setDirty(true);
  }

  function deleteNode(nodeId: string) {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId));
    setSelectedNodeId('');
    setSelectedEdgeId('');
    setConnectingFrom((current) => current === nodeId ? '' : current);
    if (connectingFrom === nodeId) setConnectingHandle('default');
    setDirty(true);
  }

  function deleteEdge(edgeId: string) {
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
    setSelectedEdgeId('');
    setDirty(true);
  }

  function updateEdge(edgeId: string, update: Partial<WorkflowEdge>) {
    setEdges((current) => current.map((edge) => edge.id === edgeId ? { ...edge, ...update } : edge));
    setDirty(true);
  }

  async function saveWorkflow() {
    if (!selectedWorkflow || !endpoint) return;
    setSaving(true);
    try {
      const trigger = nodes.find((node) => node.type === 'trigger');
      const data = responseData(await api.put(`${endpoint}/${selectedWorkflow.id}`, {
        name: selectedWorkflow.name,
        description: selectedWorkflow.description || '',
        triggerType: configValue(trigger?.config || {}, 'triggerType', 'contact_created'),
        triggerConfig: trigger?.config || {},
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.type,
          label: node.label || labelFor(node.type),
          config: node.config,
          positionX: node.positionX,
          positionY: node.positionY,
        })),
        edges: visibleEdges.map((edge) => ({
          id: edge.id,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          sourceHandle: edge.sourceHandle || 'default',
          targetHandle: edge.targetHandle || 'default',
          config: edge.config || {},
        })),
      }));
      const saved = normalizeWorkflow(data.workflow || data);
      setWorkflows((current) => current.map((workflow) => workflow.id === saved.id ? { ...workflow, ...saved } : workflow));
      setNodes(saved.nodes || nodes);
      setEdges(saved.edges || visibleEdges);
      setDirty(false);
      setNotice('Workflow saved.');
    } catch (error: any) {
      setNotice(error?.response?.data?.error || 'Could not save the workflow.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActivation() {
    if (!selectedWorkflow || !endpoint) return;
    if (dirty) {
      setNotice('Save workflow changes before changing its activation status.');
      return;
    }
    const isActive = selectedWorkflow.isActive || selectedWorkflow.status === 'active';
    try {
      const data = responseData(await api.post(`${endpoint}/${selectedWorkflow.id}/${isActive ? 'deactivate' : 'activate'}`));
      const returned = data.workflow ? normalizeWorkflow(data.workflow) : null;
      setWorkflows((current) => current.map((workflow) => workflow.id === selectedWorkflow.id ? (returned || {
        ...workflow,
        isActive: !isActive,
        status: isActive ? 'inactive' : 'active',
      }) : workflow));
      setNotice(isActive ? 'Workflow deactivated.' : 'Workflow activated and ready for matching events.');
    } catch (error: any) {
      setNotice(error?.response?.data?.error || 'Could not change workflow status.');
    }
  }

  async function removeWorkflow() {
    if (!selectedWorkflow || !endpoint || !window.confirm(`Delete “${selectedWorkflow.name}”? This cannot be undone.`)) return;
    try {
      await api.delete(`${endpoint}/${selectedWorkflow.id}`);
      setWorkflows((current) => current.filter((workflow) => workflow.id !== selectedWorkflow.id));
      setSelectedWorkflowId('');
      setNodes([]);
      setEdges([]);
      setNotice('Workflow deleted.');
    } catch (error: any) {
      setNotice(error?.response?.data?.error || 'Could not delete the workflow.');
    }
  }

  async function runTest() {
    if (!selectedWorkflow || !endpoint) return;
    if (dirty) {
      setNotice('Save workflow changes before running a test event.');
      return;
    }
    try {
      const trigger = nodes.find((node) => node.type === 'trigger');
      await api.post(`${endpoint}/${selectedWorkflow.id}/trigger`, {
        triggerType: configValue(trigger?.config || {}, 'triggerType', selectedWorkflow.triggerType || 'manual'),
        payload: { source: 'workflow_builder_test' },
      });
      setNotice('Test event queued. Check the execution history for progress and any retries.');
      setView('history');
      await loadExecutions();
    } catch (error: any) {
      setNotice(error?.response?.data?.error || 'Could not queue a test event. Save and activate the workflow first.');
    }
  }

  async function loadExecutions() {
    if (!selectedWorkflowId || !endpoint) return;
    try {
      const data = responseData(await api.get(`${endpoint}/${selectedWorkflowId}/executions`));
      setExecutions(Array.isArray(data.executions) ? data.executions : []);
    } catch {
      setExecutions([]);
    }
  }

  async function retryExecution(executionId: string) {
    if (!workspaceId) return;
    try {
      await api.post(`/workflows/workspaces/${workspaceId}/executions/${executionId}/retry`);
      setNotice('Retry queued.');
      await loadExecutions();
    } catch (error: any) {
      setNotice(error?.response?.data?.error || 'Could not retry this execution.');
    }
  }

  if (!workspaces.length) {
    return <main className="p-8"><h1 className="text-2xl font-bold">Automations</h1><p className="mt-3 text-slate-600">Create a workspace first, then build automations for its contacts, opportunities, and conversations.</p><Link className="mt-3 inline-block text-blue-600" to="/organizations">Go to organizations</Link></main>;
  }

  const active = Boolean(selectedWorkflow?.isActive || selectedWorkflow?.status === 'active');

  return <main className="min-h-screen bg-slate-100 p-4 md:p-6">
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/dashboard" className="text-sm text-blue-600">← Dashboard</Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Workflow automation</h1>
          <p className="mt-1 text-sm text-slate-600">Build event-driven journeys for your CRM, pipeline, and inbox.</p>
        </div>
        <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm">
          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select>
      </header>

      {notice && <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"><span>{notice}</span><button onClick={() => setNotice('')} className="font-bold" aria-label="Dismiss notice">×</button></div>}

      <div className="grid min-h-[720px] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[285px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <div><h2 className="font-semibold text-slate-900">Workflows</h2><p className="text-xs text-slate-500">{workflows.length} total</p></div>
            <button onClick={() => setShowCreate(true)} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">+ New</button>
          </div>
          <div className="max-h-[340px] space-y-1 overflow-auto p-2 lg:max-h-[640px]">
            {workflows.length === 0 && <p className="p-3 text-sm text-slate-500">No workflows yet. Create one to start designing an automation.</p>}
            {workflows.map((workflow) => {
              const workflowActive = workflow.isActive || workflow.status === 'active';
              return <button key={workflow.id} onClick={() => void openWorkflow(workflow.id)} className={`w-full rounded-lg p-3 text-left transition ${workflow.id === selectedWorkflowId ? 'bg-white shadow-sm ring-1 ring-blue-200' : 'hover:bg-slate-100'}`}>
                <div className="flex items-start justify-between gap-2"><strong className="line-clamp-2 text-sm text-slate-800">{workflow.name}</strong><span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${workflowActive ? 'bg-emerald-100 text-emerald-700' : workflow.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{workflowActive ? 'ACTIVE' : (workflow.status || 'draft').toUpperCase()}</span></div>
                {workflow.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{workflow.description}</p>}
              </button>;
            })}
          </div>
        </aside>

        {!selectedWorkflow ? <section className="grid min-h-[520px] place-items-center p-8 text-center"><div className="max-w-md"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-100 text-2xl text-blue-700">⚡</div><h2 className="mt-4 text-xl font-bold text-slate-900">Create your first automation</h2><p className="mt-2 text-slate-600">Choose a trigger, connect actions and conditions, then activate it when it is ready.</p><button onClick={() => setShowCreate(true)} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white">Create workflow</button></div></section> : <section className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <div className="min-w-[220px] flex-1"><input value={selectedWorkflow.name} onChange={(event) => updateWorkflow('name', event.target.value)} className="w-full bg-transparent text-xl font-bold text-slate-900 outline-none placeholder:text-slate-400" aria-label="Workflow name" /><input value={selectedWorkflow.description || ''} onChange={(event) => updateWorkflow('description', event.target.value)} className="mt-1 w-full bg-transparent text-sm text-slate-500 outline-none placeholder:text-slate-400" placeholder="Describe what this workflow does" aria-label="Workflow description" /></div>
            <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{active ? 'Active' : 'Inactive'}</span><button onClick={() => void runTest()} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Run test</button><button onClick={() => void toggleActivation()} className={`rounded-md px-3 py-2 text-sm font-medium ${active ? 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>{active ? 'Deactivate' : 'Activate'}</button><button onClick={() => void saveWorkflow()} disabled={saving || !dirty} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-blue-300">{saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button></div>
          </div>

          <div className="flex border-b border-slate-200 px-4"><button onClick={() => setView('builder')} className={`border-b-2 px-4 py-3 text-sm font-medium ${view === 'builder' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'}`}>Builder</button><button onClick={() => setView('history')} className={`border-b-2 px-4 py-3 text-sm font-medium ${view === 'history' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'}`}>Execution history</button></div>

          {view === 'history' ? <ExecutionHistory executions={executions} onRefresh={() => void loadExecutions()} onRetry={(id) => void retryExecution(id)} /> : <div className="grid min-h-[620px] grid-cols-1 xl:grid-cols-[208px_minmax(0,1fr)_260px]">
            <aside className="border-b border-slate-200 bg-slate-50 p-3 xl:border-b-0 xl:border-r"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Build with</h3><div className="grid grid-cols-2 gap-2 xl:grid-cols-1">{nodeLibrary.map((item) => <button key={item.type} draggable onDragStart={(event) => startLibraryDrag(event, item.type)} onClick={() => addNode(item.type, 100 + nodes.length * 28, 100 + nodes.length * 22)} className={`cursor-grab rounded-lg border p-2 text-left shadow-sm active:cursor-grabbing ${colorClasses(item.color)}`}><span className="mr-1.5 font-bold">{item.icon}</span><span className="text-sm font-semibold">{item.title}</span><p className="mt-0.5 text-[11px] opacity-75">{item.description}</p></button>)}</div><p className="mt-4 hidden text-xs leading-5 text-slate-500 xl:block">Drag a block onto the canvas. Click an output dot, then another node’s input dot to connect them.</p></aside>

            <div className="min-w-0 overflow-auto bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] bg-[size:18px_18px]">
              <div ref={canvasRef} onDragOver={(event) => event.preventDefault()} onDrop={onCanvasDrop} className="relative h-[760px] w-[1500px]" aria-label="Workflow editor canvas">
                <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 1500 760" aria-hidden="true"><defs><marker id="workflow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><path d="M0,0 L0,7 L7,3.5 z" fill="#64748b" /></marker></defs>{visibleEdges.map((edge) => {
                  const source = nodes.find((node) => node.id === edge.sourceNodeId);
                  const target = nodes.find((node) => node.id === edge.targetNodeId);
                  if (!source || !target) return null;
                  const sx = source.positionX + 216; const sy = source.positionY + 58; const tx = target.positionX; const ty = target.positionY + 58;
                  return <path key={edge.id} d={`M ${sx} ${sy} C ${sx + 65} ${sy}, ${tx - 65} ${ty}, ${tx} ${ty}`} fill="none" stroke={selectedEdgeId === edge.id ? '#2563eb' : '#64748b'} strokeWidth={selectedEdgeId === edge.id ? 3 : 2} markerEnd="url(#workflow-arrow)" />;
                })}</svg>
                {visibleEdges.map((edge) => {
                  const source = nodes.find((node) => node.id === edge.sourceNodeId);
                  const target = nodes.find((node) => node.id === edge.targetNodeId);
                  if (!source || !target) return null;
                  const centerX = (source.positionX + 216 + target.positionX) / 2; const centerY = (source.positionY + target.positionY + 116) / 2;
                  return <button key={`edge-${edge.id}`} onClick={() => { setSelectedEdgeId(edge.id); setSelectedNodeId(''); }} className={`absolute h-5 w-5 rounded-full border-2 ${selectedEdgeId === edge.id ? 'border-blue-600 bg-blue-100' : 'border-slate-400 bg-white hover:bg-slate-100'}`} style={{ left: centerX - 10, top: centerY - 10 }} aria-label="Select connection" title="Select connection" />;
                })}
                {nodes.map((node) => <WorkflowCanvasNode key={node.id} node={node} selected={selectedNodeId === node.id} connectingFrom={connectingFrom === node.id} connectingHandle={connectingHandle} onSelect={() => { setSelectedNodeId(node.id); setSelectedEdgeId(''); }} onStartDrag={(event) => startNodeDrag(event, node.id)} onStartConnect={(handle) => { setConnectingFrom(node.id); setConnectingHandle(handle); setSelectedNodeId(node.id); setSelectedEdgeId(''); }} onConnectHere={() => connectTo(node.id)} />)}
                {nodes.length === 0 && <div className="pointer-events-none absolute left-[550px] top-[300px] max-w-xs text-center text-slate-500"><p className="text-lg font-semibold text-slate-600">Start with a trigger</p><p className="mt-1 text-sm">Drag a Trigger here, then add the steps that should happen next.</p></div>}
              </div>
            </div>

            <NodeInspector node={selectedNode} selectedEdge={edges.find((edge) => edge.id === selectedEdgeId) || null} connectingFrom={connectingFrom} workspaceId={workspaceId} onUpdateNode={updateNode} onUpdateConfig={updateNodeConfig} onUpdateEdge={updateEdge} onDeleteNode={deleteNode} onDeleteEdge={deleteEdge} onCancelConnect={() => { setConnectingFrom(''); setConnectingHandle('default'); }} />
          </div>}
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500"><span>{connectingFrom ? `Choose an input dot to finish the ${connectingHandle === 'default' ? 'next' : connectingHandle} path, or cancel it.` : 'Drag nodes to arrange your flow. Changes are saved only when you choose Save changes.'}</span><button onClick={() => void removeWorkflow()} className="text-red-600 hover:text-red-700">Delete workflow</button></footer>
        </section>}
      </div>

      {showCreate && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"><form onSubmit={createWorkflow} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">New workflow</h2><p className="mt-1 text-sm text-slate-500">Give this automation a clear goal.</p></div><button type="button" onClick={() => setShowCreate(false)} className="text-xl text-slate-500">×</button></div><div className="mt-5 grid gap-3"><label className="grid gap-1 text-sm font-medium text-slate-700">Name<input name="name" required autoFocus placeholder="Welcome new leads" className="rounded-lg border border-slate-300 px-3 py-2 font-normal outline-blue-500" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Description<textarea name="description" rows={3} placeholder="What should this workflow accomplish?" className="rounded-lg border border-slate-300 px-3 py-2 font-normal outline-blue-500" /></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">Cancel</button><button disabled={creating} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-blue-300">{creating ? 'Creating…' : 'Create workflow'}</button></div></form></div>}
    </div>
  </main>;
}

function WorkflowCanvasNode({ node, selected, connectingFrom, connectingHandle, onSelect, onStartDrag, onStartConnect, onConnectHere }: { node: WorkflowNode; selected: boolean; connectingFrom: boolean; connectingHandle: string; onSelect: () => void; onStartDrag: (event: DragEvent<HTMLDivElement>) => void; onStartConnect: (handle: string) => void; onConnectHere: () => void }) {
  const library = nodeLibrary.find((item) => item.type === node.type) || nodeLibrary[1];
  const detail = node.type === 'trigger' ? triggerOptions.find(([value]) => value === configValue(node.config, 'triggerType'))?.[1] : node.type === 'action' ? actionOptions.find(([value]) => value === configValue(node.config, 'actionType'))?.[1] : node.type === 'delay' ? `${configValue(node.config, 'amount', '1')} ${configValue(node.config, 'unit', 'hours')}` : node.type === 'condition' ? conditionOptions.find(([value]) => value === configValue(node.config, 'conditionType'))?.[1] : `${configValue(node.config, 'trueLabel', 'Yes')} / ${configValue(node.config, 'falseLabel', 'No')}`;
  const hasPaths = node.type === 'condition' || node.type === 'branch';
  return <div draggable onDragStart={onStartDrag} onClick={onSelect} className={`absolute w-[216px] cursor-grab rounded-xl border bg-white p-3 shadow-sm transition active:cursor-grabbing ${selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-300 hover:border-slate-400'}`} style={{ left: node.positionX, top: node.positionY }}>
    <button type="button" onClick={(event) => { event.stopPropagation(); onConnectHere(); }} className={`absolute -left-2 top-[49px] grid h-4 w-4 place-items-center rounded-full border-2 border-white ${connectingFrom ? 'bg-blue-600 ring-2 ring-blue-200' : 'bg-slate-400 hover:bg-blue-500'}`} title="Connect into this node" aria-label="Connect into this node" />
    <div className="flex items-start gap-2"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-sm font-bold ${colorClasses(library.color)}`}>{library.icon}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{node.label || library.title}</p><p className="mt-0.5 truncate text-xs text-slate-500">{detail || library.description}</p></div></div>
    {hasPaths ? <div className="absolute -right-[38px] top-[27px] grid gap-1"><button type="button" onClick={(event) => { event.stopPropagation(); onStartConnect('true'); }} className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${connectingFrom && connectingHandle === 'true' ? 'border-blue-600 bg-blue-100 text-blue-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`} title="Connect the true/yes path">{node.type === 'branch' ? configValue(node.config, 'trueLabel', 'Yes') : 'Yes'}</button><button type="button" onClick={(event) => { event.stopPropagation(); onStartConnect('false'); }} className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${connectingFrom && connectingHandle === 'false' ? 'border-blue-600 bg-blue-100 text-blue-800' : 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'}`} title="Connect the false/no path">{node.type === 'branch' ? configValue(node.config, 'falseLabel', 'No') : 'No'}</button></div> : <button type="button" onClick={(event) => { event.stopPropagation(); onStartConnect('default'); }} className={`absolute -right-2 top-[49px] grid h-4 w-4 place-items-center rounded-full border-2 border-white ${connectingFrom ? 'bg-blue-600 ring-2 ring-blue-200' : 'bg-slate-500 hover:bg-blue-600'}`} title="Connect from this node" aria-label="Connect from this node" />}
  </div>;
}

function NodeInspector({ node, selectedEdge, connectingFrom, workspaceId, onUpdateNode, onUpdateConfig, onUpdateEdge, onDeleteNode, onDeleteEdge, onCancelConnect }: { node: WorkflowNode | null; selectedEdge: WorkflowEdge | null; connectingFrom: string; workspaceId: string; onUpdateNode: (nodeId: string, update: Partial<WorkflowNode>) => void; onUpdateConfig: (nodeId: string, key: string, value: unknown) => void; onUpdateEdge: (edgeId: string, update: Partial<WorkflowEdge>) => void; onDeleteNode: (nodeId: string) => void; onDeleteEdge: (edgeId: string) => void; onCancelConnect: () => void }) {
  if (selectedEdge) return <aside className="border-t border-slate-200 bg-slate-50 p-4 xl:border-l xl:border-t-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Connection</p><h3 className="mt-2 font-semibold text-slate-800">Node connection</h3><p className="mt-2 text-sm text-slate-600">This path runs from one node to the next after the source node completes.</p><label className="mt-4 grid gap-1 text-sm font-medium text-slate-700">Path outcome<select value={selectedEdge.sourceHandle || 'default'} onChange={(event) => onUpdateEdge(selectedEdge.id, { sourceHandle: event.target.value })} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal"><option value="default">Next / default</option><option value="true">Yes / true</option><option value="false">No / false</option></select></label><button onClick={() => onDeleteEdge(selectedEdge.id)} className="mt-5 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700">Delete connection</button></aside>;
  if (!node) return <aside className="border-t border-slate-200 bg-slate-50 p-4 xl:border-l xl:border-t-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Inspector</p>{connectingFrom ? <><p className="mt-3 text-sm text-blue-700">Connection ready. Click an input dot on another node.</p><button onClick={onCancelConnect} className="mt-3 rounded-md border border-slate-300 px-3 py-2 text-sm">Cancel connection</button></> : <p className="mt-3 text-sm text-slate-500">Select a node or connection to edit it.</p>}</aside>;
  const library = nodeLibrary.find((item) => item.type === node.type) || nodeLibrary[1];
  return <aside className="overflow-auto border-t border-slate-200 bg-slate-50 p-4 xl:border-l xl:border-t-0"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{library.title}</p><span className={`rounded px-2 py-1 text-xs font-semibold ${colorClasses(library.color)}`}>{node.type}</span></div><label className="mt-4 grid gap-1 text-sm font-medium text-slate-700">Label<input value={node.label || ''} onChange={(event) => onUpdateNode(node.id, { label: event.target.value })} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal outline-blue-500" /></label>
    {node.type === 'trigger' && <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Event<select value={configValue(node.config, 'triggerType', 'contact_created')} onChange={(event) => onUpdateConfig(node.id, 'triggerType', event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal">{triggerOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
    {node.type === 'action' && <ActionConfiguration node={node} workspaceId={workspaceId} onUpdateConfig={onUpdateConfig} />}
    {node.type === 'delay' && <div className="mt-3 grid grid-cols-[1fr_1.2fr] gap-2"><label className="grid gap-1 text-sm font-medium text-slate-700">Wait<input type="number" min="1" value={configValue(node.config, 'amount', '1')} onChange={(event) => onUpdateConfig(node.id, 'amount', Number(event.target.value))} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Unit<select value={configValue(node.config, 'unit', 'hours')} onChange={(event) => onUpdateConfig(node.id, 'unit', event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal"><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></label></div>}
    {node.type === 'condition' && <><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Rule<select value={configValue(node.config, 'conditionType', 'contact_has_tag')} onChange={(event) => onUpdateConfig(node.id, 'conditionType', event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal">{conditionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{configValue(node.config, 'conditionType', 'contact_has_tag') === 'contact_field_equals' && <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Contact field<select value={configValue(node.config, 'field', 'source')} onChange={(event) => onUpdateConfig(node.id, 'field', event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal">{['firstName', 'lastName', 'email', 'phone', 'jobTitle', 'address', 'source', 'notes'].map((field) => <option key={field} value={field}>{field}</option>)}</select></label>}<label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Expected value<input value={configValue(node.config, 'value')} onChange={(event) => onUpdateConfig(node.id, 'value', event.target.value)} placeholder="e.g. Prospect" className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal" /></label></>}
    {node.type === 'branch' && <><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">First path label<input value={configValue(node.config, 'trueLabel', 'Yes')} onChange={(event) => onUpdateConfig(node.id, 'trueLabel', event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal" /></label><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Second path label<input value={configValue(node.config, 'falseLabel', 'No')} onChange={(event) => onUpdateConfig(node.id, 'falseLabel', event.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal" /></label></>}
    {connectingFrom && <button onClick={onCancelConnect} className="mt-4 text-sm text-blue-700">Cancel connection</button>}<button onClick={() => onDeleteNode(node.id)} className="mt-5 rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700">Delete node</button>
  </aside>;
}

type AutomationTag = { id: string; name: string };
type AutomationStage = { id: string; name: string };
type AutomationMember = { userId: string; name: string };

function ActionConfiguration({ node, workspaceId, onUpdateConfig }: { node: WorkflowNode; workspaceId: string; onUpdateConfig: (nodeId: string, key: string, value: unknown) => void }) {
  const [tags, setTags] = useState<AutomationTag[]>([]);
  const [stages, setStages] = useState<AutomationStage[]>([]);
  const [members, setMembers] = useState<AutomationMember[]>([]);
  const action = configValue(node.config, 'actionType', 'add_tag');
  const inputClass = 'rounded-md border border-slate-300 bg-white px-3 py-2 font-normal outline-blue-500';

  useEffect(() => {
    let current = true;
    async function loadActionOptions() {
      try {
        const [tagResponse, pipelineResponse, memberResponse] = await Promise.all([
          api.get(`/crm/workspaces/${workspaceId}/tags`),
          api.get(`/crm/workspaces/${workspaceId}/pipelines`),
          api.get(`/workspaces/${workspaceId}/members`),
        ]);
        if (!current) return;
        const tagData = responseData(tagResponse);
        const pipelineData = responseData(pipelineResponse);
        const memberData = responseData(memberResponse);
        setTags(Array.isArray(tagData.tags) ? tagData.tags.map((tag: any) => ({ id: String(tag.id), name: String(tag.name) })) : []);
        setStages(Array.isArray(pipelineData.pipelines) ? pipelineData.pipelines.flatMap((pipeline: any) => Array.isArray(pipeline.stages) ? pipeline.stages.map((stage: any) => ({ id: String(stage.id), name: `${pipeline.name} → ${stage.name}` })) : []) : []);
        setMembers(Array.isArray(memberData.members) ? memberData.members.map((member: any) => ({
          userId: String(member.userId),
          name: [member.user?.firstName, member.user?.lastName].filter(Boolean).join(' ') || member.user?.email || String(member.userId),
        })) : []);
      } catch {
        if (current) {
          setTags([]);
          setStages([]);
          setMembers([]);
        }
      }
    }
    void loadActionOptions();
    return () => { current = false; };
  }, [workspaceId]);

  return <>
    <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Action<select value={action} onChange={(event) => onUpdateConfig(node.id, 'actionType', event.target.value)} className={inputClass}>{actionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {(action === 'add_tag' || action === 'remove_tag') && <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Tag<select value={configValue(node.config, 'tagId')} onChange={(event) => onUpdateConfig(node.id, 'tagId', event.target.value)} className={inputClass}><option value="">Choose a tag</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>}
    {action === 'create_task' && <><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Task title<input value={configValue(node.config, 'title')} onChange={(event) => onUpdateConfig(node.id, 'title', event.target.value)} placeholder="Follow up with lead" className={inputClass} /></label><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Description<textarea value={configValue(node.config, 'description')} onChange={(event) => onUpdateConfig(node.id, 'description', event.target.value)} rows={2} className={inputClass} /></label><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Due date<input type="datetime-local" value={configValue(node.config, 'dueDate')} onChange={(event) => onUpdateConfig(node.id, 'dueDate', event.target.value)} className={inputClass} /></label></>}
    {action === 'update_contact' && <><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Contact field<select value={configValue(node.config, 'field', 'source')} onChange={(event) => onUpdateConfig(node.id, 'field', event.target.value)} className={inputClass}>{['firstName', 'lastName', 'email', 'phone', 'jobTitle', 'address', 'source', 'notes'].map((field) => <option key={field} value={field}>{field}</option>)}</select></label><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">New value<input value={configValue(asRecord(node.config.fields), configValue(node.config, 'field', 'source'))} onChange={(event) => { const field = configValue(node.config, 'field', 'source'); onUpdateConfig(node.id, 'fields', { ...asRecord(node.config.fields), [field]: event.target.value }); }} className={inputClass} /></label></>}
    {action === 'move_opportunity' && <><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Move to stage<select value={configValue(node.config, 'stageId')} onChange={(event) => onUpdateConfig(node.id, 'stageId', event.target.value)} className={inputClass}><option value="">Choose a stage</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Opportunity ID <span className="font-normal text-slate-500">(optional if trigger supplies it)</span><input value={configValue(node.config, 'opportunityId')} onChange={(event) => onUpdateConfig(node.id, 'opportunityId', event.target.value)} className={inputClass} /></label></>}
    {action === 'assign_user' && <><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Assign to<select value={configValue(node.config, 'userId')} onChange={(event) => onUpdateConfig(node.id, 'userId', event.target.value)} className={inputClass}><option value="">Choose a teammate</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Assign target<select value={configValue(node.config, 'target', 'contact')} onChange={(event) => onUpdateConfig(node.id, 'target', event.target.value)} className={inputClass}><option value="contact">Contact</option><option value="opportunity">Opportunity</option></select></label>{configValue(node.config, 'target', 'contact') === 'opportunity' && <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Opportunity ID <span className="font-normal text-slate-500">(optional if trigger supplies it)</span><input value={configValue(node.config, 'opportunityId')} onChange={(event) => onUpdateConfig(node.id, 'opportunityId', event.target.value)} className={inputClass} /></label>}</>}
    {action === 'send_email' && <><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Subject<input value={configValue(node.config, 'subject')} onChange={(event) => onUpdateConfig(node.id, 'subject', event.target.value)} className={inputClass} /></label><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Email content<textarea value={configValue(node.config, 'body')} onChange={(event) => onUpdateConfig(node.id, 'body', event.target.value)} rows={3} className={inputClass} /></label></>}
    {action === 'send_sms' && <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">SMS content<textarea value={configValue(node.config, 'body')} onChange={(event) => onUpdateConfig(node.id, 'body', event.target.value)} rows={3} className={inputClass} /></label>}
    {action === 'webhook' && <><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Webhook URL<input type="url" value={configValue(node.config, 'url')} onChange={(event) => onUpdateConfig(node.id, 'url', event.target.value)} placeholder="https://example.com/hooks/lead" className={inputClass} /></label><label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">Method<select value={configValue(node.config, 'method', 'POST')} onChange={(event) => onUpdateConfig(node.id, 'method', event.target.value)} className={inputClass}><option>POST</option><option>PUT</option><option>PATCH</option></select></label></>}
    {action === 'wait' && <div className="mt-3 grid grid-cols-[1fr_1.2fr] gap-2"><label className="grid gap-1 text-sm font-medium text-slate-700">Wait<input type="number" min="1" value={configValue(node.config, 'amount', '1')} onChange={(event) => onUpdateConfig(node.id, 'amount', Number(event.target.value))} className={inputClass} /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Unit<select value={configValue(node.config, 'unit', 'hours')} onChange={(event) => onUpdateConfig(node.id, 'unit', event.target.value)} className={inputClass}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></label></div>}
  </>;
}

function ExecutionHistory({ executions, onRefresh, onRetry }: { executions: Execution[]; onRefresh: () => void; onRetry: (executionId: string) => void }) {
  return <div className="min-h-[620px] bg-slate-50 p-4 md:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">Workflow runs</h2><p className="text-sm text-slate-500">Queued and completed executions, including retryable failures.</p></div><button onClick={onRefresh} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium">Refresh</button></div>{executions.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No workflow executions yet. Activate the workflow and use Run test to queue one.</div> : <div className="space-y-3">{executions.map((execution) => <article key={execution.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-medium text-slate-800">{execution.triggerType || 'Workflow event'}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${execution.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : execution.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{execution.status}</span></div><p className="mt-1 text-xs text-slate-500">{execution.startedAt || execution.createdAt ? new Date(execution.startedAt || execution.createdAt || '').toLocaleString() : 'Just now'}</p>{execution.error && <p className="mt-2 text-sm text-red-700">{execution.error}</p>}</div>{execution.status === 'failed' && <button onClick={() => onRetry(execution.id)} className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700">Retry</button>}</div>{execution.logs && execution.logs.length > 0 && <div className="mt-3 border-t border-slate-100 pt-3">{execution.logs.slice(0, 3).map((log) => <p key={log.id} className="text-sm text-slate-600"><span className="mr-2 text-xs font-semibold uppercase text-slate-400">{log.event || log.status || 'log'}</span>{log.message || 'Workflow step processed'}</p>)}</div>}</article>)}</div>}</div>;
}
