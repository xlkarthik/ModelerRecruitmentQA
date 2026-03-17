// app/api/check-pdf/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    const pdfUrl = `http://45.76.82.207:8080/saved_pdfs/qa-report-${jobId}.pdf`;

    try {
      const response = await fetch(pdfUrl, { method: "HEAD" });

      if (response.ok) {
        const contentLength = response.headers.get("content-length");
        return NextResponse.json({
          exists: true,
          path: pdfUrl,
          size: contentLength
            ? `${Math.round(parseInt(contentLength) / 1024)} KB`
            : "Unknown",
        });
      } else {
        return NextResponse.json({
          exists: false,
          path: pdfUrl,
          status: response.status,
          statusText: response.statusText,
        });
      }
    } catch (err: any) {
      return NextResponse.json({
        exists: false,
        path: pdfUrl,
        error: err.message,
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
