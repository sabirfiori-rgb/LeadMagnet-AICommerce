import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { funnelApi } from '../services/api';
import { useWorkspaceStore } from '../store';
import type { Funnel, FunnelPage, FunnelBlock, BlockType } from '../types';

const BLOCK_DEFS: { type: BlockType; label: string; icon: string; category: string }[] = [
  { type: 'section', label: 'Section', icon: '⊞', category: 'Layout' },
  { type: 'container', label: 'Container', icon: '▢', category: 'Layout' },
  { type: 'columns', label: 'Columns', icon: '▥', category: 'Layout' },
  { type: 'heading', label: 'Heading', icon: 'H', category: 'Text' },
  { type: 'paragraph', label: 'Paragraph', icon: '¶', category: 'Text' },
  { type: 'image', label: 'Image', icon: '🖼', category: 'Media' },
  { type: 'button', label: 'Button', icon: '⬜', category: 'Actions' },
  { type: 'divider', label: 'Divider', icon: '—', category: 'Utility' },
  { type: 'spacer', label: 'Spacer', icon: '⤓', category: 'Utility' },
  { type: 'features', label: 'Features', icon: '✦', category: 'Marketing' },
  { type: 'pricing', label: 'Pricing', icon: '💲', category: 'Marketing' },
  { type: 'testimonials', label: 'Testimonials', icon: '💬', category: 'Marketing' },
  { type: 'faq', label: 'FAQ', icon: '❓', category: 'Marketing' },
  { type: 'countdown', label: 'Countdown', icon: '⏱', category: 'Marketing' },
  { type: 'navigation', label: 'Navigation', icon: '☰', category: 'Navigation' },
  { type: 'footer', label: 'Footer', icon: '⌄', category: 'Navigation' },
  { type: 'progress_bar', label: 'Progress', icon: '▤', category: 'Utility' },
  { type: 'social_icons', label: 'Social', icon: '🔗', category: 'Utility' },
  { type: 'team', label: 'Team', icon: '👥', category: 'Marketing' },
];

const DEFAULT_STYLES = { padding: { top: 20, right: 20, bottom: 20, left: 20 }, backgroundColor: '#FFFFFF', textColor: '#1F2937', fontSize: 16 };

const BLOCK_DEFAULTS: Record<string, any> = {
  heading: { content: { text: 'New Heading', level: 'h2', align: 'left' } },
  paragraph: { content: { text: 'Edit this paragraph text.', align: 'left' } },
  button: { content: { text: 'Click Here', url: '#', variant: 'primary', size: 'md', align: 'center' } },
  image: { content: { src: '', alt: 'Image' } },
  divider: { content: { style: 'solid', color: '#E5E7EB', thickness: 1 } },
  spacer: { content: { height: 40 } },
  features: { content: { items: [{ icon: '⭐', title: 'Feature', description: 'Description' }] } },
  pricing: { content: { plans: [{ name: 'Basic', price: '$9', period: '/mo', features: ['Feature'], buttonText: 'Get Started', highlighted: false }] } },
  testimonials: { content: { items: [{ name: 'John Doe', role: 'CEO', text: 'Amazing!', rating: 5 }] } },
  faq: { content: { items: [{ question: 'Question?', answer: 'Answer here...' }] } },
  countdown: { content: { endDate: '', label: 'Offer Ends In' } },
  navigation: { content: { logo: '', links: [{ label: 'Home', url: '#' }] } },
  footer: { content: { text: '© 2024 All rights reserved.' } },
  progress_bar: { content: { value: 50, max: 100, label: 'Progress', color: '#3B82F6' } },
  social_icons: { content: { platforms: ['facebook', 'twitter', 'instagram'], size: 24 } },
  team: { content: { members: [{ name: 'Name', role: 'Role' }] } },
  section: { content: { fullWidth: false, minHeight: 100 } },
  container: { content: { maxWidth: 1200, align: 'center' } },
  columns: { content: { columns: [{ width: '50%' }, { width: '50%' }], gap: 20 } },
};

function BlockPreview({ block }: { block: FunnelBlock }) {
  const c = block.content || {};
  switch (block.blockType) {
    case 'heading': {
      const H = (c.level || 'h2') as keyof JSX.IntrinsicElements;
      return <H style={{ textAlign: c.align }}>{c.text || 'Heading'}</H>;
    }
    case 'paragraph':
      return <p style={{ textAlign: c.align }}>{c.text || 'Paragraph'}</p>;
    case 'button':
      return <div style={{ textAlign: c.align || 'center' }}><button className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium">{c.text || 'Button'}</button></div>;
    case 'image':
      return c.src ? <img src={c.src} alt="" style={{ maxWidth: '100%' }} /> : <div className="bg-gray-100 h-48 rounded flex items-center justify-center text-gray-400">Image</div>;
    case 'divider':
      return <hr style={{ borderColor: c.color, borderWidth: c.thickness, margin: '20px 0' }} />;
    case 'spacer':
      return <div style={{ height: c.height || 40 }} />;
    case 'features':
      return <div className="grid grid-cols-3 gap-6">{(c.items || []).map((item: any, i: number) => <div key={i} className="text-center p-4"><div className="text-2xl mb-2">{item.icon}</div><h3 className="font-semibold">{item.title}</h3><p className="text-sm text-gray-500 mt-1">{item.description}</p></div>)}</div>;
    case 'pricing':
      return <div className="grid grid-cols-3 gap-6">{(c.plans || []).map((p: any, i: number) => <div key={i} className={`rounded-xl p-6 border ${p.highlighted ? 'border-blue-500 bg-blue-50' : ''}`}><h3 className="text-lg font-bold">{p.name}</h3><div className="mt-2"><span className="text-3xl font-bold">{p.price}</span><span className="text-gray-500">{p.period}</span></div><button className="mt-4 w-full py-2 bg-blue-600 text-white rounded-lg">{p.buttonText}</button></div>)}</div>;
    case 'testimonials':
      return <div className="space-y-4">{(c.items || []).map((item: any, i: number) => <div key={i} className="bg-gray-50 rounded-xl p-6 border"><p className="font-medium">{item.name}</p><p className="text-sm text-gray-500">{item.role}</p><p className="mt-2 text-gray-700 italic">"{item.text}"</p></div>)}</div>;
    case 'faq':
      return <div className="space-y-3">{(c.items || []).map((item: any, i: number) => <details key={i} className="bg-white rounded-lg border"><summary className="px-4 py-3 font-medium cursor-pointer">{item.question}</summary><p className="px-4 pb-3 text-gray-600">{item.answer}</p></details>)}</div>;
    case 'countdown':
      return <div className="text-center p-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white"><p className="text-lg font-semibold mb-2">{c.label}</p><div className="flex justify-center gap-4 text-3xl font-bold"><span>12h</span><span>30m</span><span>45s</span></div></div>;
    case 'navigation':
      return <nav className="flex items-center justify-between px-6 py-3 bg-white border-b"><span className="text-xl font-bold">Logo</span><div className="flex gap-4">{(c.links || []).map((l: any, i: number) => <a key={i} href={l.url} className="text-sm text-gray-600">{l.label}</a>)}</div></nav>;
    case 'footer':
      return <footer className="bg-gray-900 text-white px-6 py-8"><p className="text-sm text-gray-400 text-center">{c.text}</p></footer>;
    case 'progress_bar':
      return <div><div className="text-sm text-gray-600 mb-1">{c.label} {c.value}/{c.max}</div><div className="bg-gray-200 rounded-full h-2"><div className="rounded-full h-full" style={{ width: `${(c.value/c.max)*100}%`, backgroundColor: c.color }} /></div></div>;
    case 'social_icons':
      return <div className="flex justify-center gap-3">{(c.platforms || []).map((p: string, i: number) => <span key={i} className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full text-sm font-bold">{p[0].toUpperCase()}</span>)}</div>;
    case 'team':
      return <div className="grid grid-cols-3 gap-6">{(c.members || []).map((m: any, i: number) => <div key={i} className="text-center"><div className="w-20 h-20 mx-auto bg-gray-200 rounded-full" /><h3 className="mt-3 font-semibold">{m.name}</h3><p className="text-sm text-gray-500">{m.role}</p></div>)}</div>;
    default:
      return <div className="flex items-center justify-center h-16 bg-gray-50 rounded border border-dashed text-sm text-gray-400 capitalize">{block.blockType} Block</div>;
  }
}

export function FunnelBuilderPage() {
  const { funnelId } = useParams<{ funnelId: string }>();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspaceStore();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [currentPage, setCurrentPage] = useState<FunnelPage | null>(null);
  const [blocks, setBlocks] = useState<FunnelBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [showBlocks, setShowBlocks] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { if (currentWorkspace?.id && funnelId) loadFunnel(); }, [funnelId, currentWorkspace]);

  async function loadFunnel() {
    if (!currentWorkspace?.id || !funnelId) return;
    setLoading(true);
    try {
      const res = await funnelApi.get(currentWorkspace.id, funnelId);
      const data = res.data.data.funnel as Funnel;
      setFunnel(data);
      if (data.pages?.length) {
        const hp = data.pages.find(p => p.isHomePage) || data.pages[0];
        setCurrentPage(hp);
        setBlocks(hp.blocks || []);
      }
    } catch { setMsg('Failed to load'); } finally { setLoading(false); }
  }

  function addBlock(type: BlockType) {
    if (!currentPage) return;
    const def = BLOCK_DEFAULTS[type] || { content: {} };
    const b: FunnelBlock = {
      id: `new-${Date.now()}`,
      pageId: currentPage.id,
      parentId: null,
      blockType: type,
      blockName: BLOCK_DEFS.find(d => d.type === type)?.label || type,
      content: def.content || {},
      styles: { ...DEFAULT_STYLES },
      responsiveStyles: {},
      animation: {},
      visibility: {},
      sortOrder: blocks.length,
      isHidden: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      children: [],
    };
    setBlocks(prev => [...prev, b]);
    setSelectedBlock(b.id);
  }

  function updateBlock(blockId: string, updates: Partial<FunnelBlock>) {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b));
    if (!blockId.startsWith('new-') && currentWorkspace?.id && funnelId && currentPage) {
      funnelApi.updateBlock(currentWorkspace.id, funnelId, currentPage.id, blockId, updates).catch(() => setMsg('Update failed'));
    }
  }

  function deleteBlock(blockId: string) {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    setSelectedBlock(null);
    if (!blockId.startsWith('new-') && currentWorkspace?.id && funnelId && currentPage) {
      funnelApi.deleteBlock(currentWorkspace.id, funnelId, currentPage.id, blockId).catch(() => setMsg('Delete failed'));
    }
  }

  function moveBlock(blockId: string, direction: 'up' | 'down') {
    const idx = blocks.findIndex(b => b.id === blockId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    const arr = [...blocks];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    arr.forEach((b, i) => b.sortOrder = i);
    setBlocks(arr);
    if (currentWorkspace?.id && funnelId && currentPage) {
      funnelApi.reorderBlocks(currentWorkspace.id, funnelId, currentPage.id, arr.map(b => ({ id: b.id, sortOrder: b.sortOrder }))).catch(() => {});
    }
  }

  function handleDragStart(e: React.DragEvent, type: BlockType) {
    e.dataTransfer.setData('text/plain', type);
    setIsDragging(true);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const type = e.dataTransfer.getData('text/plain') as BlockType;
    if (BLOCK_DEFS.some(d => d.type === type)) addBlock(type);
  }

  if (loading) {
    return <div className="h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /><p className="ml-3 text-gray-500">Loading...</p></div>;
  }

  if (!funnel) {
    return <div className="h-screen flex items-center justify-center"><h2 className="text-xl font-bold">Funnel not found</h2><button onClick={() => navigate('/funnels')} className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg">Back</button></div>;
  }

  const categories = [...new Set(BLOCK_DEFS.map(b => b.category))];

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/funnels')} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">{funnel.name}</h1>
          <span className="text-xs text-gray-500 capitalize">· {funnel.funnelType} v{funnel.version}</span>
        </div>
        <div className="flex items-center gap-2">
          <select value={currentPage?.id || ''} onChange={(e) => {
            const p = funnel.pages?.find(x => x.id === e.target.value);
            if (p) { setCurrentPage(p); setBlocks(p.blocks || []); }
          }} className="px-3 py-1.5 border rounded-lg text-sm">
            {funnel.pages?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => setShowBlocks(!showBlocks)} className={`px-3 py-1.5 text-sm rounded-lg border ${showBlocks ? 'bg-blue-50 border-blue-300 text-blue-700' : 'text-gray-700'}`}>Blocks</button>
          <button onClick={() => navigate(`/funnels/${funnelId}/preview`)} className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">Preview</button>
        </div>
      </header>

      {msg && <div className="px-4 py-2 bg-red-50 text-red-700 text-sm">{msg}</div>}

      <div className="flex-1 flex overflow-hidden">
        {showBlocks && (
          <div className="w-60 bg-white border-r overflow-y-auto p-3">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Blocks</h3>
            {categories.map(cat => (
              <div key={cat} className="mb-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">{cat}</h4>
                <div className="space-y-1">
                  {BLOCK_DEFS.filter(d => d.category === cat).map(def => (
                    <button key={def.type} draggable onDragStart={(e) => handleDragStart(e, def.type)} onClick={() => addBlock(def.type)}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-gray-100 text-left">
                      <span className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded text-sm">{def.icon}</span>
                      <span className="text-sm text-gray-700">{def.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={`flex-1 overflow-y-auto p-8 ${isDragging ? 'bg-blue-50' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}>
          <div className="max-w-4xl mx-auto">
            {!currentPage ? (
              <div className="text-center py-20">
                <h3 className="text-lg font-medium mb-2">No pages yet</h3>
                <button onClick={() => {
                  if (!currentWorkspace?.id || !funnelId) return;
                  funnelApi.createPage(currentWorkspace.id, funnelId, { name: 'Home', pageType: 'landing', isHomePage: true }).then(() => loadFunnel());
                }} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Add Page</button>
              </div>
            ) : blocks.length === 0 ? (
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-16 text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-1">Start building</h3>
                <p className="text-sm text-gray-500 mb-4">Drag blocks from the palette</p>
                <button onClick={() => addBlock('heading')} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Add Heading</button>
              </div>
            ) : (
              <div className="space-y-3">
                {blocks.map(block => (
                  <div key={block.id} className={`relative group border rounded-xl transition-all ${selectedBlock === block.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}
                    onClick={() => setSelectedBlock(block.id)}>
                    <div className={`p-4 ${block.isHidden ? 'opacity-40' : ''}`}>
                      <div className="absolute -top-3 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition z-10">
                        <span className="text-xs px-2 py-0.5 rounded border bg-white text-gray-500">{block.blockType}</span>
                        <button onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'up'); }} className="p-1 bg-white border rounded hover:bg-gray-100" title="Move up">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'down'); }} className="p-1 bg-white border rounded hover:bg-gray-100" title="Move down">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); updateBlock(block.id, { isHidden: !block.isHidden }); }} className={`p-1 border rounded ${block.isHidden ? 'bg-yellow-100' : 'bg-white hover:bg-gray-100'}`} title="Toggle visibility">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={block.isHidden ? "M15 12a3 3 0 11-6 0 3 3 0 016 0z" : "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7"} /></svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteBlock(block.id); }} className="p-1 bg-white border rounded hover:bg-red-50 text-red-500" title="Delete">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <BlockPreview block={block} />
                    </div>
                    {selectedBlock === block.id && !block.isHidden && ['heading', 'paragraph', 'button', 'image'].includes(block.blockType) && (
                      <div className="flex items-center gap-2 p-3 border-t bg-gray-50 rounded-b-xl">
                        {block.blockType === 'heading' && (
                          <>
                            <select value={block.content?.level || 'h2'} onChange={(e) => updateBlock(block.id, { content: { ...block.content, level: e.target.value } })} className="text-xs px-2 py-1 border rounded">
                              <option value="h1">H1</option><option value="h2">H2</option><option value="h3">H3</option>
                            </select>
                            <input type="text" value={block.content?.text || ''} onChange={(e) => updateBlock(block.id, { content: { ...block.content, text: e.target.value } })} className="text-xs px-2 py-1 border rounded flex-1" placeholder="Heading text" />
                          </>
                        )}
                        {block.blockType === 'paragraph' && (
                          <textarea value={block.content?.text || ''} onChange={(e) => updateBlock(block.id, { content: { ...block.content, text: e.target.value } })} className="text-xs px-2 py-1 border rounded w-full" rows={2} placeholder="Paragraph text" />
                        )}
                        {block.blockType === 'button' && (
                          <>
                            <input type="text" value={block.content?.text || ''} onChange={(e) => updateBlock(block.id, { content: { ...block.content, text: e.target.value } })} className="text-xs px-2 py-1 border rounded flex-1" placeholder="Button text" />
                            <select value={block.content?.variant || 'primary'} onChange={(e) => updateBlock(block.id, { content: { ...block.content, variant: e.target.value } })} className="text-xs px-2 py-1 border rounded">
                              <option value="primary">Primary</option><option value="secondary">Secondary</option><option value="outline">Outline</option>
                            </select>
                          </>
                        )}
                        {block.blockType === 'image' && (
                          <input type="text" value={block.content?.src || ''} onChange={(e) => updateBlock(block.id, { content: { ...block.content, src: e.target.value } })} className="text-xs px-2 py-1 border rounded w-full" placeholder="Image URL" />
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex justify-center py-4">
                  <button onClick={() => addBlock('section')} className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200">+ Add Block</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
