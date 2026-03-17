// app/api/qa-jobs/route.ts
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
// Placeholder for queue or storage integration
import { enqueueJob } from "@/lib/queue";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { images } = body as { images: string[] };

    if (!Array.isArray(images) || images.length !== 8) {
      return NextResponse.json(
        { error: "Please upload exactly 8 images (4 live + 4 reference)." },
        { status: 400 }
      );
    }

    // Generate a unique job ID
    const jobId = uuidv4();

    // Enqueue the QA job for processing (images are base64 strings)
    await enqueueJob({ jobId, images });

    // Respond with job identifier so client can poll status
    return NextResponse.json(
      { jobId, message: "QA job enqueued" },
      { status: 201 }
    );
  } catch (err) {
    console.error("Error in QA POST:", err);
    return NextResponse.json(
      { error: "Failed to enqueue QA job" },
      { status: 500 }
    );
  }
}
