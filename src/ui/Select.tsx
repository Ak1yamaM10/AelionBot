import { useLayoutEffect, useRef, type SelectHTMLAttributes } from 'react';
import './select.css';

export function Select({ className = '', onKeyDown, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const root = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => {
    const select = root.current;
    if (!select || !CSS.supports('appearance', 'base-select')) return;
    // React 19 validates the legacy select content model. Let the browser own
    // this new native part while React continues to manage the options.
    const button = document.createElement('button'),
      content = document.createElement('selectedcontent');
    button.type = 'button';
    button.tabIndex = -1;
    button.append(content);
    select.prepend(button);
    // Chromium copies the selected option into <selectedcontent> once. A later
    // text change, such as a translation, updates the open list but not that copy.
    let updating = false;
    const sync = () => {
      if (updating) return;
      const selected = select.selectedOptions[0];
      updating = true;
      content.replaceChildren(...(selected ? [...selected.childNodes].map((node) => node.cloneNode(true)) : []));
      updating = false;
    };
    const observer = new MutationObserver((records) => {
      if (records.every((record) => button.contains(record.target as Node))) return;
      sync();
    });
    observer.observe(select, { subtree: true, childList: true, characterData: true });
    select.addEventListener('change', sync);
    sync();
    return () => {
      observer.disconnect();
      select.removeEventListener('change', sync);
      button.remove();
    };
  }, []);
  return (
    <select
      {...props}
      ref={root}
      className={`aelion-select ${className}`}
      onKeyDown={(event) => {
        // Let the picker handle these keys before the surrounding dialog does.
        if ((event.key === 'Escape' || event.key === 'Tab') && event.currentTarget.matches(':open'))
          event.stopPropagation();
        onKeyDown?.(event);
      }}
    />
  );
}
