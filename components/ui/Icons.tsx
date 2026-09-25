type P = React.SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 20): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
});

export const PlayIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" fill="currentColor" stroke="none" /></svg>
);
export const PauseIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="6" y="4" width="4" height="16" rx="1.2" fill="currentColor" stroke="none" /><rect x="14" y="4" width="4" height="16" rx="1.2" fill="currentColor" stroke="none" /></svg>
);
export const SkipIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 5v14l10-7L5 5Z" fill="currentColor" stroke="none" /><path d="M19 5v14" strokeWidth={2.5} /></svg>
);
export const RestartIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M19 19V5L9 12l10 7Z" fill="currentColor" stroke="none" /><path d="M5 5v14" strokeWidth={2.5} /></svg>
);
export const HeartIcon = ({ size, filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base(size)} {...p}><path d="M19.5 12.57 12 20l-7.5-7.43A5 5 0 1 1 12 6.01a5 5 0 1 1 7.5 6.56Z" fill={filled ? "currentColor" : "none"} /></svg>
);
export const SearchIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const QueueIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M3 6h13M3 12h13M3 18h8" /><path d="M17 15v6l4-3-4-3Z" fill="currentColor" /></svg>
);
export const PlusIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 5v14M5 12h14" /></svg>
);
export const XIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const ChevronDown = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m6 9 6 6 6-6" /></svg>
);
export const ChevronUp = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m18 15-6-6-6 6" /></svg>
);
export const SendIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" fill="currentColor" /></svg>
);
export const LinkIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" /></svg>
);
export const HeadphonesIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4ZM3 19a2 2 0 0 0 2 2h1v-6H3v4Z" fill="currentColor" /></svg>
);
export const CheckIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m5 12 5 5L20 7" /></svg>
);
export const DoubleCheckIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m2 12 5 5L17 7" /><path d="m12 16 1 1L23 7" /></svg>
);
export const ClockIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></svg>
);
export const BackIcon = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="m15 18-6-6 6-6" /></svg>
);
