import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { funnelApi } from '../services/api';
import type { Funnel, FunnelPage, FunnelBlock } from '../types';

function PreviewBlock({ block }: { block: FunnelBlock }) {
  const c = block.content || {};
  const s = block.styles || {};

  switch (block.blockType) {
    case 'heading': {
      const H = (c.level || 'h2') as keyof JSX.IntrinsicElements;
      return <H style={{ textAlign: c.align as any, color: s.textColor }}>{c.text || 'Heading'}</H>;
    }
    case 'paragraph':
      return <p style={{ textAlign: c.align as any, color: s.textColor }}>{c.text || 'Paragraph'}</p>;
    case 'button':
      return (
        <div style={{ textAlign: c.align || 'center' }}>
          <a
            href={c.url || '#'}
            className="inline-block px-6 py-3 rounded-lg font-medium transition"
            style={{
              backgroundColor: c.variant === 'primary' ? '#2563EB' : c.variant === 'secondary' ? '#E5E7EB' : 'transparent',
              color: c.variant === 'primary' ? '#FFF' : c.variant === 'outline' ? '#2563EB' : '#111827',
              border: c.variant === 'outline' ? '2px solid #2563EB' : 'none',
            }}
          >
            {c.text || 'Button'}
          </a>
        </div>
      );
    case 'image':
      return c.src ? <img src={c.src} alt={c.alt || ''} style={{ maxWidth: '100%', height: 'auto' }} /> : null;
    case 'divider':
      return <hr style={{ borderColor: c.color, borderWidth: c.thickness, margin: '20px 0' }} />;
    case 'spacer':
      return <div style={{ height: c.height || 40 }} />;
    default:
      return <div className="py-4">{block.blockType} block</div>;
  }
}

export function FunnelPreviewPage() {
  const { funnelId } = useParams<{ funnelId: string }>();
  const navigate = useNavigate();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [currentPage, setCurrentPage] = useState<FunnelPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (funnelId) loadFunnel();
  }, [funnelId]);

  async function loadFunnel() {
    setLoading(true);
    try {
      const res = await funnelApi.get('', funnelId!);
      const data = res.data.data.funnel as Funnel;
      setFunnel(data);
      if (data.pages?.length) {
        setCurrentPage(data.pages.find(p => p.isHomePage) || data.pages[0]);
      }
    } catch {
      console.error('Failed to load funnel');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!funnel) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <h2 className="text-xl font-bold">Funnel not found</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-gray-50 border-b px-4 py-2 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/funnels/${funnelId}`)}
            className="p-1.5 hover:bg-gray-200 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-sm font-medium text-gray-700">Preview: {funnel.name}</h1>
          <span className="text-xs text-gray-500">· {funnel.funnelType}</span>
        </div>
        <div className="flex items-center gap-2">
          {funnel.pages?.map(p => (
            <button
              key={p.id}
              onClick={() => setCurrentPage(p)}
              className={`px-3 py-1 text-xs rounded-lg border ${
                currentPage?.id === p.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto py-8 px-4">
        {currentPage && currentPage.blocks?.length > 0 ? (
          <div className="space-y-4">
            {currentPage.blocks
              .filter(block => !block.isHidden)
              .map(block => (
                <div key={block.id}>
                  <PreviewBlock block={block} />
                </div>
              ))}
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400">
            <p>This page has no blocks yet.</p>
            <button
              onClick={() => navigate(`/funnels/${funnelId}`)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Edit Funnel
            </button>
          </div>
        )}
      </div>

      <div className="bg-gray-50 border-t px-4 py-3 text-center text-xs text-gray-500 sticky bottom-0">
        Preview Mode ·{' '}
        <button
          onClick={() => navigate(`/funnels/${funnelId}`)}
          className="text-blue-600 hover:underline"
        >
          Back to Editor
        </button>
      </div>
    </div>
  );
}
