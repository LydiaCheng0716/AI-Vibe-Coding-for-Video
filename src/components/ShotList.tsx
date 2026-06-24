import type { Shot } from '../core/models';
import ShotCard from './ShotCard';

interface Props {
  shots: Shot[];
  onShotSaved: (shotId: string, prompt: string) => void;
}

export default function ShotList({ shots, onShotSaved }: Props) {
  if (shots.length === 0) return null;
  const ordered = [...shots].sort((a, b) => a.index - b.index);
  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold">分镜（{ordered.length} 个镜头）</h2>
      {ordered.map((s) => (
        <ShotCard key={s.id} shot={s} onSaved={onShotSaved} />
      ))}
    </div>
  );
}
