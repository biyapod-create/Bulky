import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Type, Image, Square, Minus, ArrowUpDown, Columns, Share2,
  AlignLeft, Trash2, Copy, GripVertical, Plus, Settings, ChevronUp, ChevronDown, Monitor, Smartphone
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Block definitions
// ---------------------------------------------------------------------------

const BLOCK_TYPES = [
  { type: 'header',  label: 'Header',       icon: Type,        description: 'Logo + heading text' },
  { type: 'text',    label: 'Text',         icon: AlignLeft,   description: 'Rich text paragraph' },
  { type: 'image',   label: 'Image',        icon: Image,       description: 'Image with alt text' },
  { type: 'button',  label: 'Button',       icon: Square,      description: 'CTA button' },
  { type: 'divider', label: 'Divider',      icon: Minus,       description: 'Horizontal line' },
  { type: 'spacer',  label: 'Spacer',       icon: ArrowUpDown, description: 'Vertical space' },
  { type: 'columns', label: 'Columns',      icon: Columns,     description: '2 or 3 column layout' },
  { type: 'social',  label: 'Social Links', icon: Share2,      description: 'Social media icons' },
  { type: 'footer',  label: 'Footer',       icon: Settings,    description: 'Unsubscribe + address' },
];

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultBlockData(type) {
  switch (type) {
    case 'header':
      return {
        logoUrl: '',
        text: 'Your Company',
        fontSize: 28,
        color: '#333333',
        alignment: 'center',
        backgroundColor: '#ffffff',
        padding: 20,
      };
    case 'text':
      return {
        content: '<p>Write your text here...</p>',
        fontSize: 16,
        color: '#333333',
        alignment: 'left',
        padding: 16,
        lineHeight: 1.6,
      };
    case 'image':
      return {
        src: '',
        alt: 'Image',
        width: '100%',
        alignment: 'center',
        padding: 10,
      };
    case 'button':
      return {
        text: 'Click Here',
        url: '#',
        backgroundColor: '#5bb4d4',
        textColor: '#ffffff',
        borderRadius: 4,
        alignment: 'center',
        fontSize: 16,
        padding: 20,
        paddingH: 32,
        paddingV: 12,
      };
    case 'divider':
      return {
        color: '#cccccc',
        thickness: 1,
        width: '100%',
        padding: 16,
        style: 'solid',
      };
    case 'spacer':
      return { height: 32 };
    case 'columns':
      return {
        count: 2,
        padding: 10,
        contents: ['Column 1 content', 'Column 2 content'],
      };
    case 'social':
      return {
        alignment: 'center',
        padding: 16,
        iconSize: 32,
        links: [
          { platform: 'facebook',  url: '#' },
          { platform: 'twitter',   url: '#' },
          { platform: 'instagram', url: '#' },
          { platform: 'linkedin',  url: '#' },
        ],
      };
    case 'footer':
      return {
        content: '© 2026 Your Company. All rights reserved.',
        unsubscribeText: 'Unsubscribe',
        unsubscribeUrl: '{{unsubscribe_url}}',
        address: '123 Main St, City, State 12345',
        fontSize: 12,
        color: '#999999',
        alignment: 'center',
        padding: 20,
      };
    default:
      return {};
  }
}

function createBlock(type) {
  return { id: createId(), type, data: defaultBlockData(type) };
}

// ---------------------------------------------------------------------------
// HTML generation helpers
// ---------------------------------------------------------------------------

function generateBlockHtml(block) {
  const { type, data } = block;

  switch (type) {
    case 'header': {
      const logoHtml = data.logoUrl
        ? `<img src="${data.logoUrl}" alt="Logo" style="max-height:60px;margin-bottom:10px;" /><br/>`
        : '';
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${data.backgroundColor};">
  <tr><td align="${data.alignment}" style="padding:${data.padding}px;">
    ${logoHtml}<span style="font-size:${data.fontSize}px;color:${data.color};font-family:Arial,sans-serif;font-weight:bold;">${data.text}</span>
  </td></tr>
</table>`;
    }

    case 'text':
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="${data.alignment}" style="padding:${data.padding}px;font-size:${data.fontSize}px;color:${data.color};font-family:Arial,sans-serif;line-height:${data.lineHeight};">
    ${data.content}
  </td></tr>
</table>`;

    case 'image':
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="${data.alignment}" style="padding:${data.padding}px;">
    <img src="${data.src}" alt="${data.alt}" style="width:${data.width};max-width:100%;height:auto;display:block;" />
  </td></tr>
</table>`;

    case 'button':
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="${data.alignment}" style="padding:${data.padding}px;">
    <table cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" style="background-color:${data.backgroundColor};border-radius:${data.borderRadius}px;">
        <a href="${data.url}" target="_blank" style="display:inline-block;padding:${data.paddingV}px ${data.paddingH}px;font-size:${data.fontSize}px;color:${data.textColor};font-family:Arial,sans-serif;text-decoration:none;font-weight:bold;">${data.text}</a>
      </td></tr>
    </table>
  </td></tr>
</table>`;

    case 'divider':
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="padding:${data.padding}px 0;">
    <table width="${data.width}" cellpadding="0" cellspacing="0" border="0" align="center">
      <tr><td style="border-top:${data.thickness}px ${data.style} ${data.color};font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
  </td></tr>
</table>`;

    case 'spacer':
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td style="height:${data.height}px;font-size:0;line-height:0;">&nbsp;</td></tr>
</table>`;

    case 'columns': {
      const colWidth = Math.floor(100 / data.count);
      const cols = (data.contents || []).slice(0, data.count).map(
        (c) => `<td width="${colWidth}%" valign="top" style="padding:${data.padding}px;font-size:14px;color:#333333;font-family:Arial,sans-serif;">${c}</td>`
      ).join('\n      ');
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
      ${cols}
  </tr>
</table>`;
    }

    case 'social': {
      const icons = (data.links || []).map(l => {
        const label = l.platform.charAt(0).toUpperCase() + l.platform.slice(1);
        return `<td align="center" style="padding:0 8px;">
        <a href="${l.url}" target="_blank" style="color:#5bb4d4;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;">${label}</a>
      </td>`;
      }).join('\n      ');
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="${data.alignment}" style="padding:${data.padding}px;">
    <table cellpadding="0" cellspacing="0" border="0" align="${data.alignment}">
      <tr>
      ${icons}
      </tr>
    </table>
  </td></tr>
</table>`;
    }

    case 'footer':
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="${data.alignment}" style="padding:${data.padding}px;font-size:${data.fontSize}px;color:${data.color};font-family:Arial,sans-serif;line-height:1.6;">
    ${data.content}<br/>
    <a href="${data.unsubscribeUrl}" style="color:${data.color};text-decoration:underline;">${data.unsubscribeText}</a><br/>
    ${data.address}
  </td></tr>
</table>`;

    default:
      return '';
  }
}

function generateFullHtml(blocks) {
  const inner = blocks.map(generateBlockHtml).join('\n');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Email</title>
<!--[if mso]>
<style>table{border-collapse:collapse;}td{font-family:Arial,sans-serif;}</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;max-width:600px;width:100%;">
      <tr><td>
${inner}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Property editors per block type
// ---------------------------------------------------------------------------

function PropertyField({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: 'block',
        marginBottom: 4,
        fontSize: 12,
        color: 'var(--text-secondary)',
        fontWeight: 500,
      }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontSize: 13,
  boxSizing: 'border-box',
};

const selectStyle = { ...inputStyle, cursor: 'pointer' };

const colorInputStyle = {
  width: 32,
  height: 32,
  padding: 0,
  border: '1px solid var(--border)',
  borderRadius: 4,
  cursor: 'pointer',
  background: 'none',
};

function PropertyPanel({ block, onChange }) {
  if (!block) {
    return (
      <div style={{ padding: 20, color: 'var(--text-secondary)', textAlign: 'center', fontSize: 13 }}>
        Select a block to edit its properties
      </div>
    );
  }

  const update = (key, value) => {
    onChange({ ...block, data: { ...block.data, [key]: value } });
  };

  const { type, data } = block;

  return (
    <div style={{ padding: 12 }}>
      <h4 style={{
        margin: '0 0 16px',
        fontSize: 14,
        color: 'var(--text-primary)',
        textTransform: 'capitalize',
        borderBottom: '1px solid var(--border)',
        paddingBottom: 8,
      }}>{type} Properties</h4>

      {/* ----- HEADER ----- */}
      {type === 'header' && <>
        <PropertyField label="Logo URL">
          <input style={inputStyle} value={data.logoUrl} onChange={e => update('logoUrl', e.target.value)} placeholder="https://..." />
        </PropertyField>
        <PropertyField label="Heading Text">
          <input style={inputStyle} value={data.text} onChange={e => update('text', e.target.value)} />
        </PropertyField>
        <PropertyField label="Font Size">
          <input style={inputStyle} type="number" min={12} max={72} value={data.fontSize} onChange={e => update('fontSize', Number(e.target.value))} />
        </PropertyField>
        <PropertyField label="Text Color">
          <input type="color" style={colorInputStyle} value={data.color} onChange={e => update('color', e.target.value)} />
        </PropertyField>
        <PropertyField label="Background Color">
          <input type="color" style={colorInputStyle} value={data.backgroundColor} onChange={e => update('backgroundColor', e.target.value)} />
        </PropertyField>
        <PropertyField label="Alignment">
          <select style={selectStyle} value={data.alignment} onChange={e => update('alignment', e.target.value)}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
        </PropertyField>
        <PropertyField label="Padding">
          <input style={inputStyle} type="number" min={0} max={80} value={data.padding} onChange={e => update('padding', Number(e.target.value))} />
        </PropertyField>
      </>}

      {/* ----- TEXT ----- */}
      {type === 'text' && <>
        <PropertyField label="Content">
          <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={data.content} onChange={e => update('content', e.target.value)} />
        </PropertyField>
        <PropertyField label="Font Size">
          <input style={inputStyle} type="number" min={10} max={48} value={data.fontSize} onChange={e => update('fontSize', Number(e.target.value))} />
        </PropertyField>
        <PropertyField label="Color">
          <input type="color" style={colorInputStyle} value={data.color} onChange={e => update('color', e.target.value)} />
        </PropertyField>
        <PropertyField label="Alignment">
          <select style={selectStyle} value={data.alignment} onChange={e => update('alignment', e.target.value)}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
        </PropertyField>
        <PropertyField label="Line Height">
          <input style={inputStyle} type="number" min={1} max={3} step={0.1} value={data.lineHeight} onChange={e => update('lineHeight', Number(e.target.value))} />
        </PropertyField>
        <PropertyField label="Padding">
          <input style={inputStyle} type="number" min={0} max={80} value={data.padding} onChange={e => update('padding', Number(e.target.value))} />
        </PropertyField>
      </>}

      {/* ----- IMAGE ----- */}
      {type === 'image' && <>
        <PropertyField label="Image URL">
          <input style={inputStyle} value={data.src} onChange={e => update('src', e.target.value)} placeholder="https://..." />
        </PropertyField>
        <PropertyField label="Alt Text">
          <input style={inputStyle} value={data.alt} onChange={e => update('alt', e.target.value)} />
        </PropertyField>
        <PropertyField label="Width">
          <input style={inputStyle} value={data.width} onChange={e => update('width', e.target.value)} placeholder="100% or 300px" />
        </PropertyField>
        <PropertyField label="Alignment">
          <select style={selectStyle} value={data.alignment} onChange={e => update('alignment', e.target.value)}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
        </PropertyField>
        <PropertyField label="Padding">
          <input style={inputStyle} type="number" min={0} max={80} value={data.padding} onChange={e => update('padding', Number(e.target.value))} />
        </PropertyField>
      </>}

      {/* ----- BUTTON ----- */}
      {type === 'button' && <>
        <PropertyField label="Button Text">
          <input style={inputStyle} value={data.text} onChange={e => update('text', e.target.value)} />
        </PropertyField>
        <PropertyField label="URL">
          <input style={inputStyle} value={data.url} onChange={e => update('url', e.target.value)} />
        </PropertyField>
        <PropertyField label="Background Color">
          <input type="color" style={colorInputStyle} value={data.backgroundColor} onChange={e => update('backgroundColor', e.target.value)} />
        </PropertyField>
        <PropertyField label="Text Color">
          <input type="color" style={colorInputStyle} value={data.textColor} onChange={e => update('textColor', e.target.value)} />
        </PropertyField>
        <PropertyField label="Font Size">
          <input style={inputStyle} type="number" min={10} max={32} value={data.fontSize} onChange={e => update('fontSize', Number(e.target.value))} />
        </PropertyField>
        <PropertyField label="Border Radius">
          <input style={inputStyle} type="number" min={0} max={50} value={data.borderRadius} onChange={e => update('borderRadius', Number(e.target.value))} />
        </PropertyField>
        <PropertyField label="Alignment">
          <select style={selectStyle} value={data.alignment} onChange={e => update('alignment', e.target.value)}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
        </PropertyField>
        <PropertyField label="Outer Padding">
          <input style={inputStyle} type="number" min={0} max={80} value={data.padding} onChange={e => update('padding', Number(e.target.value))} />
        </PropertyField>
      </>}

      {/* ----- DIVIDER ----- */}
      {type === 'divider' && <>
        <PropertyField label="Color">
          <input type="color" style={colorInputStyle} value={data.color} onChange={e => update('color', e.target.value)} />
        </PropertyField>
        <PropertyField label="Thickness (px)">
          <input style={inputStyle} type="number" min={1} max={10} value={data.thickness} onChange={e => update('thickness', Number(e.target.value))} />
        </PropertyField>
        <PropertyField label="Width">
          <input style={inputStyle} value={data.width} onChange={e => update('width', e.target.value)} placeholder="100% or 80%" />
        </PropertyField>
        <PropertyField label="Style">
          <select style={selectStyle} value={data.style} onChange={e => update('style', e.target.value)}>
            <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
          </select>
        </PropertyField>
        <PropertyField label="Padding">
          <input style={inputStyle} type="number" min={0} max={80} value={data.padding} onChange={e => update('padding', Number(e.target.value))} />
        </PropertyField>
      </>}

      {/* ----- SPACER ----- */}
      {type === 'spacer' && <>
        <PropertyField label="Height (px)">
          <input style={inputStyle} type="number" min={4} max={200} value={data.height} onChange={e => update('height', Number(e.target.value))} />
        </PropertyField>
      </>}

      {/* ----- COLUMNS ----- */}
      {type === 'columns' && <>
        <PropertyField label="Column Count">
          <select style={selectStyle} value={data.count} onChange={e => {
            const count = Number(e.target.value);
            const contents = [...(data.contents || [])];
            while (contents.length < count) contents.push(`Column ${contents.length + 1} content`);
            update('count', count);
            onChange({ ...block, data: { ...block.data, count, contents: contents.slice(0, count) } });
          }}>
            <option value={2}>2 Columns</option><option value={3}>3 Columns</option>
          </select>
        </PropertyField>
        {(data.contents || []).slice(0, data.count).map((c, i) => (
          <PropertyField key={i} label={`Column ${i + 1}`}>
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={c} onChange={e => {
              const contents = [...(data.contents || [])];
              contents[i] = e.target.value;
              onChange({ ...block, data: { ...block.data, contents } });
            }} />
          </PropertyField>
        ))}
        <PropertyField label="Padding">
          <input style={inputStyle} type="number" min={0} max={40} value={data.padding} onChange={e => update('padding', Number(e.target.value))} />
        </PropertyField>
      </>}

      {/* ----- SOCIAL ----- */}
      {type === 'social' && <>
        <PropertyField label="Alignment">
          <select style={selectStyle} value={data.alignment} onChange={e => update('alignment', e.target.value)}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
        </PropertyField>
        <PropertyField label="Padding">
          <input style={inputStyle} type="number" min={0} max={80} value={data.padding} onChange={e => update('padding', Number(e.target.value))} />
        </PropertyField>
        {(data.links || []).map((link, i) => (
          <div key={i} style={{ marginBottom: 8, padding: 8, background: 'var(--bg-primary)', borderRadius: 4 }}>
            <PropertyField label={`Platform ${i + 1}`}>
              <select style={selectStyle} value={link.platform} onChange={e => {
                const links = [...data.links];
                links[i] = { ...links[i], platform: e.target.value };
                onChange({ ...block, data: { ...block.data, links } });
              }}>
                {['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok', 'pinterest'].map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </PropertyField>
            <PropertyField label="URL">
              <input style={inputStyle} value={link.url} onChange={e => {
                const links = [...data.links];
                links[i] = { ...links[i], url: e.target.value };
                onChange({ ...block, data: { ...block.data, links } });
              }} />
            </PropertyField>
            <button
              onClick={() => {
                const links = data.links.filter((_, j) => j !== i);
                onChange({ ...block, data: { ...block.data, links } });
              }}
              style={{
                background: 'none', border: 'none', color: '#e55', cursor: 'pointer', fontSize: 12, padding: '2px 0',
              }}
            >Remove</button>
          </div>
        ))}
        <button onClick={() => {
          const links = [...(data.links || []), { platform: 'facebook', url: '#' }];
          onChange({ ...block, data: { ...block.data, links } });
        }} style={{
          background: 'var(--accent-dim)', border: '1px dashed var(--accent)', borderRadius: 4,
          color: 'var(--accent)', padding: '6px 12px', cursor: 'pointer', fontSize: 12, width: '100%',
        }}>+ Add Link</button>
      </>}

      {/* ----- FOOTER ----- */}
      {type === 'footer' && <>
        <PropertyField label="Content">
          <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={data.content} onChange={e => update('content', e.target.value)} />
        </PropertyField>
        <PropertyField label="Unsubscribe Text">
          <input style={inputStyle} value={data.unsubscribeText} onChange={e => update('unsubscribeText', e.target.value)} />
        </PropertyField>
        <PropertyField label="Unsubscribe URL">
          <input style={inputStyle} value={data.unsubscribeUrl} onChange={e => update('unsubscribeUrl', e.target.value)} />
        </PropertyField>
        <PropertyField label="Address">
          <textarea style={{ ...inputStyle, minHeight: 40, resize: 'vertical' }} value={data.address} onChange={e => update('address', e.target.value)} />
        </PropertyField>
        <PropertyField label="Font Size">
          <input style={inputStyle} type="number" min={8} max={20} value={data.fontSize} onChange={e => update('fontSize', Number(e.target.value))} />
        </PropertyField>
        <PropertyField label="Color">
          <input type="color" style={colorInputStyle} value={data.color} onChange={e => update('color', e.target.value)} />
        </PropertyField>
        <PropertyField label="Alignment">
          <select style={selectStyle} value={data.alignment} onChange={e => update('alignment', e.target.value)}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
        </PropertyField>
        <PropertyField label="Padding">
          <input style={inputStyle} type="number" min={0} max={80} value={data.padding} onChange={e => update('padding', Number(e.target.value))} />
        </PropertyField>
      </>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block preview (rendered in canvas)
// ---------------------------------------------------------------------------

function BlockPreview({ block }) {
  const { type, data } = block;

  const previewBase = {
    fontFamily: 'Arial, sans-serif',
    width: '100%',
    boxSizing: 'border-box',
  };

  switch (type) {
    case 'header':
      return (
        <div style={{ ...previewBase, textAlign: data.alignment, padding: data.padding, backgroundColor: data.backgroundColor }}>
          {data.logoUrl && <img src={data.logoUrl} alt="Logo" style={{ maxHeight: 50, marginBottom: 6 }} />}
          <div style={{ fontSize: data.fontSize, color: data.color, fontWeight: 'bold' }}>{data.text}</div>
        </div>
      );
    case 'text':
      return (
        <div
          style={{ ...previewBase, textAlign: data.alignment, padding: data.padding, fontSize: data.fontSize, color: data.color, lineHeight: data.lineHeight }}
          dangerouslySetInnerHTML={{ __html: data.content }}
        />
      );
    case 'image':
      return (
        <div style={{ ...previewBase, textAlign: data.alignment, padding: data.padding }}>
          {data.src
            ? <img src={data.src} alt={data.alt} style={{ width: data.width, maxWidth: '100%', height: 'auto' }} />
            : <div style={{ width: '100%', height: 120, background: '#e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', borderRadius: 4 }}>
                <Image size={32} /><span style={{ marginLeft: 8 }}>No image URL set</span>
              </div>
          }
        </div>
      );
    case 'button':
      return (
        <div style={{ ...previewBase, textAlign: data.alignment, padding: data.padding }}>
          <span style={{
            display: 'inline-block',
            backgroundColor: data.backgroundColor,
            color: data.textColor,
            padding: `${data.paddingV}px ${data.paddingH}px`,
            borderRadius: data.borderRadius,
            fontSize: data.fontSize,
            fontWeight: 'bold',
            textDecoration: 'none',
          }}>{data.text}</span>
        </div>
      );
    case 'divider':
      return (
        <div style={{ ...previewBase, padding: `${data.padding}px 0` }}>
          <hr style={{ border: 'none', borderTop: `${data.thickness}px ${data.style} ${data.color}`, width: data.width, margin: '0 auto' }} />
        </div>
      );
    case 'spacer':
      return <div style={{ height: data.height, background: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(150,150,150,0.08) 5px, rgba(150,150,150,0.08) 10px)' }} />;
    case 'columns':
      return (
        <div style={{ ...previewBase, display: 'flex', gap: 4 }}>
          {(data.contents || []).slice(0, data.count).map((c, i) => (
            <div key={i} style={{ flex: 1, padding: data.padding, border: '1px dashed var(--border)', borderRadius: 4, fontSize: 14, color: '#555' }}>{c}</div>
          ))}
        </div>
      );
    case 'social':
      return (
        <div style={{ ...previewBase, textAlign: data.alignment, padding: data.padding }}>
          {(data.links || []).map((l, i) => (
            <span key={i} style={{ display: 'inline-block', margin: '0 6px', padding: '4px 10px', background: 'var(--accent-dim)', borderRadius: 4, fontSize: 13, color: 'var(--accent)' }}>
              {l.platform}
            </span>
          ))}
        </div>
      );
    case 'footer':
      return (
        <div style={{ ...previewBase, textAlign: data.alignment, padding: data.padding, fontSize: data.fontSize, color: data.color, lineHeight: 1.6 }}>
          {data.content}<br />
          <span style={{ textDecoration: 'underline' }}>{data.unsubscribeText}</span><br />
          {data.address}
        </div>
      );
    default:
      return <div>Unknown block</div>;
  }
}

// ---------------------------------------------------------------------------
// Main TemplateBuilder component
// ---------------------------------------------------------------------------

function TemplateBuilder({ blocks: externalBlocks, onBlocksChange, onGenerateHtml }) {
  const [internalBlocks, setInternalBlocks] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [draggedBlockId, setDraggedBlockId] = useState(null);
  const [dropTargetIdx, setDropTargetIdx] = useState(null);
  const [draggedNewType, setDraggedNewType] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [previewMode, setPreviewMode] = useState('desktop');
  const canvasRef = useRef(null);

  // Use a ref to always hold the latest blocks, avoiding stale closures during drag/drop
  const blocks = externalBlocks || internalBlocks;
  const blocksRef = useRef(blocks);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  const setBlocks = useCallback((newBlocks) => {
    const current = blocksRef.current;
    const resolved = typeof newBlocks === 'function' ? newBlocks(current) : newBlocks;
    // Push to undo stack (save deep copy of current state)
    setUndoStack(prev => [...prev.slice(-30), JSON.parse(JSON.stringify(current))]);
    setRedoStack([]);
    blocksRef.current = resolved;
    if (onBlocksChange) {
      onBlocksChange(resolved);
    } else {
      setInternalBlocks(resolved);
    }
  }, [onBlocksChange]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, JSON.parse(JSON.stringify(blocksRef.current))]);
    setUndoStack(s => s.slice(0, -1));
    blocksRef.current = prev;
    if (onBlocksChange) onBlocksChange(prev);
    else setInternalBlocks(prev);
  }, [undoStack, onBlocksChange]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(s => [...s, JSON.parse(JSON.stringify(blocksRef.current))]);
    setRedoStack(r => r.slice(0, -1));
    blocksRef.current = next;
    if (onBlocksChange) onBlocksChange(next);
    else setInternalBlocks(next);
  }, [redoStack, onBlocksChange]);

  useEffect(() => {
    const handleKeyboard = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [undo, redo]);

  const selectedBlock = blocks.find(b => b.id === selectedBlockId) || null;

  // NOTE: onGenerateHtml is only called explicitly by the Generate HTML button,
  // not on block changes, to avoid auto-saving during editing

  // Use refs for drag state to avoid stale closures in drop handlers
  const draggedNewTypeRef = useRef(null);
  const draggedBlockIdRef = useRef(null);

  // --- Sidebar drag handlers (new block from palette) ---
  const handlePaletteDragStart = (e, type) => {
    draggedNewTypeRef.current = type;
    draggedBlockIdRef.current = null;
    setDraggedNewType(type);
    setDraggedBlockId(null);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', type);
  };

  // --- Canvas block drag handlers (reorder) ---
  const handleBlockDragStart = (e, blockId) => {
    draggedBlockIdRef.current = blockId;
    draggedNewTypeRef.current = null;
    setDraggedBlockId(blockId);
    setDraggedNewType(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', blockId);
  };

  const handleCanvasDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggedNewTypeRef.current ? 'copy' : 'move';
    setDropTargetIdx(index);
  };

  const handleCanvasDrop = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetIdx(null);

    const newType = draggedNewTypeRef.current;
    const blockId = draggedBlockIdRef.current;

    if (newType) {
      // Insert new block from palette
      const newBlock = createBlock(newType);
      setBlocks(prev => {
        const copy = [...prev];
        copy.splice(index, 0, newBlock);
        return copy;
      });
      setSelectedBlockId(newBlock.id);
      draggedNewTypeRef.current = null;
      setDraggedNewType(null);
    } else if (blockId) {
      // Reorder existing block
      setBlocks(prev => {
        const fromIdx = prev.findIndex(b => b.id === blockId);
        if (fromIdx === -1 || fromIdx === index) return prev;
        const copy = [...prev];
        const [moved] = copy.splice(fromIdx, 1);
        const adjustedIdx = index > fromIdx ? index - 1 : index;
        copy.splice(adjustedIdx, 0, moved);
        return copy;
      });
      draggedBlockIdRef.current = null;
      setDraggedBlockId(null);
    }
  };

  const handleCanvasDragEnd = () => {
    draggedBlockIdRef.current = null;
    draggedNewTypeRef.current = null;
    setDraggedBlockId(null);
    setDraggedNewType(null);
    setDropTargetIdx(null);
  };

  // --- Block actions ---
  const deleteBlock = (id) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
  };

  const duplicateBlock = (id) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      const clone = { ...prev[idx], id: createId(), data: { ...prev[idx].data } };
      if (clone.data.contents) clone.data.contents = [...clone.data.contents];
      if (clone.data.links) clone.data.links = clone.data.links.map(l => ({ ...l }));
      const copy = [...prev];
      copy.splice(idx + 1, 0, clone);
      return copy;
    });
  };

  const moveBlock = (id, direction) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, moved);
      return copy;
    });
  };

  const updateBlock = (updated) => {
    setBlocks(prev => prev.map(b => b.id === updated.id ? updated : b));
  };

  const addBlockAtEnd = (type) => {
    const newBlock = createBlock(type);
    setBlocks(prev => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
  };

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const containerStyle = {
    display: 'flex',
    height: '100%',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    overflow: 'hidden',
  };

  const sidebarStyle = {
    width: 220,
    minWidth: 220,
    background: 'var(--bg-secondary)',
    borderRight: '1px solid var(--border)',
    overflowY: 'auto',
    padding: 12,
  };

  const canvasContainerStyle = {
    flex: 1,
    overflowY: 'auto',
    background: 'var(--bg-tertiary)',
    padding: 24,
  };

  const canvasStyle = {
    maxWidth: previewMode === 'mobile' ? 390 : 640,
    margin: '0 auto',
    background: '#ffffff',
    borderRadius: 8,
    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
    minHeight: 300,
    position: 'relative',
    transition: 'max-width 0.2s ease',
  };

  const rightPanelStyle = {
    width: 260,
    minWidth: 260,
    background: 'var(--bg-secondary)',
    borderLeft: '1px solid var(--border)',
    overflowY: 'auto',
  };

  const paletteItemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    marginBottom: 4,
    borderRadius: 6,
    cursor: 'grab',
    border: '1px solid var(--border)',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontSize: 13,
    transition: 'background 0.15s',
  };

  const dropIndicatorStyle = {
    height: 3,
    background: 'var(--accent)',
    borderRadius: 2,
    margin: '2px 0',
    transition: 'opacity 0.15s',
  };

  return (
    <div style={containerStyle}>
      {/* ============ LEFT SIDEBAR - BLOCK PALETTE ============ */}
      <div style={sidebarStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Blocks
        </h3>
        {BLOCK_TYPES.map(bt => {
          const Icon = bt.icon;
          return (
            <div
              key={bt.type}
              draggable
              onDragStart={e => handlePaletteDragStart(e, bt.type)}
              onDragEnd={handleCanvasDragEnd}
              style={paletteItemStyle}
              title={bt.description}
            >
              <Icon size={16} style={{ flexShrink: 0, color: 'var(--accent)' }} />
              <span>{bt.label}</span>
            </div>
          );
        })}

        {blocks.length > 0 && (
          <button
            onClick={() => {
              if (onGenerateHtml) onGenerateHtml(generateFullHtml(blocks));
            }}
            style={{
              marginTop: 16,
              width: '100%',
              padding: '10px 12px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Generate HTML
          </button>
        )}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z)"
            style={{
              flex: 1, padding: '6px', background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)', borderRadius: 4,
              color: undoStack.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: undoStack.length === 0 ? 'default' : 'pointer', fontSize: 12,
            }}
          >
            Undo ({undoStack.length})
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Y)"
            style={{
              flex: 1, padding: '6px', background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)', borderRadius: 4,
              color: redoStack.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: redoStack.length === 0 ? 'default' : 'pointer', fontSize: 12,
            }}
          >
            Redo ({redoStack.length})
          </button>
        </div>
      </div>

      {/* ============ CENTER - CANVAS ============ */}
      <div style={canvasContainerStyle}>
        <div style={{ maxWidth: previewMode === 'mobile' ? 390 : 640, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {blocks.length > 0
              ? `${blocks.length} block${blocks.length === 1 ? '' : 's'} on canvas`
              : 'Start with a starter block or drag one onto the canvas'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setPreviewMode('desktop')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                cursor: 'pointer',
                background: previewMode === 'desktop' ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                color: previewMode === 'desktop' ? 'var(--accent)' : 'var(--text-secondary)'
              }}
            >
              <Monitor size={14} /> Desktop
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('mobile')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                cursor: 'pointer',
                background: previewMode === 'mobile' ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                color: previewMode === 'mobile' ? 'var(--accent)' : 'var(--text-secondary)'
              }}
            >
              <Smartphone size={14} /> Mobile
            </button>
          </div>
        </div>
        <div
          ref={canvasRef}
          style={canvasStyle}
          onDragOver={e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = draggedNewTypeRef.current ? 'copy' : 'move';
          }}
          onDrop={e => {
            // Catch-all: if the drop wasn't handled by a more specific zone, append at end
            e.preventDefault();
            handleCanvasDrop(e, blocksRef.current.length);
          }}
        >
          {blocks.length === 0 && (
            <div
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
              onDrop={e => handleCanvasDrop(e, 0)}
              style={{
                padding: 60,
                textAlign: 'center',
                color: '#999',
                fontSize: 14,
              }}
            >
              <Plus size={32} style={{ marginBottom: 8, color: 'var(--accent)', opacity: 0.5 }} /><br />
              Drag blocks here to start building
            </div>
          )}

          {blocks.map((block, idx) => (
            <React.Fragment key={block.id}>
              {/* Drop zone above block */}
              <div
                onDragOver={e => handleCanvasDragOver(e, idx)}
                onDrop={e => handleCanvasDrop(e, idx)}
                style={{
                  height: dropTargetIdx === idx ? 32 : 24,
                  transition: 'height 0.15s ease',
                  position: 'relative',
                }}
              >
                {dropTargetIdx === idx && <div style={dropIndicatorStyle} />}
              </div>

              {/* Block wrapper */}
              <CanvasBlock
                block={block}
                isSelected={selectedBlockId === block.id}
                isDragging={draggedBlockId === block.id}
                onSelect={() => setSelectedBlockId(block.id)}
                onDelete={() => deleteBlock(block.id)}
                onDuplicate={() => duplicateBlock(block.id)}
                onMoveUp={() => moveBlock(block.id, 'up')}
                onMoveDown={() => moveBlock(block.id, 'down')}
                onDragStart={e => handleBlockDragStart(e, block.id)}
                onDragEnd={handleCanvasDragEnd}
                onBlockDragOver={(e, insertIdx) => handleCanvasDragOver(e, insertIdx)}
                onBlockDrop={(e, insertIdx) => handleCanvasDrop(e, insertIdx)}
                blockIndex={idx}
                isFirst={idx === 0}
                isLast={idx === blocks.length - 1}
              />

              {/* Drop zone below last block */}
              {idx === blocks.length - 1 && (
                <div
                  onDragOver={e => handleCanvasDragOver(e, idx + 1)}
                  onDrop={e => handleCanvasDrop(e, idx + 1)}
                  style={{
                    height: dropTargetIdx === idx + 1 ? 32 : 24,
                    transition: 'height 0.15s ease',
                    position: 'relative',
                  }}
                >
                  {dropTargetIdx === idx + 1 && <div style={dropIndicatorStyle} />}
                </div>
              )}
            </React.Fragment>
          ))}

          {/* Persistent bottom drop area - always visible when blocks exist */}
          {blocks.length > 0 && (
            <div
              onDragOver={e => handleCanvasDragOver(e, blocks.length)}
              onDrop={e => handleCanvasDrop(e, blocks.length)}
              style={{
                minHeight: 60,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderTop: dropTargetIdx === blocks.length ? '3px solid var(--accent)' : '2px dashed transparent',
                color: '#bbb',
                fontSize: 13,
                transition: 'border-color 0.15s, background 0.15s',
                background: dropTargetIdx === blocks.length ? 'rgba(91,180,212,0.06)' : 'transparent',
                borderRadius: '0 0 8px 8px',
              }}
            >
              {(draggedNewType || draggedBlockId) && <span>Drop here to add at end</span>}
            </div>
          )}

          {/* Add block button at bottom */}
          {blocks.length > 0 && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <AddBlockMenu onAdd={addBlockAtEnd} />
            </div>
          )}
        </div>
      </div>

      {/* ============ RIGHT PANEL - PROPERTIES ============ */}
      <div style={rightPanelStyle}>
        <PropertyPanel block={selectedBlock} onChange={updateBlock} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas block wrapper
// ---------------------------------------------------------------------------

function CanvasBlock({ block, isSelected, isDragging, onSelect, onDelete, onDuplicate, onMoveUp, onMoveDown, onDragStart, onDragEnd, onBlockDragOver, onBlockDrop, blockIndex, isFirst, isLast }) {
  const [hovered, setHovered] = useState(false);
  const [dropHalf, setDropHalf] = useState(null); // 'top' or 'bottom'
  const blockRef = useRef(null);

  const wrapperStyle = {
    position: 'relative',
    cursor: 'pointer',
    opacity: isDragging ? 0.4 : 1,
    outline: isSelected ? '2px solid var(--accent)' : hovered ? '2px solid rgba(91,180,212,0.4)' : '2px solid transparent',
    outlineOffset: -2,
    transition: 'outline-color 0.15s, opacity 0.15s',
  };

  const toolbarStyle = {
    position: 'absolute',
    top: -1,
    right: -1,
    display: 'flex',
    gap: 2,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '0 0 0 6px',
    padding: '2px 4px',
    zIndex: 10,
    opacity: hovered || isSelected ? 1 : 0,
    pointerEvents: hovered || isSelected ? 'auto' : 'none',
    transition: 'opacity 0.15s',
  };

  const toolBtnStyle = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    color: 'var(--text-secondary)',
    borderRadius: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const labelStyle = {
    position: 'absolute',
    top: -1,
    left: -1,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    background: 'var(--accent)',
    color: '#fff',
    padding: '1px 6px',
    borderRadius: '0 0 4px 0',
    opacity: hovered || isSelected ? 1 : 0,
    transition: 'opacity 0.15s',
    zIndex: 10,
    fontWeight: 600,
  };

  const handleBlockDragOverInternal = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!blockRef.current) return;
    const rect = blockRef.current.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const isTopHalf = e.clientY < midY;
    const insertIdx = isTopHalf ? blockIndex : blockIndex + 1;
    setDropHalf(isTopHalf ? 'top' : 'bottom');
    if (onBlockDragOver) onBlockDragOver(e, insertIdx);
  };

  const handleBlockDropInternal = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!blockRef.current) return;
    const rect = blockRef.current.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const isTopHalf = e.clientY < midY;
    const insertIdx = isTopHalf ? blockIndex : blockIndex + 1;
    setDropHalf(null);
    if (onBlockDrop) onBlockDrop(e, insertIdx);
  };

  // Build the block-level drop indicator style
  const blockDropIndicator = dropHalf ? {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    background: 'var(--accent)',
    borderRadius: 2,
    zIndex: 20,
    pointerEvents: 'none',
    ...(dropHalf === 'top' ? { top: 0 } : { bottom: 0 }),
  } : null;

  return (
    <div
      ref={blockRef}
      style={wrapperStyle}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setDropHalf(null); }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={(e) => { setDropHalf(null); onDragEnd(e); }}
      onDragOver={handleBlockDragOverInternal}
      onDrop={handleBlockDropInternal}
      onDragLeave={() => setDropHalf(null)}
    >
      {/* Drop indicator on block */}
      {blockDropIndicator && <div style={blockDropIndicator} />}

      {/* Block type label */}
      <div style={labelStyle}>{block.type}</div>

      {/* Toolbar */}
      <div style={toolbarStyle}>
        <button style={toolBtnStyle} title="Drag to reorder" onMouseDown={e => e.stopPropagation()}>
          <GripVertical size={14} />
        </button>
        <button style={toolBtnStyle} title="Duplicate" onClick={e => { e.stopPropagation(); onDuplicate(); }}>
          <Copy size={14} />
        </button>
        <button style={toolBtnStyle} title="Move up" disabled={isFirst} onClick={e => { e.stopPropagation(); onMoveUp(); }}>
          <ChevronUp size={14} style={{ opacity: isFirst ? 0.35 : 1 }} />
        </button>
        <button style={toolBtnStyle} title="Move down" disabled={isLast} onClick={e => { e.stopPropagation(); onMoveDown(); }}>
          <ChevronDown size={14} style={{ opacity: isLast ? 0.35 : 1 }} />
        </button>
        <button style={{ ...toolBtnStyle, color: '#e55' }} title="Delete" onClick={e => { e.stopPropagation(); onDelete(); }}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Block preview */}
      <BlockPreview block={block} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add block menu (bottom of canvas)
// ---------------------------------------------------------------------------

function AddBlockMenu({ onAdd }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'var(--accent-dim)',
          border: '1px dashed var(--accent)',
          borderRadius: 6,
          color: 'var(--accent)',
          padding: '6px 16px',
          cursor: 'pointer',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Plus size={14} /> Add Block
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: 6,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          zIndex: 100,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 4,
          minWidth: 240,
        }}>
          {BLOCK_TYPES.map(bt => {
            const Icon = bt.icon;
            return (
              <button
                key={bt.type}
                onClick={() => { onAdd(bt.type); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={14} style={{ color: 'var(--accent)' }} />
                {bt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { createBlock, generateFullHtml };
export default TemplateBuilder;
