import type { CSSProperties } from "react";
export type IconName =
  | "sparkles"
  | "overview"
  | "bills"
  | "chart"
  | "wallet"
  | "settings"
  | "arrow"
  | "plus"
  | "search"
  | "bell"
  | "sun"
  | "moon"
  | "monitor"
  | "close"
  | "logout"
  | "chevron"
  | "check"
  | "clock"
  | "link"
  | "help"
  | "refresh"
  | "menu"
  | "download"
  | "eye"
  | "eye-off"
  | "language"
  | "user"
  | "lock"
  | "shield"
  | "fingerprint";
const paths: Record<IconName, string> = {
  sparkles:
    "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z M20 2v4 M18 4h4",
  lock: "M7 10V7a5 5 0 0 1 10 0v3 M5 10h14v11H5z M12 14v3",
  shield: "M12 2l8 4v6c0 5-8 10-8 10s-8-5-8-10V6z M8 12l3 3 5-6",
  fingerprint:
    "M8 10a4 4 0 0 1 8 0v4 M5 11v-1a7 7 0 0 1 14 0v3 M12 9v5c0 4-2 6-3 8 M8 14c0 3-1 5-3 6 M16 17c0 2-1 4-2 5 M3 14v1 M20 16l-1 4",

  language:
    "M3 5h12 M9 3v2 M6 5c0 6 3 9 7 11 M12 5c0 6-4 10-9 12 M14 21l4-11 4 11 M16 17h4",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  "eye-off":
    "M3 3l18 18 M9 5.5A12 12 0 0 1 12 5c6 0 10 7 10 7a22 22 0 0 1-4 4 M6 6a22 22 0 0 0-4 6s4 7 10 7a13 13 0 0 0 5-1 M10 10a3 3 0 0 0 4 4",
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  bills: "M6 3h12v18l-3-2-3 2-3-2-3 2V3z M9 8h6 M9 12h6",
  chart: "M4 3v17h17 M8 15v-4 M13 15V7 M18 15V5",
  wallet:
    "M20 8V5H4a2 2 0 0 0 0 4h17v11H4a2 2 0 0 1-2-2V7 M21 12h-6v4h6 M17 14h.01",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M10 2h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L2 9l2-4 3 1 3-1z",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  plus: "M12 5v14 M5 12h14",
  search: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5",
  bell: "M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3 M10 21h4",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11z",
  monitor: "M3 3h18v13H3z M12 16v5 M8 21h8",
  close: "M6 6l12 12 M6 18L18 6",
  logout: "M10 3H4v18h6 M9 12h12 M17 8l4 4-4 4",
  chevron: "M8 4l8 8-8 8",
  check: "M5 12l4 4L19 6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
  link: "M10 14l4-4 M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0 M16 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9 9a3 3 0 1 1 4 3v2 M12 17h.01",
  refresh:
    "M20 7v5h-5 M4 17v-5h5 M5 8a8 8 0 0 1 13-3l2 3 M4 16l2 3a8 8 0 0 0 13-3",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
};
export default function Icon({
  name,
  className = "",
  style,
}: {
  name: IconName;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={`icon ${className}`}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
