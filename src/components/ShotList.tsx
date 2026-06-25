import type { Project, Shot } from '../core/models';
import ShotCard from './ShotCard';

interface Props {
  project: Project;
  /** 全局 LLM 锁占用中：禁用单镜头重写。 */
  busy: boolean;
  /** 是否保存 Key（App 读一次下传）。 */
  persistApiKey: boolean;
  onShotChanged: (shot: Shot) => void;
}

export default function ShotList({ project, busy, persistApiKey, onShotChanged }: Props) {
  const shots = project.shots;
  if (shots.length === 0) return null;
  const ordered = [...shots].sort((a, b) => a.index - b.index);
  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 className="text-sm font-semibold">分镜（{ordered.length} 个镜头）</h2>
      {ordered.map((s) => (
        <ShotCard
          key={s.id}
          shot={s}
          project={project}
          busy={busy}
          persistApiKey={persistApiKey}
          onShotChanged={onShotChanged}
        />
      ))}
    </div>
  );
}
