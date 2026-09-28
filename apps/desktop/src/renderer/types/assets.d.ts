/** Vite raw-text imports (used by renderer tests to load fixtures without the file system). */
declare module '*?raw' {
  const text: string;
  export default text;
}
