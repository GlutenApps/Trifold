// Vite serves imported image files as URLs; the renderer imports only the brand SVGs this way.
declare module '*.svg' {
  const url: string;
  export default url;
}
