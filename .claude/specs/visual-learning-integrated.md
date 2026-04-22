# Visual Learning Integration

## Overview
When Limon teaches an OS topic, the Streamlit UI automatically renders a matching diagram, chart, or graph alongside the text — no image generation needed. Visuals are pre-built renderers in `visuals.py`, triggered by special tags the LLM embeds in its response.

## How It Works

1. **LLM embeds a tag** at the end of its response:
   ```
   [VISUAL:process_state_diagram]
   [VISUAL:gantt_chart:P1=4,P2=3,P3=5]
   ```

2. **`app.py`** parses the tag with `parse_visual_tag()`, strips it from displayed text, and calls `render_visual(tag_name, args)`.

3. **`visuals.py`** returns `(kind, data)` — either a `matplotlib` figure or a `graphviz` source string.

4. **Streamlit** renders it with `st.pyplot()` or `st.graphviz_chart()`.

## Visual Library

| Tag | Diagram | Library | OS Topic |
|-----|---------|---------|----------|
| `process_state_diagram` | State machine (New→Ready→Running→Waiting→Terminated) | graphviz | 2.1 |
| `gantt_chart` | CPU scheduling Gantt chart | matplotlib | 2.2, 3.x |
| `os_layer_diagram` | OS layered architecture | graphviz | 1.3 |
| `memory_hierarchy` | Memory pyramid (Registers→Cache→RAM→Disk) | matplotlib | 5.1 |
| `paging_diagram` | Logical→Page Table→Physical grid | matplotlib | 5.3 |
| `page_replacement` | Frame table with fault highlighting | matplotlib | 6.1 |
| `disk_scheduling` | Disk head movement line chart | matplotlib | 7.4 |
| `raid_diagram` | RAID 0/1/5 block layout | matplotlib | 7.5 |
| `semaphore_diagram` | Producer→Buffer→Consumer flow | graphviz | 4.2 |
| `dining_philosophers` | Circular philosopher–fork graph | graphviz | 4.3 |

## Tag Format

```
[VISUAL:tag_name]                      # no args
[VISUAL:gantt_chart:P1=4,P2=3,P3=2]   # with burst times
[VISUAL:disk_scheduling:98,183,37]     # with cylinder sequence
[VISUAL:page_replacement:FIFO]         # with algorithm name
[VISUAL:raid_diagram:RAID5]            # with RAID level
```

## Adding a New Visual

1. Add a renderer function to `visuals.py`:
   ```python
   def render_my_visual(args: str = "") -> tuple[str, any]:
       # build matplotlib fig or graphviz source
       return "matplotlib", fig   # or "graphviz", dot.source
   ```

2. Register it in `VISUAL_MAP`:
   ```python
   VISUAL_MAP["my_visual"] = render_my_visual
   ```

3. Add the tag rule to `.claude/instructor.md` under the VISUAL TAGGING RULE section.

## Files

| File | Role |
|------|------|
| `visuals.py` | All renderer functions + `VISUAL_MAP` dispatcher |
| `app.py` | `parse_visual_tag()` + `display_visual()` integration |
| `.claude/instructor.md` | VISUAL TAGGING RULE — tells Limon when/how to emit tags |

---

## Visual Tagging Rule (from instructor.md)

When Limon explains a concept that has a visual representation, it appends **exactly one tag** at the very end of its response. The app renders the diagram automatically.

```
[VISUAL:process_state_diagram]      → process lifecycle / states (Topic 2.1)
[VISUAL:gantt_chart:P1=4,P2=3]     → CPU scheduling Gantt (Topics 2.2, 3.x)
[VISUAL:os_layer_diagram]           → OS architecture / layers (Topic 1.3)
[VISUAL:memory_hierarchy]           → memory pyramid hierarchy (Topic 5.1)
[VISUAL:paging_diagram]             → paging / page tables (Topic 5.3)
[VISUAL:page_replacement:FIFO]      → page replacement algorithm (Topic 6.1)
[VISUAL:disk_scheduling:98,183,37]  → disk scheduling head movement (Topic 7.4)
[VISUAL:raid_diagram:RAID5]         → RAID block layout (Topic 7.5)
[VISUAL:semaphore_diagram]          → semaphore / producer-consumer (Topic 4.2)
[VISUAL:dining_philosophers]        → dining philosophers graph (Topic 4.3)
```

**Rules:**
- At most ONE tag per response
- Only append when the tag directly matches the topic being taught
- For `gantt_chart`: include burst times as `P1=burst,P2=burst,...`
- For `disk_scheduling`: include request queue as comma-separated cylinder numbers
- For `page_replacement`: include algorithm name (`FIFO`, `LRU`, or `Optimal`)
- For `raid_diagram`: include level (`RAID0`, `RAID1`, or `RAID5`)
