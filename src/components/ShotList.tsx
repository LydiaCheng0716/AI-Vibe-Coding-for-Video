import type { Project, Shot } from '../core/models';
import ShotCard from './ShotCard';

interface Props {
  project: Project;
  /** 全局 LLM 锁占用中：禁用单镜头重写。 */
  busy: boolean;
  onShotChanged: (shot: Shot) => void;
}

export default function ShotList({ project, busy, onShotChanged }: Props) {
  const shots = project.shots;
  if (shots.length === 0) return null;
  const ordered = [...shots].sort((a, b) => a.index - b.index);
  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold">分镜（{ordered.length} 个镜头）</h2>
      {ordered.map((s) => (
        <ShotCard key={s.id} shot={s} project={project} busy={busy} onShotChanged={onShotChanged} />
      ))}
    </div>
  );
}
