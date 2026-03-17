export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getJob } from "../../../../lib/store";

export async function GET(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  const job = getJob(params.jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({
    jobId: params.jobId,
    status: job.status,
    report: job.report,
    errorMessage: job.errorMessage,
  });
}
