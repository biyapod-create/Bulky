function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractEmailParts(content) {
  const raw = String(content || '');
  const styles = Array.from(raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
    .map((match) => match[1])
    .join('\n');

  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch
    ? bodyMatch[1]
    : raw
        .replace(/<!doctype[^>]*>/gi, '')
        .replace(/<\/?(html|head|body)[^>]*>/gi, '')
        .trim();

  return {
    styles,
    bodyContent: bodyContent || '<p style="color:#6b7280;">No content</p>'
  };
}

function buildEmailPreviewDocument({
  subject,
  content,
  fromName = 'Your Name',
  fromEmail = 'you@domain.com',
  clientLabel = 'Gmail',
  clientStyle = {}
}) {
  const { styles, bodyContent } = extractEmailParts(content);
  const safeSubject = escapeHtml(subject || 'No Subject');
  const safeFromName = escapeHtml(fromName);
  const safeFromEmail = escapeHtml(fromEmail);
  const safeClientLabel = escapeHtml(clientLabel);
  const fontFamily = clientStyle.fontFamily || 'Arial, sans-serif';
  const background = clientStyle.background || '#ffffff';
  const accent = clientStyle.accent || '#1a73e8';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeSubject}</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: ${background};
      font-family: ${fontFamily};
      color: #111827;
      overflow-x: hidden;
    }
    * {
      box-sizing: border-box;
    }
    .bulky-preview-shell {
      min-height: 100vh;
      padding: 20px;
      background: ${background};
      overflow-x: hidden;
    }
    .bulky-preview-card {
      max-width: 680px;
      width: 100%;
      margin: 0 auto;
      border-radius: 18px;
      overflow: hidden;
      background: #ffffff;
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
      border: 1px solid rgba(15, 23, 42, 0.08);
    }
    .bulky-preview-meta {
      padding: 18px 22px;
      border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      background: linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(255, 255, 255, 0.98));
    }
    .bulky-preview-client {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${accent};
      background: rgba(59, 130, 246, 0.08);
      padding: 6px 10px;
      border-radius: 999px;
      margin-bottom: 10px;
    }
    .bulky-preview-from {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 6px;
    }
    .bulky-preview-subject {
      font-size: 20px;
      line-height: 1.3;
      font-weight: 700;
      color: #111827;
      margin: 0;
      word-break: break-word;
    }
    .bulky-preview-body {
      padding: 24px;
      overflow-wrap: anywhere;
      overflow-x: hidden;
    }
    .bulky-preview-body img {
      max-width: 100%;
      height: auto;
    }
    .bulky-preview-body table {
      width: 100% !important;
      max-width: 100% !important;
    }
    .bulky-preview-body * {
      max-width: 100%;
    }
    @media (max-width: 640px) {
      .bulky-preview-shell {
        padding: 12px;
      }
      .bulky-preview-meta,
      .bulky-preview-body {
        padding: 16px;
      }
      .bulky-preview-subject {
        font-size: 18px;
      }
    }
    ${styles}
  </style>
</head>
<body>
  <div class="bulky-preview-shell">
    <div class="bulky-preview-card">
      <div class="bulky-preview-meta">
        <div class="bulky-preview-client">${safeClientLabel} preview</div>
        <div class="bulky-preview-from">From: ${safeFromName} &lt;${safeFromEmail}&gt;</div>
        <h1 class="bulky-preview-subject">${safeSubject}</h1>
      </div>
      <div class="bulky-preview-body">${bodyContent}</div>
    </div>
  </div>
</body>
</html>`;
}

function buildEmailPreviewUrl(options) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildEmailPreviewDocument(options))}`;
}

export {
  buildEmailPreviewDocument,
  buildEmailPreviewUrl
};
