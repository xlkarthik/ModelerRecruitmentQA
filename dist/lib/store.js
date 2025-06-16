"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initJob = initJob;
exports.setJobStatus = setJobStatus;
exports.setJobResult = setJobResult;
exports.setJobError = setJobError;
exports.getJob = getJob;
var jobStore = new Map();
/** Initialize a job in the store with 'PENDING' status */
function initJob(jobId) {
    jobStore.set(jobId, { status: "PENDING" });
}
/** Update job status */
function setJobStatus(jobId, status) {
    var entry = jobStore.get(jobId);
    if (entry) {
        entry.status = status;
        jobStore.set(jobId, entry);
    }
}
/** Record a completed report */
function setJobResult(jobId, report) {
    jobStore.set(jobId, { status: "COMPLETED", report: report });
}
/** Record a failure */
function setJobError(jobId, message) {
    jobStore.set(jobId, { status: "ERROR", errorMessage: message });
}
/** Retrieve status (and optionally result) */
function getJob(jobId) {
    return jobStore.get(jobId);
}
