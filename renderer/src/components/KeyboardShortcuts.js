import React, { useState, useEffect } from 'react';
import { useNavigation } from './NavigationContext';
import { X } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'],   label: 'Open search / command palette' },
  { keys: ['?'],           label: 'Show keyboard shortcuts'        },
  { keys: ['Alt', '1'],   label: 'Go to Dashboard'                },
  { keys: ['Alt', '2'],   label: 'Go to Campaigns'               },
  { keys: ['Alt', '3'],   label: 'Go to Composer'                },
  { keys: ['Alt', '4'],   label: 'Go to Contacts'                },
  { keys: ['Alt', '5'],   label: 'Go to Templates'               },
  { keys: ['Alt', '6'],   label: 'Go to Verify'                  },
  { keys: ['Alt', '7'],   label: 'Go to Spam Checker'            },
  { keys: ['Alt', '8'],   label: 'Go to Blacklist'               },
  { keys: ['Alt', '9'],   label: 'Go to Settings'                },
  { keys: ['Ctrl', 'N'],  label: 'New campaign'                  },
  { keys: ['Ctrl', 'E'],  label: 'Open composer'                 },
  { keys: ['Ctrl', 'I'],  label: 'Go to Contacts'               },
  { keys: ['Esc'],        label: 'Close modal / search'          },
];

function ShortcutMap({ onClose }) {
  return (
    <div className="shortcut-map-overlay" onClick={onClose} role="presentation">
      <div className="shortcut-map" onClick={e => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <div className="shortcut-map__header">
          <span className="shortcut-map__title">Keyboard shortcuts</span>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="shortcut-map__list">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="shortcut-map__row">
              <span className="shortcut-map__label">{s.label}</span>
              <span className="shortcut-map__keys">
                {s.keys.map((k, j) => <kbd key={j}>{k}</kbd>)}
              </span>
            </div>
          ))}
        </div>
        <div className="shortcut-map__footer">Press <kbd>?</kbd> or <kbd>Esc</kbd> to close</div>
      </div>
    </div>
  );
}

function KeyboardShortcuts() {
  const { navigateTo } = useNavigation();
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.contentEditable === 'true';

      if (e.key === 'Escape') { setShowMap(false); return; }
      if (!editable && e.key === '?' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setShowMap(p => !p); return; }

      if (editable) return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'n': e.preventDefault(); navigateTo('/campaigns');    break;
          case 'e': e.preventDefault(); navigateTo('/composer');     break;
          case 'i': e.preventDefault(); navigateTo('/contacts');     break;
          case 't': e.preventDefault(); navigateTo('/templates');    break;
          default: break;
        }
      }

      if (e.altKey) {
        switch (e.key) {
          case '1': e.preventDefault(); navigateTo('/');             break;
          case '2': e.preventDefault(); navigateTo('/campaigns');    break;
          case '3': e.preventDefault(); navigateTo('/composer');     break;
          case '4': e.preventDefault(); navigateTo('/contacts');     break;
          case '5': e.preventDefault(); navigateTo('/templates');    break;
          case '6': e.preventDefault(); navigateTo('/verify');       break;
          case '7': e.preventDefault(); navigateTo('/spam-checker'); break;
          case '8': e.preventDefault(); navigateTo('/blacklist');    break;
          case '9': e.preventDefault(); navigateTo('/settings');     break;
          default: break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateTo]);

  if (!showMap) return null;
  return <ShortcutMap onClose={() => setShowMap(false)} />;
}

export default KeyboardShortcuts;
