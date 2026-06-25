/** @type {import('tailwindcss').Config} */
// 品牌化设计令牌（FireUG：以灰为主、红点缀；中性灰 + 黑白 + 红强调）。不改布局，只重定调色板/字体/圆角/阴影。
// 深合并：仅覆盖项目实际用到的色阶，未覆盖者回退 Tailwind 默认（零破坏）。
// 注：品牌红当前用一版高对比红（accent 600 = #c81e2a）；拿到官网精确红值后只需改这里的 red/blue 600。
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // 主基调：中性灰（黑/白/灰），不带蓝调，贴合「深灰·浅灰·黑·白」。
        gray: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e7e7e7',
          300: '#d6d6d6',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
        },
        // 品牌红 = 唯一强调色（点缀）。原 blue 类（主按钮/链接/选中/焦点）全部映射为红。
        blue: {
          50: '#fef2f2',
          100: '#fde8e8',
          200: '#f9c9cc',
          400: '#ef5a63',
          500: '#e11d2a',
          600: '#c81e2a',
          700: '#a3161f',
        },
        // 危险/错误（删除/报错）统一到同一品牌红家族，避免双红不一致。
        red: {
          50: '#fef2f2',
          100: '#fde8e8',
          500: '#e11d2a',
          600: '#c81e2a',
          700: '#a3161f',
        },
        // 锁定/成功：保留一抹克制的 emerald（语义功能色，用量极少，不喧宾夺主）。
        green: {
          50: '#ecfdf5',
          100: '#d1fae5',
          300: '#6ee7b7',
          700: '#047857',
          800: '#065f46',
        },
      },
      borderRadius: {
        // 略增基础圆角，整体更现代柔和（不影响盒模型尺寸 → 不改布局）。
        DEFAULT: '0.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(23, 23, 23, 0.05), 0 1px 3px rgba(23, 23, 23, 0.07)',
        soft: '0 1px 2px rgba(23, 23, 23, 0.05)',
      },
    },
  },
  plugins: [],
};
