import { useEffect, useRef, useState } from 'react';
import { useT } from '../hooks/useT';

interface VideoStream { stream: MediaStream; screenname: string; }
interface Props {
  streams: Record<string, VideoStream>;
  onClose: (username: string) => void;
}

type CardMode = 'card' | 'floater' | 'hidden';

export function StreamPanel({ streams }: Props) {
  const [modes, setModes] = useState<Record<string, CardMode>>({});

  // Sync modes when streams change: new streams default to 'card', removed streams drop out
  const streamKeys = Object.keys(streams).sort().join(',');
  useEffect(() => {
    setModes(prev => {
      const next: Record<string, CardMode> = {};
      for (const u of Object.keys(streams)) next[u] = prev[u] ?? 'card';
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamKeys]);

  const entries = Object.entries(streams);
  if (!entries.length) return null;

  const setMode = (u: string, m: CardMode) => setModes(prev => ({ ...prev, [u]: m }));
  const cardEntries = entries.filter(([u]) => (modes[u] ?? 'card') !== 'floater');
  const floaterEntries = entries.filter(([u]) => modes[u] === 'floater');

  return (
    <>
      {cardEntries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 4, background: '#0e0e0e', padding: 4, minHeight: 180, flexShrink: 0 }}>
          {cardEntries.map(([username, { stream, screenname }]) =>
            (modes[username] ?? 'card') === 'hidden'
              ? <RewatchCard key={username} screenname={screenname} onRewatch={() => setMode(username, 'card')} />
              : <VideoCard
                  key={username}
                  screenname={screenname}
                  stream={stream}
                  onPopOut={() => setMode(username, 'floater')}
                  onHide={() => setMode(username, 'hidden')}
                />
          )}
        </div>
      )}
      {floaterEntries.map(([username, { stream, screenname }]) => (
        <FloaterCard
          key={username}
          screenname={screenname}
          stream={stream}
          onPopIn={() => setMode(username, 'card')}
        />
      ))}
    </>
  );
}

// ── shared helpers ────────────────────────────────────────────

function useVideoStream(videoRef: React.RefObject<HTMLVideoElement | null>, stream: MediaStream) {
  useEffect(() => {
    const v = videoRef.current;
    if (v) { v.srcObject = stream; v.play().catch(() => {}); }
    return () => { if (videoRef.current) videoRef.current.srcObject = null; };
  }, [stream]);
}

function fullscreen(el: HTMLElement | null) {
  if (!el) return;
  const v = el as any;
  if (v.requestFullscreen) v.requestFullscreen();
  else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
  else if (v.mozRequestFullScreen) v.mozRequestFullScreen();
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.55)', border: 'none', color: 'white',
  borderRadius: 4, cursor: 'pointer', padding: '2px 7px', fontSize: 14, lineHeight: '1.6',
};

// ── VideoCard (in-panel) ──────────────────────────────────────

function VideoCard({ screenname, stream, onPopOut, onHide }: {
  screenname: string; stream: MediaStream; onPopOut: () => void; onHide: () => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoStream(videoRef, stream);
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 260, minHeight: 160, background: '#1a1a1a', borderRadius: 6, overflow: 'hidden' }}>
      <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      <div style={{ position: 'absolute', bottom: 6, left: 8, color: 'white', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, pointerEvents: 'none' }}>
        <span style={{ background: 'rgba(220,38,38,0.9)', borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 'bold' }}>LIVE</span>
        {screenname}
      </div>
      <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 4 }}>
        <button style={btnStyle} onClick={() => fullscreen(videoRef.current)} title={t('stream-fullscreen')}>⤢</button>
        <button style={btnStyle} onClick={onPopOut} title={t('stream-pop-out')}>⧉</button>
        <button style={btnStyle} onClick={onHide} title={t('close')}>✕</button>
      </div>
    </div>
  );
}

// ── RewatchCard (shown after close) ──────────────────────────

function RewatchCard({ screenname, onRewatch }: { screenname: string; onRewatch: () => void }) {
  const t = useT();
  return (
    <div style={{ flex: 1, minWidth: 200, minHeight: 80, background: '#1a1a1a', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <span style={{ color: '#bbb', fontSize: 13 }}>🔴 {t('stream-live', { name: screenname })}</span>
      <button
        onClick={onRewatch}
        style={{ background: '#4f8ef7', border: 'none', color: 'white', borderRadius: 5, padding: '5px 16px', cursor: 'pointer', fontSize: 13 }}
      >{t('stream-rewatch')}</button>
    </div>
  );
}

// ── FloaterCard (draggable overlay) ──────────────────────────

function FloaterCard({ screenname, stream, onPopIn }: {
  screenname: string; stream: MediaStream; onPopIn: () => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoStream(videoRef, stream);

  const floaterRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  function onMouseDown(e: React.MouseEvent) {
    const el = floaterRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { startX: e.clientX, startY: e.clientY, ox: r.left, oy: r.top };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent) {
    const d = drag.current; const el = floaterRef.current;
    if (!d || !el) return;
    el.style.left = (d.ox + e.clientX - d.startX) + 'px';
    el.style.top = (d.oy + e.clientY - d.startY) + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

  function onMouseUp() {
    drag.current = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  useEffect(() => () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div
      ref={floaterRef}
      style={{
        position: 'fixed', right: 20, bottom: 20, width: 320, height: 210,
        background: '#1a1a1a', borderRadius: 8, overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.7)', zIndex: 1000,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div
        onMouseDown={onMouseDown}
        style={{ background: '#111', padding: '5px 8px', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, userSelect: 'none' } as React.CSSProperties}
      >
        <span style={{ color: '#ccc', fontSize: 12 }}>{screenname}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={btnStyle} onClick={() => fullscreen(videoRef.current)} title={t('stream-fullscreen')}>⤢</button>
          <button style={btnStyle} onClick={onPopIn} title={t('stream-pop-in')}>⊡</button>
        </div>
      </div>
      <video ref={videoRef} autoPlay playsInline style={{ flex: 1, width: '100%', objectFit: 'contain', background: '#000', display: 'block' }} />
    </div>
  );
}
