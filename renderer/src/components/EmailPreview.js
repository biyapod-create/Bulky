import React, { useMemo, useState } from 'react';
import { Monitor, Smartphone, Tablet, X } from 'lucide-react';
import { buildEmailPreviewDocument } from '../utils/emailPreview';

const DEVICES = [
  { id: 'desktop', label: 'Desktop', icon: Monitor,    width: '100%',  maxWidth: '900px',  viewport: 'width=device-width' },
  { id: 'tablet',  label: 'Tablet',  icon: Tablet,     width: '768px', maxWidth: '768px',  viewport: 'width=768'          },
  { id: 'mobile',  label: 'Mobile',  icon: Smartphone, width: '375px', maxWidth: '375px',  viewport: 'width=375'          },
];

const CLIENT_STYLES = {
  gmail:   { fontFamily: 'Arial, sans-serif',                        background: '#eef3f8', accent: '#1a73e8', label: 'Gmail'      },
  outlook: { fontFamily: 'Calibri, sans-serif',                      background: '#eef2f7', accent: '#2563eb', label: 'Outlook'    },
  apple:   { fontFamily: '-apple-system, Helvetica Neue, sans-serif', background: '#f5f5f7', accent: '#111827', label: 'Apple Mail' },
};

/**
 * Build the srcDoc for the preview iframe.
 *
 * Desktop: uses the full email-client simulation shell (font, background, chrome)
 *          so you can see how the email looks inside Gmail / Outlook / Apple Mail.
 *
 * Mobile / Tablet: renders the raw email HTML directly with NO wrapper shell.
 *          This is the only way to see genuine responsive reflow — the wrapper
 *          shell's own max-width / padding would interfere with the email's layout.
 *          We still inject the client font-family into the body so you can compare
 *          how the fonts differ between clients at that viewport size.
 */
function buildSrcDoc(device, deviceConfig, clientStyle, subject, content, fromName, fromEmail) {
  if (device !== 'desktop') {
    const raw = String(content || '');
    const isFullDoc = /<html[\s>]/i.test(raw);

    if (isFullDoc) {
      // Inject viewport + client font into the existing document without stripping anything
      let doc = raw;
      if (/<meta[^>]*name=["']viewport["'][^>]*>/i.test(doc)) {
        doc = doc.replace(
          /<meta[^>]*name=["']viewport["'][^>]*>/i,
          `<meta name="viewport" content="${deviceConfig.viewport}, initial-scale=1" />`
        );
      } else {
        doc = doc.replace(/<head([^>]*)>/i, `<head$1>\n  <meta name="viewport" content="${deviceConfig.viewport}, initial-scale=1" />`);
      }
      // Inject client font into body without overwriting existing inline styles
      doc = doc.replace(/<body([^>]*?)>/i, (match, attrs) => {
        const hasStyle = /style\s*=/i.test(attrs);
        if (hasStyle) {
          return match.replace(/style\s*=\s*["']([^"']*)["']/i, `style="font-family:${clientStyle.fontFamily};$1"`);
        }
        return `<body${attrs} style="font-family:${clientStyle.fontFamily};margin:0;padding:0;">`;
      });
      return doc;
    }

    // Fragment — wrap minimally, no chrome
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="${deviceConfig.viewport}, initial-scale=1" />
  <style>
    body { margin: 0; padding: 0; font-family: ${clientStyle.fontFamily}; background: #ffffff; }
    img  { max-width: 100%; height: auto; }
    table { max-width: 100% !important; }
  </style>
</head>
<body>${raw}</body>
</html>`;
  }

  // Desktop: full simulation shell, then override viewport meta
  const doc = buildEmailPreviewDocument({ subject, content, fromName, fromEmail, clientLabel: clientStyle.label, clientStyle });
  return doc.replace(
    /<meta name="viewport"[^>]*>/i,
    `<meta name="viewport" content="${deviceConfig.viewport}" />`
  );
}

function EmailPreview({ subject, content, fromName = 'Sender', fromEmail = 'sender@example.com', onClose }) {
  const [device, setDevice] = useState('desktop');
  const [client, setClient] = useState('gmail');
  const [frameHeight, setFrameHeight] = useState(720);

  const deviceConfig = DEVICES.find(d => d.id === device);
  const clientStyle  = CLIENT_STYLES[client] || CLIENT_STYLES.gmail;

  const srcDoc = useMemo(
    () => buildSrcDoc(device, deviceConfig, clientStyle, subject, content, fromName, fromEmail),
    [device, deviceConfig, clientStyle, subject, content, fromName, fromEmail]
  );

  const handleFrameLoad = (event) => {
    try {
      const iframe = event.target;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      const nextHeight = Math.max(
        doc.documentElement?.scrollHeight || 0,
        doc.body?.scrollHeight || 0,
        device === 'mobile' ? 667 : device === 'tablet' ? 920 : 600
      );
      setFrameHeight(nextHeight);
    } catch {
      setFrameHeight(device === 'mobile' ? 667 : device === 'tablet' ? 920 : 600);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 20px', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '14px', marginRight: '8px' }}>Client Preview</span>

          {/* Device buttons */}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '4px' }}>Device:</span>
          {DEVICES.map(d => {
            const Icon = d.icon;
            return (
              <button key={d.id} onClick={() => setDevice(d.id)}
                      className={`btn btn-sm ${device === d.id ? 'btn-primary' : 'btn-outline'}`}
                      title={d.id === 'mobile' || d.id === 'tablet' ? 'Raw email view — no shell wrapper — for accurate responsive testing' : ''}>
                <Icon size={13} /> {d.label}
                {d.id !== 'desktop' && <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: '2px' }}>({d.maxWidth})</span>}
              </button>
            );
          })}

          <span style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 6px' }} />

          {/* Client buttons */}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '4px' }}>Client:</span>
          {['gmail', 'outlook', 'apple'].map(c => (
            <button key={c} onClick={() => setClient(c)}
                    className={`btn btn-sm ${client === c ? 'btn-primary' : 'btn-outline'}`}>
              {c === 'apple' ? 'Apple Mail' : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          {device !== 'desktop' && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Raw email — responsive view
            </span>
          )}
          <button onClick={onClose} className="btn btn-outline btn-sm"><X size={14} /></button>
        </div>
      </div>

      {/* ── Preview canvas ── */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
                    padding: '24px', overflow: 'auto', background: '#1e1e1e' }}>

        {/* Device frame */}
        <div style={{
          width: deviceConfig.maxWidth,
          maxWidth: deviceConfig.maxWidth,
          flexShrink: 0,
          background: clientStyle.background,
          borderRadius: device === 'mobile' ? '24px' : device === 'tablet' ? '16px' : '8px',
          overflow: 'hidden',
          // clip wide email tables to the device viewport
          boxShadow: device === 'desktop'
            ? '0 4px 24px rgba(0,0,0,0.4)'
            : '0 0 0 8px #2d2d2d, 0 0 0 10px #444, 0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {/*
            key={device+client} forces iframe remount on every button click.
            srcDoc (not src=data:) guarantees Chromium re-renders the new document.
            On mobile/tablet the email renders raw (no preview shell) so CSS media
            queries and viewport-relative units respond to the true device width.
          */}
          <iframe
            key={device + '-' + client}
            title="Email Preview"
            srcDoc={srcDoc}
            onLoad={handleFrameLoad}
            style={{
              // width must be set to the exact device pixel width so the
              // email's CSS media queries fire at the right breakpoints.
              width: deviceConfig.maxWidth,
              maxWidth: '100%',
              minHeight: device === 'mobile' ? '667px' : device === 'tablet' ? '920px' : '600px',
              height: `${frameHeight}px`,
              border: 'none',
              display: 'block',
            }}
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}

export default EmailPreview;
