import { useEffect } from 'react';
import { useNavigation } from './NavigationContext';

function KeyboardShortcuts() {
  const { navigateTo } = useNavigation();

  useEffect(() => {
    const handler = (e) => {
      // Only handle when not typing in an input
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.contentEditable === 'true') return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'n': e.preventDefault(); navigateTo('/campaigns'); break;
          case 'e': e.preventDefault(); navigateTo('/composer'); break;
          case 'i': e.preventDefault(); navigateTo('/contacts'); break;
          case 't': e.preventDefault(); navigateTo('/templates'); break;
          default: break;
        }
      }

      // Alt shortcuts for quick nav
      if (e.altKey) {
        switch (e.key) {
          case '1': e.preventDefault(); navigateTo('/'); break;
          case '2': e.preventDefault(); navigateTo('/campaigns'); break;
          case '3': e.preventDefault(); navigateTo('/composer'); break;
          case '4': e.preventDefault(); navigateTo('/contacts'); break;
          case '5': e.preventDefault(); navigateTo('/templates'); break;
          case '6': e.preventDefault(); navigateTo('/verify'); break;
          case '7': e.preventDefault(); navigateTo('/spam-checker'); break;
          case '8': e.preventDefault(); navigateTo('/blacklist'); break;
          case '9': e.preventDefault(); navigateTo('/settings'); break;
          default: break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateTo]);

  return null;
}

export default KeyboardShortcuts;
