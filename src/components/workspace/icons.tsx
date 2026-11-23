import type { SVGProps } from 'react';

/** Stroke icons drawn on a 20px grid. They inherit colour from the text. */
const Icon = ({ children, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    {children}
  </svg>
);

export const IconPlus = () => (
  <Icon>
    <path d="M10 4v12M4 10h12" />
  </Icon>
);
export const IconMenu = () => (
  <Icon>
    <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
  </Icon>
);
export const IconClose = () => (
  <Icon>
    <path d="M5 5l10 10M15 5L5 15" />
  </Icon>
);
export const IconSend = () => (
  <Icon strokeWidth="1.8">
    <path d="M10 15.5v-11M5.5 9L10 4.5 14.5 9" />
  </Icon>
);
export const IconSearch = () => (
  <Icon>
    <circle cx="9" cy="9" r="4.75" />
    <path d="M12.5 12.5L16 16" />
  </Icon>
);
export const IconBook = () => (
  <Icon>
    <path d="M4 4.5h4.5A1.5 1.5 0 0110 6v10a1.5 1.5 0 00-1.5-1.5H4zM16 4.5h-4.5A1.5 1.5 0 0010 6v10a1.5 1.5 0 011.5-1.5H16z" />
  </Icon>
);
export const IconOutline = () => (
  <Icon>
    <path d="M7.5 6h9M7.5 10h9M7.5 14h9M3.5 6h.01M3.5 10h.01M3.5 14h.01" />
  </Icon>
);
export const IconSlide = () => (
  <Icon>
    <rect x="3" y="4.5" width="14" height="9" rx="1" />
    <path d="M7 16.5h6" />
  </Icon>
);
export const IconTrash = () => (
  <Icon>
    <path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6" />
  </Icon>
);
export const IconOrder = () => (
  <Icon>
    <path d="M7 4.5v11M4.5 7L7 4.5 9.5 7M13 15.5v-11M10.5 13l2.5 2.5 2.5-2.5" />
  </Icon>
);
export const IconPalette = () => (
  <Icon>
    <circle cx="10" cy="10" r="6.5" />
    <path d="M10 3.5v13" />
    <path d="M10 3.5a6.5 6.5 0 010 13z" fill="currentColor" stroke="none" />
  </Icon>
);
export const IconIdea = () => (
  <Icon>
    <path d="M7.5 13.5a4.5 4.5 0 115 0V15h-5zM8 17h4" />
  </Icon>
);
export const IconNote = () => (
  <Icon>
    <path d="M10 6.5v4.5M10 13.5v.01" />
    <circle cx="10" cy="10" r="6.5" />
  </Icon>
);
export const IconDesktop = () => (
  <Icon>
    <rect x="2.5" y="4" width="15" height="10" rx="1" />
    <path d="M7.5 16.5h5M10 14v2.5" />
  </Icon>
);
export const IconPhone = () => (
  <Icon>
    <rect x="6" y="2.5" width="8" height="15" rx="1.5" />
    <path d="M9.25 15h1.5" />
  </Icon>
);
export const IconLink = () => (
  <Icon>
    <path d="M8.5 11.5a3 3 0 004.2 0l2.3-2.3a3 3 0 00-4.2-4.2l-.8.8M11.5 8.5a3 3 0 00-4.2 0L5 10.8A3 3 0 009.2 15l.8-.8" />
  </Icon>
);
export const IconExternal = () => (
  <Icon>
    <path d="M11.5 4.5h4v4M15.5 4.5L9 11M13.5 11.5v4h-9v-9h4" />
  </Icon>
);
export const IconChevron = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M6.5 8l3.5 3.5L13.5 8" />
  </Icon>
);
export const IconCheck = () => (
  <Icon>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </Icon>
);
