// First install: npm install jspdf

// app/api/generate-certificate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { jsPDF } from "jspdf";

export async function POST(request: NextRequest) {
  try {
    const { jobId, candidateName, worktestLevel } = await request.json();

    if (!jobId || !candidateName || !worktestLevel) {
      return NextResponse.json(
        {
          error: "Missing required fields: jobId, candidateName, worktestLevel",
        },
        { status: 400 }
      );
    }

    // Get job details from database
    const { data: job, error } = await supabase
      .from("qa_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Parse QA results
    let qaResults = null;
    if (job.qa_results) {
      try {
        qaResults = JSON.parse(job.qa_results);
      } catch (e) {
        console.error("Failed to parse QA results:", e);
        return NextResponse.json(
          { error: "Invalid QA results data" },
          { status: 500 }
        );
      }
    }

    // Check if model is approved
    if (!qaResults || qaResults.status !== "Approved") {
      return NextResponse.json(
        { error: "Certificate can only be generated for approved models" },
        { status: 400 }
      );
    }

    // Generate PDF certificate
    const pdfBuffer = await generateCertificatePDF({
      candidateName,
      worktestLevel: worktestLevel.toUpperCase(),
      completionDate: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
      jobId,
      certificateId: `CSTAR-${worktestLevel.toUpperCase()}-${Date.now()}`,
      similarityScores: qaResults.similarityScores || {},
    });

    // Return PDF as download
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="CharpstAR_Certificate_${candidateName.replace(
          /\s+/g,
          "_"
        )}_${worktestLevel}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error("Certificate generation error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate certificate" },
      { status: 500 }
    );
  }
}

// Function to fetch and convert image to base64
async function getImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch image");

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const contentType = response.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error("Error fetching logo:", error);
    return null;
  }
}

async function generateCertificatePDF(data: {
  candidateName: string;
  worktestLevel: string;
  completionDate: string;
  jobId: string;
  certificateId: string;
  similarityScores: any;
}): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Colors
  const blue = { r: 102, g: 126, b: 234 };
  const dark = { r: 45, g: 55, b: 72 };
  const gray = { r: 113, g: 128, b: 150 };

  // Border
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(1);
  doc.rect(15, 15, pageWidth - 30, pageHeight - 30);

  // Header
  doc.setFillColor(blue.r, blue.g, blue.b);
  doc.rect(15, 15, pageWidth - 30, 60, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.text("CERTIFICATE OF ACHIEVEMENT", pageWidth / 2, 40, {
    align: "center",
  });

  doc.setFontSize(14);
  doc.text("3D Modeling Worktest Completion", pageWidth / 2, 58, {
    align: "center",
  });

  // Main content
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.setFontSize(16);
  doc.text("This is to certify that", pageWidth / 2, 100, { align: "center" });

  // Name
  doc.setTextColor(dark.r, dark.g, dark.b);
  doc.setFontSize(36);
  doc.text(data.candidateName, pageWidth / 2, 125, { align: "center" });

  // Line under name
  doc.setDrawColor(blue.r, blue.g, blue.b);
  doc.setLineWidth(0.8);
  doc.line(pageWidth / 2 - 40, 135, pageWidth / 2 + 40, 135);

  // Achievement text
  doc.setTextColor(dark.r, dark.g, dark.b);
  doc.setFontSize(16);
  doc.text(
    `has successfully completed the ${data.worktestLevel} Level`,
    pageWidth / 2,
    150,
    { align: "center" }
  );
  doc.text(
    "3D Modeling Worktest with Outstanding Results",
    pageWidth / 2,
    165,
    { align: "center" }
  );

  // Footer area
  const footerY = pageHeight - 50;

  // Logo
  const logoUrl =
    "https://charpstar.se/Synsam/NewIntegrationtest/Charpstar-Logo.png";
  const logoBase64 = await getImageAsBase64(logoUrl);

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", 30, footerY, 35, 14);
    } catch (error) {
      doc.setTextColor(blue.r, blue.g, blue.b);
      doc.setFontSize(16);
      doc.text("CharpstAR", 30, footerY + 10);
    }
  } else {
    doc.setTextColor(blue.r, blue.g, blue.b);
    doc.setFontSize(16);
    doc.text("CharpstAR", 30, footerY + 10);
  }

  // Date
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.setFontSize(10);
  doc.text("Date:", 30, footerY + 20);
  doc.setTextColor(dark.r, dark.g, dark.b);
  doc.setFontSize(11);
  doc.text(data.completionDate, 30, footerY + 28);

  // Certificate ID
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.setFontSize(9);
  doc.text(
    `Certificate ID: ${data.certificateId}`,
    pageWidth / 2,
    footerY + 35,
    { align: "center" }
  );

  // Signature
  const sigX = pageWidth - 80;
  doc.setDrawColor(dark.r, dark.g, dark.b);
  doc.setLineWidth(0.5);
  doc.line(sigX, footerY + 10, sigX + 50, footerY + 10);

  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.setFontSize(9);
  doc.text("Authorized Signature", sigX + 25, footerY + 18, {
    align: "center",
  });
  doc.setTextColor(dark.r, dark.g, dark.b);
  doc.setFontSize(10);
  doc.text("CharpstAR Team", sigX + 25, footerY + 26, { align: "center" });

  return Buffer.from(doc.output("arraybuffer"));
}
