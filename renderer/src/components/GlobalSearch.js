import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Users, Send, FileText, X, ArrowRight, LayoutDashboard,
  CheckCircle, ShieldAlert, Ban, Zap, Settings, BarChart3, Inbox } from 'lucide-react';
import { useNavigation } from './NavigationContext';

const QUICK_LINKS = [
  { type: 'nav', label: 'Dashboard',      icon: LayoutDashboard, path: '/'              },
  { type: 'nav', label: 'Campaigns',      icon: Send,            path: '/campaigns'     },
  { type: 'nav', label: 'Contacts',       icon: Users,           path: '/contacts'      },
  { type: 'nav', label: 'Templates',      icon: FileText,        path: '/templates'     },
  { type: 'nav', label: 'Verify',         icon: CheckCircle,     path: '/verify'        },
  { type: 'nav', label: 'Spam Checker',   icon: ShieldAlert,     path: '/spam-checker'  },
  { type: 'nav', label: 'Blacklist',      icon: Ban,             path: '/blacklist'     },
  { type: 'nav', label: 'Automations',    icon: Zap,             path: '/automations'   },
  { type: 'nav', label: 'Analytics',      icon: BarChart3,       path: '/engagement'    },
  { type: 'nav', label: 'Inbox Placement',icon: Inbox,           path: '/inbox-placement'},
  { type: 'nav', label: 'Settings',       icon: Settings,        path: '/settings'      },
];

function iconFor(type) {
  if (type === 'contact')  return <Users size={15} />;
  if (type === 'campaign') return <Send size={15} />;
  if (type === 'template') return <FileText size={15} />;
  return <Search size={15} />;
}

function GlobalSearch() {
  const { navigateTo } = useNavigation();
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState({ contacts: [], campaigns: [], templates: [] });
  const [cursor, setCursor]   = useState(0);
  const inputRef  = useRef(null);
  const debounce  = useRef(null);
  const listRef   = useRef(null);

  const close = useCallback(() => { setOpen(false); setQuery(''); setResults({ contacts: [], campaigns: [], templates: [] }); setCursor(0); }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setOpen(p => !p); }
      if (e.key === 'Escape') close();
    };
    const onBulky = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('bulky:open-search', onBulky);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('bulky:open-search', onBulky); };
  }, [close]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 60); }, [open]);

  const flatItems = useCallback(() => {
    const hasQuery = query.trim().length > 0;
    if (!hasQuery) return QUICK_LINKS;
    const items = [];
    results.contacts.forEach(c  => items.push({ type: 'contact',  label: c.email,  sub: [c.firstName, c.lastName].filter(Boolean).join(' '), path: '/contacts' }));
    results.campaigns.forEach(c => items.push({ type: 'campaign', label: c.name,   sub: `Campaign · ${c.status || 'draft'}`,                  path: '/campaigns' }));
    results.templates.forEach(t => items.push({ type: 'template', label: t.name,   sub: 'Template',                                           path: '/templates' }));
    return items;
  }, [query, results]);

  const items = flatItems();

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults({ contacts: [], campaigns: [], templates: [] }); return; }
    try {
      const data = await window.electron.search.global(q);
      setResults(data || { contacts: [], campaigns: [], templates: [] });
      setCursor(0);
    } catch {}
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => doSearch(val), 220);
  };

  const handleSelect = (item) => { navigateTo(item.path); close(); };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, items.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && items[cursor]) handleSelect(items[cursor]);
  };

  useEffect(() => {
    const el = listRef.current?.children[cursor];
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const hasQuery = query.trim().length > 0;
  const totalResults = results.contacts.length + results.campaigns.length + results.templates.length;

  return (
    <div className="cmd-overlay" onClick={close} role="presentation">
      <div className="cmd-palette" onClick={e => e.stopPropagation()} role="dialog"
        aria-label="Command palette" aria-modal="true">
        {/* Input */}
        <div className="cmd-input-row">
          <Search size={17} className="cmd-search-icon" />
          <input
            ref={inputRef}
            className="cmd-input"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search campaigns, contacts, templates…"
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button className="cmd-clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
              <X size={14} />
            </button>
          )}
          <kbd className="cmd-esc">esc</kbd>
        </div>

        {/* Results */}
        <div className="cmd-results" ref={listRef} role="listbox">
          {!hasQuery && (
            <div className="cmd-section-label">Quick navigation</div>
          )}
          {hasQuery && totalResults === 0 && query.length >= 2 && (
            <div className="cmd-empty">No results for "{query}"</div>
          )}
          {items.map((item, i) => (
            <div
              key={`${item.type}-${i}`}
              className={`cmd-item ${cursor === i ? 'cmd-item--active' : ''}`}
              role="option"
              aria-selected={cursor === i}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setCursor(i)}
            >
              <span className="cmd-item__icon">
                {item.icon ? <item.icon size={15} /> : iconFor(item.type)}
              </span>
              <span className="cmd-item__label">{item.label}</span>
              {item.sub && <span className="cmd-item__sub">{item.sub}</span>}
              <ArrowRight size={13} className="cmd-item__arrow" />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="cmd-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

export default GlobalSearch;
