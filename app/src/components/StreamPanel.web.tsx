import { useEffect, useRef, useState } from 'react';
import { useT } from '../hooks/useT';
import { useColors } from '../hooks/useColors';
import { IconClose, IconMaximize, IconPictureInPicture, IconStop } from './Icon';

/** `own`: your shared screen, shown to you as a preview (no sound) with a stop button */
interface VideoStream { stream: MediaStream; screenname: string; own?: boolean }
interface Props {
  streams: Record<string, VideoStream>;
  onClose: (username: string) => void;
  /** Stop sharing your screen */
  onStopOwn?: () => void;
}

type CardMode = 'card' | 'floater' | 'hidden';

export function StreamPanel({ streams, onStopOwn }: Props) {
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
        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 8, background: '#0E0F12', padding: 8, minHeight: 180, flexShrink: 0 }}>
          {cardEntries.map(([username, { stream, screenname, own }]) =>
            (modes[username] ?? 'card') === 'hidden'
              ? <RewatchCard key={username} screenname={screenname} onRewatch={() => setMode(username, 'card')} />
              : <VideoCard
                  key={username}
                  screenname={screenname}
                  stream={stream}
                  onStop={own ? onStopOwn : undefined}
                  onPopOut={() => setMode(username, 'floater')}
                  onHide={() => setMode(username, 'hidden')}
                />
          )}
        </div>
      )}
      {floaterEntries.map(([username, { stream, screenname, own }]) => (
        <FloaterCard
          onStop={own ? onStopOwn : undefined}
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
    return () => { if (v) v.srcObject = null; };
  }, [stream, videoRef]);
}

function fullscreen(el: HTMLElement | null) {
  if (!el) return;
  const v = el as any;
  if (v.requestFullscreen) v.requestFullscreen();
  else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
  else if (v.mozRequestFullScreen) v.mozRequestFullScreen();
}

// Controls sit on top of video, so they stay dark in both themes
const btnStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.55)', border: 'none', color: 'white', cursor: 'pointer',
  width: 32, height: 32, borderRadius: 16, padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function VideoButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button style={btnStyle} onClick={onClick} title={label} aria-label={label}>{children}</button>;
}

/** On your own screen's preview: stop sharing it */
function StopButton({ onStop }: { onStop: () => void }) {
  const t = useT();
  return (
    <button onClick={onStop} title={t('stop-live')} aria-label={t('stop-live')}
      style={{ ...btnStyle, width: 'auto', padding: '0 12px', gap: 6, background: '#D93A3A', fontSize: 12, fontWeight: 800, fontFamily: 'inherit' }}>
      <IconStop size={12} color="#FFFFFF" />{t('stop-live')}
    </button>
  );
}

const liveBadge: React.CSSProperties = {
  background: '#D93A3A', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
};

// ── VideoCard (in-panel) ──────────────────────────────────────

function VideoCard({ screenname, stream, onStop, onPopOut, onHide }: {
  screenname: string; stream: MediaStream; onStop?: () => void; onPopOut: () => void; onHide: () => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoStream(videoRef, stream);
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 260, minHeight: 160, background: '#1A1C21', borderRadius: 16, overflow: 'hidden' }}>
      <video ref={videoRef} autoPlay playsInline muted={!!onStop} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      <div style={{ position: 'absolute', bottom: 10, left: 12, color: 'white', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
        <span style={liveBadge}>LIVE</span>
        {screenname}
      </div>
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
        {onStop && <StopButton onStop={onStop} />}
        <VideoButton label={t('stream-fullscreen')} onClick={() => fullscreen(videoRef.current)}><IconMaximize size={15} color="#FFFFFF" /></VideoButton>
        <VideoButton label={t('stream-pop-out')} onClick={onPopOut}><IconPictureInPicture size={15} color="#FFFFFF" /></VideoButton>
        <VideoButton label={t('close')} onClick={onHide}><IconClose size={13} color="#FFFFFF" /></VideoButton>
      </div>
    </div>
  );
}

// ── RewatchCard (shown after close) ──────────────────────────

function RewatchCard({ screenname, onRewatch }: { screenname: string; onRewatch: () => void }) {
  const t = useT();
  const c = useColors();
  return (
    <div style={{ flex: 1, minWidth: 200, minHeight: 80, background: '#1A1C21', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <span style={{ color: '#C9CDD6', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: '#E0625D' }} />{t('stream-live', { name: screenname })}</span>
      <button
        onClick={onRewatch}
        style={{ background: c.accent, border: 'none', color: c.onAccent, borderRadius: 999, padding: '7px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 800, fontFamily: 'inherit' }}
      >{t('stream-rewatch')}</button>
    </div>
  );
}

// ── FloaterCard (draggable overlay) ──────────────────────────

function FloaterCard({ screenname, stream, onStop, onPopIn }: {
  screenname: string; stream: MediaStream; onStop?: () => void; onPopIn: () => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoStream(videoRef, stream);

  const floaterRef = useRef<HTMLDivElement>(null);
  const listeners = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null);
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  function onMouseDown(e: React.MouseEvent) {
    const el = floaterRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { startX: e.clientX, startY: e.clientY, ox: r.left, oy: r.top };
    listeners.current = { move: onMouseMove, up: onMouseUp };
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

  // If unmounted mid-drag, detach the listeners that were actually attached
  useEffect(() => () => {
    const l = listeners.current;
    if (l) {
      window.removeEventListener('mousemove', l.move);
      window.removeEventListener('mouseup', l.up);
    }
  }, []);

  return (
    <div
      ref={floaterRef}
      style={{
        position: 'fixed', right: 20, bottom: 20, width: 320, height: 210,
        background: '#1A1C21', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div
        onMouseDown={onMouseDown}
        style={{ background: '#121418', padding: '6px 8px 6px 12px', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, userSelect: 'none' } as React.CSSProperties}
      >
        <span style={{ color: '#C9CDD6', fontSize: 13, fontWeight: 700 }}>{screenname}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {onStop && <StopButton onStop={onStop} />}
          <VideoButton label={t('stream-fullscreen')} onClick={() => fullscreen(videoRef.current)}><IconMaximize size={15} color="#FFFFFF" /></VideoButton>
          <VideoButton label={t('stream-pop-in')} onClick={onPopIn}><IconPictureInPicture size={15} color="#FFFFFF" /></VideoButton>
        </div>
      </div>
      <video ref={videoRef} autoPlay playsInline muted={!!onStop} style={{ flex: 1, width: '100%', objectFit: 'contain', background: '#000', display: 'block' }} />
    </div>
  );
}
