import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";

/* ── Data ─────────────────────────────────────────────────────────────────── */

const MODULES = [
  {
    num: 1,
    title: "Introduction to Operating Systems",
    topics: [
      "What is an OS? Goals & Functions",
      "Types of OS (Batch, Time-Sharing, Real-Time, Distributed)",
      "OS Structure (Monolithic, Microkernel, Layered, Hybrid)",
      "System Calls & API",
      "OS Boot Process",
    ],
  },
  {
    num: 2,
    title: "Process Management",
    topics: [
      "Process Concept, PCB, Process States",
      "Process Scheduling (FCFS, SJF, Round Robin, Priority)",
      "Context Switching",
      "Inter-Process Communication (IPC)",
      "Threads & Multithreading Models",
    ],
  },
  {
    num: 3,
    title: "CPU Scheduling",
    topics: [
      "Scheduling Criteria & Metrics",
      "Preemptive vs Non-Preemptive Scheduling",
      "Multilevel Queue & Feedback Queue",
      "Real-Time CPU Scheduling",
      "Algorithm Evaluation",
    ],
  },
  {
    num: 4,
    title: "Process Synchronization",
    topics: [
      "The Critical Section Problem",
      "Mutex Locks & Semaphores",
      "Classic Problems (Producer-Consumer, Readers-Writers, Dining Philosophers)",
      "Monitors",
      "Deadlocks: Detection, Prevention, Avoidance, Recovery",
    ],
  },
  {
    num: 5,
    title: "Memory Management",
    topics: [
      "Memory Hierarchy & Address Binding",
      "Contiguous Allocation, Fragmentation",
      "Paging & Page Tables",
      "Segmentation",
      "Virtual Memory & Demand Paging",
    ],
  },
  {
    num: 6,
    title: "Virtual Memory",
    topics: [
      "Page Replacement Algorithms (FIFO, LRU, Optimal)",
      "Thrashing",
      "Working Set Model",
      "Memory-Mapped Files",
    ],
  },
  {
    num: 7,
    title: "Storage & File Systems",
    topics: [
      "File Concept & Access Methods",
      "Directory Structure",
      "File System Implementation",
      "Disk Scheduling Algorithms (SSTF, SCAN, C-SCAN)",
      "RAID Levels",
    ],
  },
  {
    num: 8,
    title: "I/O Systems",
    topics: [
      "I/O Hardware & Mechanisms",
      "Kernel I/O Subsystem",
      "Buffering, Caching, Spooling",
      "I/O Performance",
    ],
  },
  {
    num: 9,
    title: "Security & Protection",
    topics: [
      "Goals of Protection",
      "Access Matrix & Capability Lists",
      "OS Security Threats",
      "Cryptography Basics in OS Context",
    ],
  },
  {
    num: 10,
    title: "Advanced Topics",
    topics: [
      "Distributed Systems Overview",
      "Virtualization & Hypervisors",
      "Cloud OS Concepts",
      "Linux Internals Overview",
    ],
  },
];

const REVIEWS = [
  {
    name: "Arjun Mehta",
    color: "#7c3aed",
    rating: 5,
    date: "April 2025",
    text: "The AI instructor explains concepts with perfect analogies. I finally understood the Banker's Algorithm after struggling for weeks. Highly recommended!",
  },
  {
    name: "Priya Sharma",
    color: "#059669",
    rating: 5,
    date: "March 2025",
    text: "The visual diagrams for process states and scheduling algorithms are incredibly helpful. The adaptive learning mode (Mode C) was a game changer for me.",
  },
  {
    name: "Rahul Das",
    color: "#dc2626",
    rating: 4,
    date: "February 2025",
    text: "Great structured roadmap in Mode B. Covered all 10 modules systematically. Would love more interactive coding exercises in future updates.",
  },
];

/* ── Sub-components ───────────────────────────────────────────────────────── */

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="hp-stars" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}{"☆".repeat(5 - rating)}
    </span>
  );
}

function ModuleAccordion() {
  const [open, setOpen] = useState<Set<number>>(new Set([1]));

  const toggle = (num: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });

  const totalTopics = MODULES.reduce((s, m) => s + m.topics.length, 0);

  return (
    <>
      <div className="hp-content-summary">
        <span>{MODULES.length} modules</span>
        <span>•</span>
        <span>{totalTopics} topics</span>
        <span>•</span>
        <span>All levels</span>
      </div>
      <div className="hp-accordion" role="list">
        {MODULES.map((mod) => {
          const isOpen = open.has(mod.num);
          return (
            <div key={mod.num} className="hp-module" role="listitem">
              <button
                className="hp-module-header"
                onClick={() => toggle(mod.num)}
                aria-expanded={isOpen}
                aria-controls={`module-topics-${mod.num}`}
              >
                <div className="hp-module-left">
                  <span className={`hp-module-chevron${isOpen ? " open" : ""}`}>▶</span>
                  <span className="hp-module-title">
                    Module {mod.num} — {mod.title}
                  </span>
                </div>
                <span className="hp-module-meta">{mod.topics.length} topics</span>
              </button>

              {isOpen && (
                <div id={`module-topics-${mod.num}`} className="hp-module-topics">
                  {mod.topics.map((topic, i) => (
                    <div key={i} className="hp-topic-row">
                      <span className="hp-topic-icon">▶</span>
                      <span className="hp-topic-name">
                        Topic {mod.num}.{i + 1}: {topic}
                      </span>
                      <span className="hp-topic-dur">~20 min</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function ReviewSection() {
  const [starHover, setStarHover] = useState(0);
  const [starSelected, setStarSelected] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (starSelected === 0 || reviewText.trim() === "") return;
    setSubmitted(true);
  };

  return (
    <section aria-label="Student reviews">
      <div className="hp-reviews-header">
        <h3>Student Reviews</h3>
      </div>

      <div className="hp-rating-summary">
        <div className="hp-rating-big">4.8</div>
        <div className="hp-rating-detail">
          <StarRating rating={5} />
          <span style={{ fontSize: 12, color: "#6b7280" }}>Course Rating</span>
        </div>
      </div>

      {/* Review form */}
      <div className="hp-review-form">
        <h4>Write a Review</h4>
        {submitted ? (
          <p style={{ color: "#16a34a", fontSize: 13, margin: 0 }}>
            Thank you for your review! ✓
          </p>
        ) : (
          <>
            <div className="hp-star-input" role="group" aria-label="Select rating">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  className={`hp-star-btn${s <= (starHover || starSelected) ? " filled" : ""}`}
                  onMouseEnter={() => setStarHover(s)}
                  onMouseLeave={() => setStarHover(0)}
                  onClick={() => setStarSelected(s)}
                  aria-label={`${s} star`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              className="hp-review-textarea"
              placeholder="Share your experience with OS Instructor..."
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              aria-label="Review text"
            />
            <button className="hp-review-submit" onClick={handleSubmit}>
              Post Review
            </button>
          </>
        )}
      </div>

      {/* Existing reviews */}
      {REVIEWS.map((r, i) => (
        <div key={i} className="hp-review-card">
          <div
            className="hp-review-avatar"
            style={{ background: r.color }}
            aria-hidden="true"
          >
            {r.name[0]}
          </div>
          <div className="hp-review-body">
            <div className="hp-review-top">
              <span className="hp-review-name">{r.name}</span>
              <span className="hp-review-stars">{"★".repeat(r.rating)}</span>
              <span className="hp-review-date">{r.date}</span>
            </div>
            <p className="hp-review-text">{r.text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */

type Tab = "description" | "content" | "howto";

export default function HomePage() {
  const navigate = useNavigate();
  const onStart = () => navigate("/select");
  const onLogin = () => navigate("/login");
  const [tab, setTab] = useState<Tab>("description");

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      {/* Navbar */}
      <nav className="hp-nav" role="navigation" aria-label="Main navigation">
        <a href="#" className="hp-nav-logo" onClick={(e) => e.preventDefault()}>
          <div className="hp-nav-logo-icon" aria-hidden="true">💻</div>
          OS Instructor
        </a>
        <ul className="hp-nav-links" role="list">
          <li><a href="#">Courses</a></li>
          <li><a href="#">Roadmap</a></li>
          <li><a href="#">About</a></li>
          <li><a href="#">Contact Us</a></li>
        </ul>
        <div className="hp-nav-actions">
          <button className="hp-btn-ghost" onClick={onLogin}>Login</button>
          <button className="hp-btn-primary" onClick={onStart}>Start Learning</button>
        </div>
      </nav>

      {/* Hero Banner */}
      <header className="hp-hero-banner">
        <div className="hp-hero-inner">
          <div className="hp-breadcrumb">
            Courses <span>›</span> Computer Science <span>›</span> Operating Systems
          </div>
          <h1 className="hp-hero-title">
            Operating Systems: Complete Course with AI Instructor
          </h1>
          <p className="hp-hero-subtitle">
            Master OS concepts from processes and scheduling to memory management,
            file systems, and virtualization — taught by an adaptive AI that
            learns how you learn.
          </p>
          <div className="hp-hero-meta">
            <div className="hp-rating">
              <span className="hp-stars">★★★★★</span>
              <strong>4.8</strong>
              <span style={{ opacity: 0.7 }}>(342 ratings)</span>
            </div>
            <span>2,400+ students</span>
            <div className="hp-hero-instructor">
              <div className="hp-avatar" aria-hidden="true">L</div>
              <span>Instructor: <strong>Limon</strong> (AI)</span>
            </div>
            <span className="hp-hero-badge">Updated May 2025</span>
            <span className="hp-hero-badge">10 Modules</span>
            <span className="hp-hero-badge">Free</span>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="hp-body">
        {/* Main content */}
        <main>
          {/* Tabs */}
          <div className="hp-tabs" role="tablist" aria-label="Course sections">
            {(
              [
                ["description", "Description"],
                ["content", "Course Content"],
                ["howto", "How to Use"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                aria-controls={`tabpanel-${key}`}
                className={`hp-tab${tab === key ? " active" : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Description tab */}
          {tab === "description" && (
            <div
              id="tabpanel-description"
              role="tabpanel"
              aria-labelledby="tab-description"
              className="hp-description"
            >
              <h3>About this course</h3>
              <p>
                This course covers all fundamental and advanced Operating Systems
                topics, mirroring the curriculum from Silberschatz's <em>Operating
                System Concepts</em> (Dinosaur Book, 10th Ed.) and Tanenbaum's
                <em>Modern Operating Systems</em>. The AI instructor adapts
                explanations to your level — whether you're a complete beginner
                or brushing up for interviews or exams.
              </p>
              <p>
                Ask about any topic and receive structured explanations with
                real-world analogies, pseudocode, and diagram visualizations.
                Choose your learning mode: topic-by-topic, full structured
                roadmap, or a diagnostic assessment first.
              </p>

              <h3 style={{ marginTop: 24 }}>What you'll learn</h3>
              <ul className="hp-learn-list">
                <li>Process management, scheduling algorithms, and IPC</li>
                <li>Memory management: paging, segmentation, virtual memory</li>
                <li>Synchronization: semaphores, monitors, deadlock handling</li>
                <li>CPU scheduling: FCFS, SJF, Round Robin, Multilevel Queue</li>
                <li>File systems: FAT, inode, disk scheduling</li>
                <li>I/O subsystem: buffering, caching, spooling</li>
                <li>Security: access control, threats, cryptography in OS</li>
                <li>Virtualization, hypervisors, and cloud OS concepts</li>
                <li>Linux internals and real-world OS examples</li>
                <li>How to answer OS exam and interview questions</li>
              </ul>

              <div className="hp-ref-box">
                <h4>Reference Books</h4>
                <div className="hp-ref-item">
                  <span className="hp-ref-icon">📘</span>
                  <span>
                    <strong>Operating System Concepts</strong> — Silberschatz,
                    Galvin & Gagne (Dinosaur Book, 10th Ed.)
                  </span>
                </div>
                <div className="hp-ref-item">
                  <span className="hp-ref-icon">📗</span>
                  <span>
                    <strong>Modern Operating Systems</strong> — Andrew S.
                    Tanenbaum
                  </span>
                </div>
                <div className="hp-ref-item">
                  <span className="hp-ref-icon">🐧</span>
                  <span>
                    Linux man pages, real-world examples from Linux, Windows &
                    macOS
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Course Content tab */}
          {tab === "content" && (
            <div
              id="tabpanel-content"
              role="tabpanel"
              aria-labelledby="tab-content"
            >
              <ModuleAccordion />
            </div>
          )}

          {/* How to Use tab */}
          {tab === "howto" && (
            <div
              id="tabpanel-howto"
              role="tabpanel"
              aria-labelledby="tab-howto"
            >
              <div className="hp-howto-section">
                <h3>How to Get Started</h3>
                <div className="hp-steps">
                  <div className="hp-step">
                    <div className="hp-step-num">1</div>
                    <div className="hp-step-body">
                      <h4>Click "Start Learning"</h4>
                      <p>
                        Press the Start Learning button on the right. The AI
                        instructor will greet you and present three learning
                        modes.
                      </p>
                    </div>
                  </div>
                  <div className="hp-step">
                    <div className="hp-step-num">2</div>
                    <div className="hp-step-body">
                      <h4>Choose Your Learning Mode</h4>
                      <p>
                        Select the mode that fits your goal (see below). You
                        can switch modes any time by starting a new session.
                      </p>
                    </div>
                  </div>
                  <div className="hp-step">
                    <div className="hp-step-num">3</div>
                    <div className="hp-step-body">
                      <h4>Ask Questions Freely</h4>
                      <p>
                        Type any OS question. The instructor explains with
                        structured points, analogies, and optional visual
                        diagrams (Gantt charts, state diagrams, memory maps).
                      </p>
                    </div>
                  </div>
                  <div className="hp-step">
                    <div className="hp-step-num">4</div>
                    <div className="hp-step-body">
                      <h4>Save & Resume Sessions</h4>
                      <p>
                        Your session is automatically saved. When you return,
                        the instructor will recap what you covered and continue
                        from where you left off.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hp-howto-section">
                <h3>Learning Modes</h3>
                <div className="hp-mode-cards">
                  <div className="hp-mode-card">
                    <div className="hp-mode-card-emoji">📖</div>
                    <h4>Mode A — Topic Explorer</h4>
                    <p>
                      Ask about any specific OS topic and receive a deep,
                      structured explanation with quiz questions.
                    </p>
                  </div>
                  <div className="hp-mode-card">
                    <div className="hp-mode-card-emoji">🗺️</div>
                    <h4>Mode B — Full Roadmap</h4>
                    <p>
                      Get a week-by-week structured learning roadmap covering
                      all 10 modules from scratch.
                    </p>
                  </div>
                  <div className="hp-mode-card">
                    <div className="hp-mode-card-emoji">🧪</div>
                    <h4>Mode C — Assessment</h4>
                    <p>
                      Take a 5-question diagnostic test. The instructor
                      classifies your level and creates a personalized study
                      plan.
                    </p>
                  </div>
                </div>
              </div>

              <ReviewSection />
            </div>
          )}
        </main>

        {/* Sidebar */}
        <aside aria-label="Course enrollment">
          <div className="hp-sidebar-card">
            <div className="hp-card-preview" aria-hidden="true">
              💻
            </div>
            <div className="hp-card-body">
              <div className="hp-card-free">Free</div>
              <div className="hp-card-badge">AI-powered • No signup required</div>

              <button
                className="hp-card-start-btn"
                onClick={onStart}
                aria-label="Start learning Operating Systems"
              >
                Start Learning →
              </button>

              <div className="hp-card-includes">
                <h4>This course includes:</h4>
                <div className="hp-card-include-item">
                  <span className="hp-card-include-icon">🤖</span>
                  <span>Adaptive AI instructor (Limon)</span>
                </div>
                <div className="hp-card-include-item">
                  <span className="hp-card-include-icon">📊</span>
                  <span>Visual diagrams (scheduling, memory, state charts)</span>
                </div>
                <div className="hp-card-include-item">
                  <span className="hp-card-include-icon">💾</span>
                  <span>Session save & resume</span>
                </div>
                <div className="hp-card-include-item">
                  <span className="hp-card-include-icon">📝</span>
                  <span>Quiz questions per topic</span>
                </div>
                <div className="hp-card-include-item">
                  <span className="hp-card-include-icon">🗺️</span>
                  <span>Personalized study roadmap</span>
                </div>
                <div className="hp-card-include-item">
                  <span className="hp-card-include-icon">♾️</span>
                  <span>Unlimited access • 10 modules • 46 topics</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="hp-footer">
        <p style={{ margin: 0 }}>
          © 2025 OS Instructor · Powered by Limon AI · Built with React &
          FastAPI
        </p>
      </footer>
    </div>
  );
}
