/** @type {import('tailwindcss').Config} */
// 专业化设计令牌（不改布局，仅重定调色板/字体/圆角/阴影）。深合并：只覆盖项目用到的色阶，
// 未覆盖者回退 Tailwind 默认，不会破坏其它颜色。
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
        // 中性色：改用更冷静专业的 slate 调（覆盖项目用到的色阶）。
        gray: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e9eef5',
          300: '#d7dee8',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        // 主色：更高级的靛蓝（indigo）替代原生 blue（按钮/链接/选中态/焦点）。
        blue: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
        // 成功/锁定态：emerald，比原生 green 更克制专业。
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
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        soft: '0 1px 2px rgba(15, 23, 42, 0.05)',
      },
    },
  },
  plugins: [],
};
