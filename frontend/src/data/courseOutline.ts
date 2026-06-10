export interface Topic {
  id: string;    // "1.1", "2.3", etc.
  title: string;
}

export interface Module {
  num: number;
  title: string;
  topics: Topic[];
}

export const MODULES: Module[] = [
  {
    num: 1,
    title: "Introduction to Operating Systems",
    topics: [
      { id: "1.1", title: "What is an OS? Goals & Functions" },
      { id: "1.2", title: "Types of OS (Batch, Time-Sharing, Real-Time, Distributed)" },
      { id: "1.3", title: "OS Structure (Monolithic, Microkernel, Layered, Hybrid)" },
      { id: "1.4", title: "System Calls & API" },
      { id: "1.5", title: "OS Boot Process" },
    ],
  },
  {
    num: 2,
    title: "Process Management",
    topics: [
      { id: "2.1", title: "Process Concept, PCB, Process States" },
      { id: "2.2", title: "Process Scheduling (FCFS, SJF, Round Robin, Priority)" },
      { id: "2.3", title: "Context Switching" },
      { id: "2.4", title: "Inter-Process Communication (IPC)" },
      { id: "2.5", title: "Threads & Multithreading Models" },
    ],
  },
  {
    num: 3,
    title: "CPU Scheduling",
    topics: [
      { id: "3.1", title: "Scheduling Criteria & Metrics" },
      { id: "3.2", title: "Preemptive vs Non-Preemptive Scheduling" },
      { id: "3.3", title: "Multilevel Queue & Feedback Queue" },
      { id: "3.4", title: "Real-Time CPU Scheduling" },
      { id: "3.5", title: "Algorithm Evaluation" },
    ],
  },
  {
    num: 4,
    title: "Process Synchronization",
    topics: [
      { id: "4.1", title: "The Critical Section Problem" },
      { id: "4.2", title: "Mutex Locks & Semaphores" },
      { id: "4.3", title: "Classic Problems (Producer-Consumer, Readers-Writers, Dining Philosophers)" },
      { id: "4.4", title: "Monitors" },
      { id: "4.5", title: "Deadlocks: Detection, Prevention, Avoidance, Recovery" },
    ],
  },
  {
    num: 5,
    title: "Memory Management",
    topics: [
      { id: "5.1", title: "Memory Hierarchy & Address Binding" },
      { id: "5.2", title: "Contiguous Allocation, Fragmentation" },
      { id: "5.3", title: "Paging & Page Tables" },
      { id: "5.4", title: "Segmentation" },
      { id: "5.5", title: "Virtual Memory & Demand Paging" },
    ],
  },
  {
    num: 6,
    title: "Virtual Memory",
    topics: [
      { id: "6.1", title: "Page Replacement Algorithms (FIFO, LRU, Optimal)" },
      { id: "6.2", title: "Thrashing" },
      { id: "6.3", title: "Working Set Model" },
      { id: "6.4", title: "Memory-Mapped Files" },
    ],
  },
  {
    num: 7,
    title: "Storage & File Systems",
    topics: [
      { id: "7.1", title: "File Concept & Access Methods" },
      { id: "7.2", title: "Directory Structure" },
      { id: "7.3", title: "File System Implementation" },
      { id: "7.4", title: "Disk Scheduling Algorithms (SSTF, SCAN, C-SCAN)" },
      { id: "7.5", title: "RAID Levels" },
    ],
  },
  {
    num: 8,
    title: "I/O Systems",
    topics: [
      { id: "8.1", title: "I/O Hardware & Mechanisms" },
      { id: "8.2", title: "Kernel I/O Subsystem" },
      { id: "8.3", title: "Buffering, Caching, Spooling" },
      { id: "8.4", title: "I/O Performance" },
    ],
  },
  {
    num: 9,
    title: "Security & Protection",
    topics: [
      { id: "9.1", title: "Goals of Protection" },
      { id: "9.2", title: "Access Matrix & Capability Lists" },
      { id: "9.3", title: "OS Security Threats" },
      { id: "9.4", title: "Cryptography Basics in OS Context" },
    ],
  },
  {
    num: 10,
    title: "Advanced Topics",
    topics: [
      { id: "10.1", title: "Distributed Systems Overview" },
      { id: "10.2", title: "Virtualization & Hypervisors" },
      { id: "10.3", title: "Cloud OS Concepts" },
      { id: "10.4", title: "Linux Internals Overview" },
    ],
  },
];

// Flat ordered list of all topic IDs
const ALL_TOPIC_IDS: string[] = MODULES.flatMap((m) => m.topics.map((t) => t.id));

export function getTopicById(id: string): Topic | undefined {
  for (const mod of MODULES) {
    const t = mod.topics.find((t) => t.id === id);
    if (t) return t;
  }
  return undefined;
}

export function getNextTopicId(currentId: string): string | null {
  const idx = ALL_TOPIC_IDS.indexOf(currentId);
  if (idx === -1 || idx === ALL_TOPIC_IDS.length - 1) return null;
  return ALL_TOPIC_IDS[idx + 1];
}

export function getFirstIncompleteTopic(completedTopics: string[]): Topic | undefined {
  const completed = new Set(completedTopics);
  for (const id of ALL_TOPIC_IDS) {
    if (!completed.has(id)) return getTopicById(id);
  }
  return undefined; // all done
}

export function getModuleForTopic(topicId: string): Module | undefined {
  const modNum = parseInt(topicId.split(".")[0], 10);
  return MODULES.find((m) => m.num === modNum);
}

export function isModuleComplete(modNum: number, completedTopics: string[]): boolean {
  const mod = MODULES.find((m) => m.num === modNum);
  if (!mod) return false;
  return mod.topics.every((t) => completedTopics.includes(t.id));
}
