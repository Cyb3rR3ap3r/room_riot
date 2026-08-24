export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';
export type PageKind = 'host-page' | 'player-page' | 'display-page';

export function getPageKind(pathname: string): PageKind {
  if (pathname === '/host' || pathname.startsWith('/host/')) return 'host-page';
  if (pathname === '/play' || pathname.startsWith('/play/')) return 'player-page';
  return 'display-page';
}

export function getConnectionPresentation(
  status: ConnectionStatus,
): { readonly message: string; readonly isError: boolean } | null {
  if (status === 'connected') return null;
  return status === 'connecting'
    ? { message: 'Connecting to Room Riot…', isError: false }
    : { message: 'Connection lost. Reconnecting automatically…', isError: true };
}
