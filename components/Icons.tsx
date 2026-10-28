import type { ReactNode } from 'react';

const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const mk = (d: ReactNode) => function Icon({ size = 16 }: { size?: number }) { return <svg {...base} width={size} height={size}>{d}</svg>; };

export const IconMail = mk(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>);
export const IconLock = mk(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const IconEye = mk(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>);
export const IconEyeOff = mk(<><path d="M3 3l18 18M10.6 6.1A9.9 9.9 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6A16.5 16.5 0 0 0 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1" /></>);
export const IconArrowRight = mk(<path d="M5 12h14m-6-6 6 6-6 6" />);
export const IconChat = mk(<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12Z" />);
export const IconUser = mk(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const IconLogout = mk(<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9" />);
export const IconSend = mk(<path d="M12 19V5m-6 6 6-6 6 6" />);
export const IconSearch = mk(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>);
export const IconSwap = mk(<path d="M7 7h13m-4-4 4 4-4 4M17 17H4m4-4-4 4 4 4" />);
export const IconHand = mk(<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6m0-1V4a1.5 1.5 0 0 1 3 0v7m0-5a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2-3a1.5 1.5 0 0 1 2.4-1.8L8 14" />);
export const IconHeadset = mk(<path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H5a1 1 0 0 1-1-1v-4Zm16 0h-3v5h2a1 1 0 0 0 1-1v-4Zm-3 5a4 4 0 0 1-4 2h-1" />);
export const IconBot = mk(<><rect x="4" y="8" width="16" height="11" rx="3" /><path d="M12 8V4m-3 8v2m6-2v2" /></>);
export const IconKey = mk(<><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9m-3 3 3 3" /></>);
export const IconRefresh = mk(<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16m0 5v-5h5" />);
export const IconClose = mk(<path d="M6 6l12 12M18 6 6 18" />);
export const IconChevron = mk(<path d="m9 6 6 6-6 6" />);
export const IconCheck = mk(<path d="m5 12 5 5 9-10" />);
export const IconPanel = mk(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>);
