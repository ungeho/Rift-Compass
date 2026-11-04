import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface TopicTab { id: string; label: string; content: ReactNode }
/** 追加した先頭のリンクへ移動し、最後の「さらに表示」ボタンが消えても焦点を失わない。 */
export function revealTopicItems(button: HTMLButtonElement, from: number, update: () => void) {
  const list = button.previousElementSibling;
  update();
  requestAnimationFrame(() => {
    if (list?.isConnected) list.children[from]?.querySelector<HTMLElement>("a")?.focus();
  });
}
/** 各パネルを保持し、切り替えても絞り込みや段階表示を失わない。 */
export function TopicTabs({ tabs, initial, label = "Topic の情報" }: { tabs: TopicTab[]; initial: string; label?: string }) {
  const prefix = useId();
  const [active, setActive] = useState(initial);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const selected = tabs.some((t) => t.id === active) ? active : tabs[0]?.id;
  return <div className="topic-tabs">
    <div className="topic-tablist" role="tablist" aria-label={label}>
      {tabs.map((tab, i) => <button key={tab.id} ref={(el) => { if (el) buttons.current.set(tab.id, el); else buttons.current.delete(tab.id); }} type="button" role="tab" id={`${prefix}-tab-${tab.id}`} aria-controls={`${prefix}-panel-${tab.id}`} aria-selected={selected === tab.id} tabIndex={selected === tab.id ? 0 : -1} onClick={() => setActive(tab.id)} onKeyDown={(e) => {
        let next: number;
        if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        else return;
        e.preventDefault();
        setActive(tabs[next].id);
        buttons.current.get(tabs[next].id)?.focus();
      }}>{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <section className="topic-tabpanel" key={tab.id} id={`${prefix}-panel-${tab.id}`} role="tabpanel" aria-labelledby={`${prefix}-tab-${tab.id}`} hidden={selected !== tab.id} tabIndex={0}>{tab.content}</section>)}
  </div>;
}
