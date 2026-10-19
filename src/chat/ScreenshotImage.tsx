import { useEffect, useState } from 'react';

/** Loads one stored screenshot for an inline preview. */
export function ScreenshotImage({ id, className, alt }: { id: string; className?: string; alt?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let active = true;
    setSrc('');
    const request = window.aelion?.screenshot?.(id);
    if (request)
      void request
        .then((url) => {
          if (active) setSrc(url);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);
  return src ? <img className={className} src={src} alt={alt || ''} /> : null;
}
