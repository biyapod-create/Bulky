import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Users, Send, FileText, X } from 'lucide-react';
import { useNavigation } from './NavigationContext';

function GlobalSearch() {
  const { navigateTo } = useNavigation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ contacts: [], campaigns: [], templates: [] });
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Keyboard shortcut: Ctrl+K to open
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults({ contacts: [], campaigns: [], templates: [] }); return; }
    try {
      const data = await window.electron.search.global(q);
      setResults(data || { contacts: [], campaigns: [], templates: [] });
    } catch (e) { console.warn('GlobalSearch error:', e?.message); }
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 250);
  };

  const handleSelect = (type, item) => {
    setOpen(false);
    setQuery('');
    if (type === 'contact') navigateTo('/contacts');
    else if (type === 'campaign') navigateTo('/campaigns');
    else if (type === 'template') navigateTo('/templates');
  };

  const totalResults = results.contacts.length + results.campaigns.length + results.templates.length;

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', justifyContent: 'center', paddingTop: '80px' }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)'
      }} />
      <div style={{
        position: 'relative', width: '560px', maxHeight: '480px', background: 'var(--bg-primary)',
        borderRadius: '12px', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input ref={inputRef} type="text" value={query} onChange={handleChange}
            placeholder="Search contacts, campaigns, templates..." autoFocus
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: '15px' }} />
          <kbd style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>ESC</kbd>
          <X size={16} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setOpen(false)} />
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
          {query.length >= 2 && totalResults === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No results for "{query}"</div>
          )}

          {results.contacts.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', padding: '6px 8px', textTransform: 'uppercase' }}>Contacts</div>
              {results.contacts.map(c => (
                <div key={c.id} onClick={() => handleSelect('contact', c)} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '6px', cursor: 'pointer'
                }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <Users size={14} style={{ color: 'var(--accent)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{c.email}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{[c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {results.campaigns.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', padding: '6px 8px', textTransform: 'uppercase' }}>Campaigns</div>
              {results.campaigns.map(c => (
                <div key={c.id} onClick={() => handleSelect('campaign', c)} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '6px', cursor: 'pointer'
                }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <Send size={14} style={{ color: '#6366f1' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {results.templates.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', padding: '6px 8px', textTransform: 'uppercase' }}>Templates</div>
              {results.templates.map(t => (
                <div key={t.id} onClick={() => handleSelect('template', t)} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '6px', cursor: 'pointer'
                }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <FileText size={14} style={{ color: '#10b981' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{t.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.category}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!query && (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Type to search across contacts, campaigns, and templates
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GlobalSearch;
