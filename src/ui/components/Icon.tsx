import type { Attribute, Tier } from '../../engine/constants';

type IconProps = { size?: number; className?: string; title?: string };

function Svg({ size = 16, className, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/* Attribute sigils — each a distinct silhouette, readable at 14px. */
export function AttributeIcon({ attribute, ...p }: IconProps & { attribute: Attribute }) {
  switch (attribute) {
    case 'STR': // rising strike
      return (
        <Svg {...p}>
          <path d="M5 19 12 5l7 14" />
          <path d="M8.5 13h7" />
        </Svg>
      );
    case 'INT': // eye of the mind
      return (
        <Svg {...p}>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.8" />
        </Svg>
      );
    case 'DEX': // precision reticle
      return (
        <Svg {...p}>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
        </Svg>
      );
    case 'VIT': // pulse
      return (
        <Svg {...p}>
          <path d="M2 12h5l2.5-6 5 12 2.5-6h5" />
        </Svg>
      );
    case 'CHA': // radiant voice
      return (
        <Svg {...p}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
        </Svg>
      );
  }
}

export function TierIcon({ tier, ...p }: IconProps & { tier: Tier }) {
  switch (tier) {
    case 'tiny':
      return (
        <Svg {...p}>
          <path d="M12 7 17 12 12 17 7 12Z" />
        </Svg>
      );
    case 'standard':
      return (
        <Svg {...p}>
          <path d="M12 4 20 12 12 20 4 12Z" fill="currentColor" fillOpacity={0.18} />
          <path d="M12 9 15 12 12 15 9 12Z" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'challenge':
      return (
        <Svg {...p}>
          <path d="M12 2 14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5Z" fill="currentColor" fillOpacity={0.2} />
        </Svg>
      );
    case 'boss':
      return (
        <Svg {...p}>
          <path d="M3 18 4.5 7l5 4.5L12 4l2.5 7.5 5-4.5L21 18Z" fill="currentColor" fillOpacity={0.2} />
          <path d="M3 21h18" />
        </Svg>
      );
  }
}

export function Glyph({ name, ...p }: IconProps & { name: GlyphName }) {
  switch (name) {
    case 'plus':
      return (
        <Svg {...p}>
          <path d="M12 5v14M5 12h14" />
        </Svg>
      );
    case 'check':
      return (
        <Svg {...p}>
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </Svg>
      );
    case 'close':
      return (
        <Svg {...p}>
          <path d="m6 6 12 12M18 6 6 18" />
        </Svg>
      );
    case 'repeat':
      return (
        <Svg {...p}>
          <path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5" />
        </Svg>
      );
    case 'more':
      return (
        <Svg {...p}>
          <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />
        </Svg>
      );
    case 'sound-on':
      return (
        <Svg {...p}>
          <path d="M4 9h4l5-4v14l-5-4H4Z" />
          <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
        </Svg>
      );
    case 'sound-off':
      return (
        <Svg {...p}>
          <path d="M4 9h4l5-4v14l-5-4H4Z" />
          <path d="m17 9.5 5 5M22 9.5l-5 5" />
        </Svg>
      );
    case 'lock':
      return (
        <Svg {...p}>
          <rect x="5" y="11" width="14" height="10" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </Svg>
      );
    case 'signal':
      return (
        <Svg {...p}>
          <path d="M12 3 21 12 12 21 3 12Z" />
          <path d="M12 8 16 12 12 16 8 12Z" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'chevron-left':
      return (
        <Svg {...p}>
          <path d="m15 5-7 7 7 7" />
        </Svg>
      );
    case 'chevron-right':
      return (
        <Svg {...p}>
          <path d="m9 5 7 7-7 7" />
        </Svg>
      );
    case 'flag':
      return (
        <Svg {...p}>
          <path d="M5 21V4h11l-2 4 2 4H5" />
        </Svg>
      );
    case 'dice':
      return (
        <Svg {...p}>
          <path d="M12 2 21 7v10l-9 5-9-5V7Z" />
          <path d="M12 12 21 7M12 12 3 7M12 12v10" />
        </Svg>
      );
    case 'menu':
      return (
        <Svg {...p}>
          <path d="M4 7h16M4 12h16M4 17h10" />
        </Svg>
      );
  }
}

export type GlyphName =
  | 'plus'
  | 'check'
  | 'close'
  | 'repeat'
  | 'more'
  | 'sound-on'
  | 'sound-off'
  | 'lock'
  | 'signal'
  | 'chevron-left'
  | 'chevron-right'
  | 'flag'
  | 'dice'
  | 'menu';
