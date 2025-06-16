// lib/queue.ts
// Simple in-memory queue stub. Replace with Redis/SQS or other durable queue in production.

export interface QAJob {
  jobId: string;
  images: string[];
}

const queue: QAJob[] = [];

/**
 * Enqueue a new QA job.
 * @param job - The jobId and array of 8 base64 image strings.
 */
export async function enqueueJob(job: QAJob): Promise<void> {
  queue.push(job);
  // TODO: push to a real queue or database in production
}

/**
 * Dequeue the next QA job.
 * @returns The next QAJob or undefined if the queue is empty.
 */
export function dequeueJob(): QAJob | undefined {
  return queue.shift();
}
