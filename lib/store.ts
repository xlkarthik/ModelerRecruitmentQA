// Simple in-memory store for job statuses and results.
export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "ERROR";

interface JobResult {
  status: JobStatus;
  report?: any; // holds the QA report when status is COMPLETED
  errorMessage?: string; // holds error message when status is ERROR
}

const jobStore: Map<string, JobResult> = new Map();

/** Initialize a job in the store with 'PENDING' status */
export function initJob(jobId: string) {
  jobStore.set(jobId, { status: "PENDING" });
}

/** Update job status */
export function setJobStatus(jobId: string, status: JobStatus) {
  const entry = jobStore.get(jobId);
  if (entry) {
    entry.status = status;
    jobStore.set(jobId, entry);
  }
}

/** Record a completed report */
export function setJobResult(jobId: string, report: any) {
  jobStore.set(jobId, { status: "COMPLETED", report });
}

/** Record a failure */
export function setJobError(jobId: string, message: string) {
  jobStore.set(jobId, { status: "ERROR", errorMessage: message });
}

/** Retrieve status (and optionally result) */
export function getJob(jobId: string): JobResult | undefined {
  return jobStore.get(jobId);
}
