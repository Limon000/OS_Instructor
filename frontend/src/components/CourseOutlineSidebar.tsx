import { useEffect, useState } from "react";
import { MODULES, isModuleComplete } from "../data/courseOutline";
import { useSession } from "../context/SessionContext";

interface Props {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function CourseOutlineSidebar({ mobileOpen = false, onClose }: Props) {
  const { currentTopicId, completedTopics, goToTopic, isTeachingTopic } = useSession();
  const [expanded, setExpanded] = useState<Set<number>>(new Set([1]));

  // Auto-expand the module that contains the active topic
  useEffect(() => {
    if (!currentTopicId) return;
    const modNum = parseInt(currentTopicId.split(".")[0], 10);
    setExpanded((prev) => new Set([...prev, modNum]));
  }, [currentTopicId]);

  const toggleModule = (num: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });

  const completedSet = new Set(completedTopics);
  const totalCompleted = completedTopics.length;
  const totalTopics = MODULES.reduce((s, m) => s + m.topics.length, 0);

  return (
    <aside className={`cos-sidebar${mobileOpen ? " open" : ""}`} aria-label="Course outline">
      <div className="cos-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="cos-title">Course Outline</div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close course outline"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#6b7280" }}
            >
              ✕
            </button>
          )}
        </div>
        <div className="cos-progress-text">
          {totalCompleted}/{totalTopics} topics
        </div>
        <div className="cos-progress-bar">
          <div
            className="cos-progress-fill"
            style={{ width: `${(totalCompleted / totalTopics) * 100}%` }}
          />
        </div>
      </div>

      <nav aria-label="Module list">
        {MODULES.map((mod) => {
          const isOpen = expanded.has(mod.num);
          const modComplete = isModuleComplete(mod.num, completedTopics);

          return (
            <div key={mod.num} className="cos-module">
              <button
                className="cos-module-header"
                onClick={() => toggleModule(mod.num)}
                aria-expanded={isOpen}
              >
                <span className="cos-module-chevron">{isOpen ? "▾" : "▸"}</span>
                <span className="cos-module-name">
                  {modComplete && <span className="cos-check">✅ </span>}
                  M{mod.num}. {mod.title}
                </span>
                <span className="cos-module-count">
                  {mod.topics.filter((t) => completedSet.has(t.id)).length}/{mod.topics.length}
                </span>
              </button>

              {isOpen && (
                <ul className="cos-topic-list" role="list">
                  {mod.topics.map((topic) => {
                    const done = completedSet.has(topic.id);
                    const active = topic.id === currentTopicId;
                    return (
                      <li key={topic.id}>
                        <button
                          className={`cos-topic-row${active ? " active" : done ? " done" : ""}`}
                          onClick={() => !isTeachingTopic && goToTopic(topic.id)}
                          disabled={isTeachingTopic}
                          aria-current={active ? "true" : undefined}
                          title={topic.title}
                        >
                          <span className="cos-topic-icon" aria-hidden="true">
                            {done ? "✅" : active ? "▶" : "○"}
                          </span>
                          <span className="cos-topic-label">
                            {topic.id}: {topic.title}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
