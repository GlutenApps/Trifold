/** Vite's `?raw` import: the file's text as a string (the phone audio helper, ADR 0007). */
declare module '*.ps1?raw' {
  const text: string;
  export default text;
}

/** The loading splash's self-contained page (splash.ts). */
declare module '*.html?raw' {
  const text: string;
  export default text;
}
