import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * The join QR code (ADR 0043): always the IP address with `http://`, dark on light with a quiet
 * zone, as an SVG path so it stays sharp at any size on the console and the TV.
 */
export function JoinQr({ url, size, label }: { url: string; size: number; label?: string }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
      }
    }
    return { path: d, count: n + 8 };
  }, [url]);
  return (
    <svg
      className="join-qr"
      width={size}
      height={size}
      viewBox={`0 0 ${count} ${count}`}
      role="img"
      aria-label={label ?? `QR code for ${url}`}
      shapeRendering="crispEdges"
    >
      <rect width={count} height={count} className="join-qr-light" />
      <path d={path} className="join-qr-dark" />
    </svg>
  );
}
