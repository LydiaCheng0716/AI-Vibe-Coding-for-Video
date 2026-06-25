// Vite 静态资源类型声明（tsconfig.types 未含 vite/client，这里自给）。
declare module '*.svg' {
  const src: string;
  export default src;
}
