import { useState } from 'preact/hooks';

interface Props {
  text:     string;
  label?:   string;
  ariaLabel?: string;
  className?: string;
  stopPropagation?: boolean;
  id?:      string;
}

export function CopyButton({ text, label = 'Copy', ariaLabel, className = 'copy-btn', stopPropagation, id }: Props) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      id={id}
      class={className + (copied ? ' copied' : '')}
      title={label}
      aria-label={ariaLabel}
      data-copy={text}
      onClick={e => {
        if (stopPropagation) e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          const announce = document.getElementById('sr-announce');
          if (announce) announce.textContent = 'Command copied to clipboard';
          setTimeout(() => {
            setCopied(false);
            if (announce) announce.textContent = '';
          }, 3000);
        });
      }}
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}
