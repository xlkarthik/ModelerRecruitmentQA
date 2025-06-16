// app/api/download-pdf/route.ts
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing jobId parameter" },
        { status: 400 }
      );
    }

    console.log(`Attempting to fetch PDF for job: ${jobId}`);

    // Construct the PDF URL
    const pdfUrl = `http://45.76.82.207:8080/saved_pdfs/qa-report-${jobId}.pdf`;

    // Log before fetch
    console.log(`Fetching from: ${pdfUrl}`);

    // Use node-fetch or similar with proper error handling
    const response = await fetch(pdfUrl);

    // Log response status
    console.log(`Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error(`Failed to fetch PDF: ${response.status}`);

      // Check what's in the error response
      const errorText = await response.text();
      console.error(`Error response: ${errorText}`);

      return NextResponse.json(
        { error: `PDF not found: ${response.statusText}` },
        { status: 404 }
      );
    }

    // Get PDF data
    const pdfBuffer = await response.arrayBuffer();
    console.log(`PDF fetched successfully: ${pdfBuffer.byteLength} bytes`);

    // Return PDF with proper headers
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="qa-report-${jobId}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("Error proxying PDF:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}
