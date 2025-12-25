import React, { useRef, useCallback, useEffect, useState } from 'react';
import { 
  Bold, Italic, Underline, Link, Image, List, ListOrdered, 
  AlignLeft, AlignCenter, AlignRight, Type, Palette, Undo, Redo,
  Minus, Quote
} from 'lucide-react';

function EmailEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [savedSelection, setSavedSelection] = useState(null);

  // Initialize editor content
  useEffect(() => {
    if (editorRef.current && value !== undefined) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || '';
      }
    }
  }, [value]);

  // Save selection before opening modals
  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      setSavedSelection(selection.getRangeAt(0).cloneRange());
    }
  };

  // Restore selection after modal actions
  const restoreSelection = () => {
    if (savedSelection) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedSelection);
    }
  };

  const handleChange = useCallback(() => {
    if (editorRef.current && onChange) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const execCommand = useCallback((command, value = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    handleChange();
  }, [handleChange]);


  const handleInsertLink = () => {
    restoreSelection();
    if (linkUrl) {
      execCommand('createLink', linkUrl);
      setLinkUrl('');
    }
    setShowLinkModal(false);
  };

  const handleInsertImage = () => {
    restoreSelection();
    if (imageUrl) {
      execCommand('insertImage', imageUrl);
      setImageUrl('');
    }
    setShowImageModal(false);
  };

  const handleColorChange = (color) => {
    execCommand('foreColor', color);
    setShowColorPicker(false);
  };

  const handleFontSize = (size) => {
    execCommand('fontSize', size);
  };

  const colors = [
    '#000000', '#333333', '#666666', '#999999', '#cccccc',
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
  ];

  const ToolbarButton = ({ onClick, active, children, title }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="editor-toolbar-btn"
      style={{
        padding: '6px 8px',
        border: 'none',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : 'var(--text)',
        borderRadius: '4px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s'
      }}
      onMouseOver={(e) => { if (!active) e.target.style.background = 'var(--bg-tertiary)'; }}
      onMouseOut={(e) => { if (!active) e.target.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );

  const ToolbarDivider = () => (
    <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />
  );


  return (
    <div className="email-editor" style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap',
        alignItems: 'center', 
        gap: '2px', 
        padding: '8px 12px', 
        background: 'var(--bg-secondary)', 
        borderBottom: '1px solid var(--border)' 
      }}>
        {/* Undo/Redo */}
        <ToolbarButton onClick={() => execCommand('undo')} title="Undo (Ctrl+Z)"><Undo size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => execCommand('redo')} title="Redo (Ctrl+Y)"><Redo size={16} /></ToolbarButton>
        
        <ToolbarDivider />
        
        {/* Font Size */}
        <select 
          onChange={(e) => handleFontSize(e.target.value)} 
          defaultValue="3"
          style={{ 
            padding: '4px 8px', 
            border: '1px solid var(--border)', 
            borderRadius: '4px', 
            background: 'var(--bg)', 
            color: 'var(--text)',
            fontSize: '12px',
            cursor: 'pointer'
          }}
          title="Font Size"
        >
          <option value="1">Small</option>
          <option value="2">Normal</option>
          <option value="3">Medium</option>
          <option value="4">Large</option>
          <option value="5">X-Large</option>
          <option value="6">XX-Large</option>
        </select>
        
        <ToolbarDivider />

        {/* Text Formatting */}
        <ToolbarButton onClick={() => execCommand('bold')} title="Bold (Ctrl+B)"><Bold size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => execCommand('italic')} title="Italic (Ctrl+I)"><Italic size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => execCommand('underline')} title="Underline (Ctrl+U)"><Underline size={16} /></ToolbarButton>
        
        {/* Color Picker */}
        <div style={{ position: 'relative' }}>
          <ToolbarButton onClick={() => setShowColorPicker(!showColorPicker)} title="Text Color">
            <Palette size={16} />
          </ToolbarButton>
          {showColorPicker && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 100,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '8px',
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '4px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}>
              {colors.map(color => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  style={{
                    width: '24px',
                    height: '24px',
                    background: color,
                    border: '2px solid var(--border)',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
          )}
        </div>
        
        <ToolbarDivider />

        {/* Alignment */}
        <ToolbarButton onClick={() => execCommand('justifyLeft')} title="Align Left"><AlignLeft size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => execCommand('justifyCenter')} title="Align Center"><AlignCenter size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => execCommand('justifyRight')} title="Align Right"><AlignRight size={16} /></ToolbarButton>
        
        <ToolbarDivider />

        {/* Lists */}
        <ToolbarButton onClick={() => execCommand('insertUnorderedList')} title="Bullet List"><List size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => execCommand('insertOrderedList')} title="Numbered List"><ListOrdered size={16} /></ToolbarButton>
        
        <ToolbarDivider />

        {/* Insert */}
        <ToolbarButton onClick={() => { saveSelection(); setShowLinkModal(true); }} title="Insert Link"><Link size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => { saveSelection(); setShowImageModal(true); }} title="Insert Image"><Image size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => execCommand('insertHorizontalRule')} title="Horizontal Line"><Minus size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => execCommand('formatBlock', 'blockquote')} title="Quote"><Quote size={16} /></ToolbarButton>
        
        <ToolbarDivider />
        
        {/* Headings */}
        <ToolbarButton onClick={() => execCommand('formatBlock', 'h1')} title="Heading 1"><Type size={16} /></ToolbarButton>
        <ToolbarButton onClick={() => execCommand('formatBlock', 'h2')} title="Heading 2"><Type size={14} /></ToolbarButton>
        <ToolbarButton onClick={() => execCommand('formatBlock', 'p')} title="Paragraph"><Type size={12} /></ToolbarButton>
      </div>


      {/* Editor Area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleChange}
        onBlur={handleChange}
        data-placeholder={placeholder || 'Start typing your email content...'}
        style={{
          minHeight: '350px',
          maxHeight: '500px',
          overflowY: 'auto',
          padding: '16px',
          outline: 'none',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          lineHeight: '1.6',
          color: 'var(--text)',
          background: 'var(--bg)'
        }}
      />

      {/* Link Modal */}
      {showLinkModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setShowLinkModal(false)}>
          <div style={{
            background: 'var(--bg)',
            borderRadius: '12px',
            padding: '24px',
            width: '400px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '16px', color: 'var(--text)' }}>Insert Link</h3>
            <input
              type="url"
              placeholder="https://example.com"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="form-input"
              style={{ marginBottom: '16px' }}
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleInsertLink()}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowLinkModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleInsertLink}>Insert</button>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {showImageModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setShowImageModal(false)}>
          <div style={{
            background: 'var(--bg)',
            borderRadius: '12px',
            padding: '24px',
            width: '400px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '16px', color: 'var(--text)' }}>Insert Image</h3>
            <input
              type="url"
              placeholder="https://example.com/image.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="form-input"
              style={{ marginBottom: '8px' }}
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleInsertImage()}
            />
            <p className="text-sm text-muted" style={{ marginBottom: '16px' }}>
              Enter the URL of an image hosted online, or use a base64 data URL.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowImageModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleInsertImage}>Insert</button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close color picker */}
      {showColorPicker && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} 
          onClick={() => setShowColorPicker(false)} 
        />
      )}
    </div>
  );
}

export default EmailEditor;
