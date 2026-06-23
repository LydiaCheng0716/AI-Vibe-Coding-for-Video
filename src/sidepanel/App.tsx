import StoryInput from '../components/StoryInput';

export default function App() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200 px-3 py-2">
        <h1 className="text-base font-semibold">StoryBoard AI</h1>
        <p className="text-xs text-gray-500">把故事变成分镜与提示词</p>
      </header>
      <main>
        <StoryInput />
      </main>
    </div>
  );
}
