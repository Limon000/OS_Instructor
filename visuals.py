"""Visual renderers for OS Instructor — one function per diagram type."""

import re
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import graphviz


# ── helpers ──────────────────────────────────────────────────────────────────

def _parse_processes(args: str) -> list[tuple[str, int]]:
    """Parse 'P1=4,P2=3,P3=5' into [('P1',4), ('P2',3), ('P3',5)]."""
    result = []
    for token in args.split(","):
        token = token.strip()
        if "=" in token:
            name, burst = token.split("=", 1)
            try:
                result.append((name.strip(), int(burst.strip())))
            except ValueError:
                pass
    return result


# ── graphviz renderers ────────────────────────────────────────────────────────

def render_process_state_diagram(_args: str = "") -> tuple[str, str]:
    dot = graphviz.Digraph(comment="Process State Diagram", format="svg")
    dot.attr(rankdir="LR", bgcolor="white")
    dot.attr("node", shape="ellipse", style="filled", fillcolor="#AED6F1", fontname="Arial")

    states = ["New", "Ready", "Running", "Waiting", "Terminated"]
    for s in states:
        dot.node(s)

    dot.edge("New", "Ready", label="admitted")
    dot.edge("Ready", "Running", label="scheduler\ndispatch")
    dot.edge("Running", "Ready", label="interrupt")
    dot.edge("Running", "Waiting", label="I/O or event\nwait")
    dot.edge("Waiting", "Ready", label="I/O or event\ncompletion")
    dot.edge("Running", "Terminated", label="exit")

    return "graphviz", dot.source


def render_os_layer_diagram(_args: str = "") -> tuple[str, str]:
    dot = graphviz.Digraph(comment="OS Layer Diagram", format="svg")
    dot.attr(rankdir="TB", bgcolor="white")
    dot.attr("node", shape="box", style="filled", fontname="Arial", width="4")

    layers = [
        ("user", "User Applications", "#FDEBD0"),
        ("api", "System Calls / API", "#FAD7A0"),
        ("kernel", "OS Kernel", "#A9CCE3"),
        ("hw", "Hardware", "#A9DFBF"),
    ]
    for node_id, label, color in layers:
        dot.node(node_id, label, fillcolor=color)

    for i in range(len(layers) - 1):
        dot.edge(layers[i][0], layers[i + 1][0])

    return "graphviz", dot.source


def render_semaphore_diagram(_args: str = "") -> tuple[str, str]:
    dot = graphviz.Digraph(comment="Producer-Consumer", format="svg")
    dot.attr(rankdir="LR", bgcolor="white")
    dot.attr("node", shape="box", style="filled", fontname="Arial")

    dot.node("P", "Producer", fillcolor="#AED6F1")
    dot.node("B", "Buffer\n(shared)", fillcolor="#FAD7A0", shape="cylinder")
    dot.node("C", "Consumer", fillcolor="#A9DFBF")
    dot.node("S1", "Semaphore\nempty", fillcolor="#E8DAEF", shape="diamond")
    dot.node("S2", "Semaphore\nfull", fillcolor="#E8DAEF", shape="diamond")

    dot.edge("P", "S1", label="wait(empty)")
    dot.edge("S1", "B", label="write")
    dot.edge("B", "S2", label="signal(full)")
    dot.edge("S2", "C", label="read")
    dot.edge("C", "S1", label="signal(empty)")

    return "graphviz", dot.source


def render_dining_philosophers(_args: str = "") -> tuple[str, str]:
    dot = graphviz.Graph(comment="Dining Philosophers", format="svg")
    dot.attr(bgcolor="white")
    dot.attr("node", fontname="Arial", style="filled")

    philosophers = ["P0", "P1", "P2", "P3", "P4"]
    forks = ["F0", "F1", "F2", "F3", "F4"]

    for p in philosophers:
        dot.node(p, p, shape="ellipse", fillcolor="#AED6F1")
    for f in forks:
        dot.node(f, f, shape="diamond", fillcolor="#FAD7A0")

    for i in range(5):
        dot.edge(philosophers[i], forks[i])
        dot.edge(philosophers[i], forks[(i + 1) % 5])

    return "graphviz", dot.source


# ── matplotlib renderers ──────────────────────────────────────────────────────

def render_gantt_chart(args: str = "") -> tuple[str, plt.Figure]:
    processes = _parse_processes(args) or [("P1", 4), ("P2", 3), ("P3", 5), ("P4", 2)]
    fig, ax = plt.subplots(figsize=(10, max(2, len(processes) * 0.6 + 1)))

    colors = plt.cm.Set3.colors
    start = 0
    for i, (name, burst) in enumerate(processes):
        ax.barh(0, burst, left=start, height=0.5, color=colors[i % len(colors)],
                edgecolor="black", linewidth=0.8)
        ax.text(start + burst / 2, 0, f"{name}\n({burst})", ha="center", va="center",
                fontsize=9, fontweight="bold")
        start += burst

    ax.set_xlim(0, start)
    ax.set_yticks([])
    ax.set_xlabel("Time Units")
    ax.set_title("CPU Scheduling — Gantt Chart (FCFS)", fontsize=12, fontweight="bold")
    ax.set_xticks(range(0, start + 1))
    ax.grid(axis="x", linestyle="--", alpha=0.5)
    plt.tight_layout()
    return "matplotlib", fig


def render_memory_hierarchy(_args: str = "") -> tuple[str, plt.Figure]:
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    ax.axis("off")

    levels = [
        (1, 8.5, "Registers", "#E74C3C", "white", "Fastest / Smallest"),
        (2, 7.0, "Cache (L1/L2/L3)", "#E67E22", "white", "~ns access"),
        (3, 5.5, "RAM (Main Memory)", "#F1C40F", "black", "~100ns access"),
        (4, 4.0, "SSD / Flash", "#2ECC71", "white", "~100μs access"),
        (5, 2.5, "Hard Disk (HDD)", "#3498DB", "white", "~10ms access"),
        (6, 1.0, "Tape / Cloud Archive", "#9B59B6", "white", "Slowest / Largest"),
    ]

    for i, (width_factor, y, label, color, text_color, note) in enumerate(levels):
        width = width_factor * 1.4
        x = (10 - width) / 2
        rect = mpatches.FancyBboxPatch((x, y - 0.5), width, 0.9,
                                        boxstyle="round,pad=0.05",
                                        facecolor=color, edgecolor="black")
        ax.add_patch(rect)
        ax.text(5, y, label, ha="center", va="center",
                fontsize=10, fontweight="bold", color=text_color)
        ax.text(5 + width / 2 + 0.3, y, note, ha="left", va="center",
                fontsize=8, color="gray")

    ax.set_title("Memory Hierarchy", fontsize=14, fontweight="bold", pad=10)
    plt.tight_layout()
    return "matplotlib", fig


def render_paging_diagram(_args: str = "") -> tuple[str, plt.Figure]:
    fig, axes = plt.subplots(1, 3, figsize=(12, 5))
    fig.suptitle("Paging: Logical → Page Table → Physical Memory", fontsize=12, fontweight="bold")

    # Logical address space
    ax1 = axes[0]
    ax1.set_title("Logical Address Space", fontsize=10)
    logical_pages = ["Page 0", "Page 1", "Page 2", "Page 3"]
    colors = ["#AED6F1", "#A9DFBF", "#FAD7A0", "#F1948A"]
    for i, (page, color) in enumerate(zip(logical_pages, colors)):
        ax1.barh(i, 1, color=color, edgecolor="black")
        ax1.text(0.5, i, page, ha="center", va="center", fontsize=9, fontweight="bold")
    ax1.set_xlim(0, 1)
    ax1.set_yticks([])
    ax1.set_xticks([])

    # Page table
    ax2 = axes[1]
    ax2.set_title("Page Table", fontsize=10)
    ax2.axis("off")
    table_data = [["Page #", "Frame #"], ["0", "3"], ["1", "7"], ["2", "1"], ["3", "5"]]
    table = ax2.table(cellText=table_data[1:], colLabels=table_data[0],
                      cellLoc="center", loc="center",
                      cellColours=[[c, "#F0F0F0"] for c in colors])
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1.5, 2)

    # Physical memory
    ax3 = axes[2]
    ax3.set_title("Physical Memory (Frames)", fontsize=10)
    frame_colors = ["#F0F0F0"] * 8
    frame_labels = ["Frame 0", "Frame 1\n(Page 2)", "Frame 2", "Frame 3\n(Page 0)",
                    "Frame 4", "Frame 5\n(Page 3)", "Frame 6", "Frame 7\n(Page 1)"]
    assigned = {3: colors[0], 7: colors[1], 1: colors[2], 5: colors[3]}
    for i in range(8):
        color = assigned.get(i, "#F0F0F0")
        ax3.barh(i, 1, color=color, edgecolor="black")
        ax3.text(0.5, i, frame_labels[i], ha="center", va="center", fontsize=8)
    ax3.set_xlim(0, 1)
    ax3.set_yticks([])
    ax3.set_xticks([])

    plt.tight_layout()
    return "matplotlib", fig


def render_page_replacement(args: str = "FIFO") -> tuple[str, plt.Figure]:
    algorithm = args.strip().upper() or "FIFO"
    reference_string = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2]
    n_frames = 3

    frames_history = []
    faults = []
    frames = []

    for page in reference_string:
        if page not in frames:
            faults.append(True)
            if len(frames) < n_frames:
                frames.append(page)
            else:
                frames.pop(0)  # FIFO
                frames.append(page)
        else:
            faults.append(False)
        frames_history.append(list(frames) + [None] * (n_frames - len(frames)))

    fig, ax = plt.subplots(figsize=(13, 4))
    ax.set_title(f"Page Replacement — {algorithm} (3 frames, ref string: {reference_string})",
                 fontsize=11, fontweight="bold")
    ax.axis("off")

    col_labels = [str(p) for p in reference_string]
    row_labels = [f"Frame {i}" for i in range(n_frames)]
    cell_text = [[str(frames_history[j][i]) if frames_history[j][i] is not None else ""
                  for j in range(len(reference_string))]
                 for i in range(n_frames)]

    cell_colors = []
    for i in range(n_frames):
        row_colors = []
        for j in range(len(reference_string)):
            if faults[j] and frames_history[j][i] is not None:
                row_colors.append("#F1948A")
            else:
                row_colors.append("#EAFAF1")
        cell_colors.append(row_colors)

    table = ax.table(cellText=cell_text, rowLabels=row_labels, colLabels=col_labels,
                     cellColours=cell_colors, cellLoc="center", loc="center")
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1, 2)

    fault_count = sum(faults)
    ax.text(0.5, 0.05, f"Page Faults: {fault_count} / {len(reference_string)}  (red = fault)",
            transform=ax.transAxes, ha="center", fontsize=10, color="#C0392B")

    plt.tight_layout()
    return "matplotlib", fig


def render_disk_scheduling(args: str = "") -> tuple[str, plt.Figure]:
    try:
        sequence = [int(x.strip()) for x in args.split(",") if x.strip().isdigit()]
    except ValueError:
        sequence = []
    if not sequence:
        sequence = [98, 183, 37, 122, 14, 124, 65, 67]

    head_start = 53
    order = [head_start] + sequence
    total_movement = sum(abs(order[i + 1] - order[i]) for i in range(len(order) - 1))

    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(range(len(order)), order, marker="o", color="#2980B9", linewidth=2, markersize=8)
    for i, val in enumerate(order):
        ax.annotate(str(val), (i, val), textcoords="offset points",
                    xytext=(0, 8), ha="center", fontsize=8)

    ax.set_title(f"Disk Scheduling — FCFS  (Total head movement: {total_movement} cylinders)",
                 fontsize=11, fontweight="bold")
    ax.set_xlabel("Request Order")
    ax.set_ylabel("Cylinder Number")
    ax.set_xticks(range(len(order)))
    ax.set_xticklabels(["Start"] + [f"R{i+1}" for i in range(len(sequence))], fontsize=8)
    ax.grid(True, linestyle="--", alpha=0.5)
    plt.tight_layout()
    return "matplotlib", fig


def render_raid_diagram(args: str = "RAID0") -> tuple[str, plt.Figure]:
    level = args.strip().upper() or "RAID0"
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.set_title(f"RAID Layout — {level}", fontsize=12, fontweight="bold")
    ax.axis("off")

    configs = {
        "RAID0": {"disks": 2, "label": "Striping (No redundancy)", "stripes": ["A1","A2","B1","B2","C1","C2"]},
        "RAID1": {"disks": 2, "label": "Mirroring (Full copy)", "stripes": ["A","A","B","B","C","C"]},
        "RAID5": {"disks": 3, "label": "Striping + Distributed Parity", "stripes": ["A1","A2","Ap","B1","Bp","B2","Cp","C1","C2"]},
    }
    cfg = configs.get(level, configs["RAID0"])
    n_disks = cfg["disks"]
    stripes = cfg["stripes"]
    colors = ["#AED6F1", "#A9DFBF", "#FAD7A0", "#F1948A", "#D7BDE2"]

    rows = (len(stripes) + n_disks - 1) // n_disks
    for i, label in enumerate(stripes):
        col = i % n_disks
        row = i // n_disks
        color = "#E8DAEF" if "p" in label.lower() else colors[col % len(colors)]
        rect = mpatches.FancyBboxPatch((col * 3 + 0.1, rows - row - 0.9), 2.6, 0.75,
                                        boxstyle="round,pad=0.05",
                                        facecolor=color, edgecolor="black")
        ax.add_patch(rect)
        ax.text(col * 3 + 1.4, rows - row - 0.5, label,
                ha="center", va="center", fontsize=11, fontweight="bold")

    for d in range(n_disks):
        ax.text(d * 3 + 1.4, rows + 0.3, f"Disk {d}", ha="center", fontsize=10,
                fontweight="bold", color="#2C3E50")

    ax.set_xlim(-0.2, n_disks * 3 + 0.2)
    ax.set_ylim(-0.2, rows + 0.7)
    ax.text(n_disks * 1.5, -0.1, cfg["label"], ha="center", fontsize=10,
            style="italic", color="#555")
    plt.tight_layout()
    return "matplotlib", fig


# ── dispatcher ────────────────────────────────────────────────────────────────

VISUAL_MAP = {
    "process_state_diagram": render_process_state_diagram,
    "gantt_chart": render_gantt_chart,
    "os_layer_diagram": render_os_layer_diagram,
    "memory_hierarchy": render_memory_hierarchy,
    "paging_diagram": render_paging_diagram,
    "page_replacement": render_page_replacement,
    "disk_scheduling": render_disk_scheduling,
    "raid_diagram": render_raid_diagram,
    "semaphore_diagram": render_semaphore_diagram,
    "dining_philosophers": render_dining_philosophers,
}


def render_visual(tag_name: str, args: str = ""):
    """Return (kind, data) where kind is 'matplotlib' or 'graphviz'."""
    renderer = VISUAL_MAP.get(tag_name)
    if renderer is None:
        return None, None
    return renderer(args)
