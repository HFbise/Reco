import { useEffect, useRef } from 'react';

interface VideoStream { stream: MediaStream; screenname: string; }
interface Props {
  streams: Record<string, VideoStream>;
  onClose: (username: string) => void;
}

export function StreamPanel({ streams, onClose }: Props) {
  const entries = Object.entries(streams);
  if (!entries.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'row', gap: 4, background: '#0e0e0e', padding: 4, minHeight: 160, flexShrink: 0 }}>
      {entries.map(([username, { stream, screenname }]) => (
        <VideoCard key={username} username={username} screenname={screenname} stream={stream} onClose={() => onClose(username)} />
      ))}
    </div>
  );
}

function VideoCard({ screenname, stream, onClose }: { username: string; screenname: string; stream: MediaStream; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
    return () => { if (videoRef.current) videoRef.current.srcObject = null; };
  }, [stream]);
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 200, background: '#1a1a1a', borderRadius: 6, overflow: 'hidden' }}>
      <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      <div style={{ position: 'absolute', bottom: 4, left: 6, color: 'white', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ background: 'rgba(220,38,38,0.9)', borderRadius: 3, padding: '1px 4px', fontSize: 10 }}>LIVE</span>
        {screenname}
      </div>
      <button onClick={onClose} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 12 }}>✕</button>
    </div>
  );
}
