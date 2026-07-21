import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { funnelApi } from '../services/api';
import { useWorkspaceStore } from '../store';
import type { Funnel } from '../types';

export function FunnelsPage() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspaceStore();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState<string>('sales');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (currentWorkspace?.id) loadFunnels();
  }, [currentWorkspace, status]);

  async function loadFunnels() {
    if (!currentWorkspace?.id) return;
    setLoading(true);
    try {
      const res = await funnelApi.list(currentWorkspace.id, { status: status || undefined, search: search || undefined });
      setFunnels(res.data.data.funnels);
    } catch {
      setMessage('Failed to load funnels');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!createName.trim() || !currentWorkspace?.id) return;
    try {
      const res = await funnelApi.create(currentWorkspace.id, { name: createName, funnelType: createType });
      setShowCreate(false);
      setCreateName('');
      navigate(`/funnels/${res.data.data.funnel.id}/builder`);
    } catch (err: any) {
      setMessage(err?.response?.data?.error || 'Failed to create funnel');
    }
  }

  async function handleDuplicate(funnelId: string) {
    if (!currentWorkspace?.id) return;
    try {
      await funnelApi.duplicate(currentWorkspace.id, funnelId);
      loadFunnels();
    } catch {
      setMessage('Failed to duplicate funnel');
    }
  }

  async function handleDelete(funnelId: string) {
    if (!currentWorkspace?.id || !confirm('Delete this funnel?')) return;
    try {
      await funnelApi.delete(currentWorkspace.id, funnelId);
      loadFunnels();
    } catch {
      setMessage('Failed to delete funnel');
    }
  }

  async function handlePublish(funnelId: string) {
    if (!currentWorkspace?.id) return;
    try {
      await funnelApi.publish(currentWorkspace.id, funnelId);
      loadFunnels();
    } catch {
      setMessage('Failed to publish funnel');
    }
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      published: 'bg-green-100 text-green-700',
      archived: 'bg-yellow-100 text-yellow-700',
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full font-medium ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
        {status}
      </span>
    );
  }

  const funnelTypes = [
    { value: 'sales', label: 'Sales Funnel' },
    { value: 'landing', label: 'Landing Page' },
    { value: 'webinar', label: 'Webinar' },
    { value: 'survey', label: 'Survey' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Funnels</h1>
              <p className="text-sm text-gray-500 mt-1">Build and manage your sales funnels</p>
            </div>
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Create Funnel
            </button>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <input
              type="text" placeholder="Search funnels..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </header>

      <main className="p-6">
        {message && (
          <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 rounded-lg flex items-center justify-between">
            <span>{message}</span>
            <button onClick={() => setMessage('')} className="text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
                <div className="h-4 bg-gray-200 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : funnels.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No funnels yet</h3>
            <p className="text-gray-500 mb-4">Create your first funnel to start building</p>
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Funnel</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {funnels.map((funnel) => (
              <div key={funnel.id} className="bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-shadow">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <Link to={`/funnels/${funnel.id}/builder`} className="text-lg font-semibold text-gray-900 hover:text-blue-600 truncate block">
                        {funnel.name}
                      </Link>
                      <p className="text-sm text-gray-500 mt-0.5 capitalize">{funnel.funnelType} Funnel</p>
                    </div>
                    {getStatusBadge(funnel.status)}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-500 mt-3">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                      {funnel._count?.pages || 0} pages
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                      {funnel._count?.analytics || 0} views
                    </span>
                  </div>

                  {funnel.publishedUrl && (
                    <a href={funnel.publishedUrl} target="_blank" rel="noopener noreferrer" className="mt-3 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      {funnel.publishedUrl}
                    </a>
                  )}
                </div>

                <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 rounded-b-xl flex items-center justify-between">
                  <div className="flex gap-1">
                    <Link to={`/funnels/${funnel.id}/builder`} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Edit">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </Link>
                    {!funnel.isPublished && (
                      <button onClick={() => handlePublish(funnel.id)} className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition" title="Publish">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                      </button>
                    )}
                    <button onClick={() => handleDuplicate(funnel.id)} className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition" title="Duplicate">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                    <Link to={`/funnels/${funnel.id}/analytics`} className="p-2 text-gray-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition" title="Analytics">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    </Link>
                  </div>
                  <button onClick={() => handleDelete(funnel.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Funnel</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Funnel Name</label>
                <input
                  type="text" value={createName} onChange={(e) => setCreateName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter funnel name" autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Funnel Type</label>
                <select value={createType} onChange={(e) => setCreateType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {funnelTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreate} disabled={!createName.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
