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
  const margin = 20;

  // Colors
  const blue = { r: 102, g: 126, b: 234 };
  const dark = { r: 45, g: 55, b: 72 };
  const gray = { r: 113, g: 128, b: 150 };

  // Outer border with proper margin
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(1);
  doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2);

  // Header section
  doc.setFillColor(blue.r, blue.g, blue.b);
  doc.rect(margin, margin, pageWidth - margin * 2, 65, "F");

  // Title - properly centered
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.text("CERTIFICATE OF ACHIEVEMENT", pageWidth / 2, margin + 30, {
    align: "center",
  });

  doc.setFontSize(14);
  doc.text("3D Modeling Worktest Completion", pageWidth / 2, margin + 50, {
    align: "center",
  });

  // Main content area - properly spaced and positioned
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.setFontSize(16);
  doc.text("This is to certify that", pageWidth / 2, 110, { align: "center" });

  // Name - with adequate space
  doc.setTextColor(dark.r, dark.g, dark.b);
  doc.setFontSize(36);
  doc.text(data.candidateName, pageWidth / 2, 135, { align: "center" });

  // Line under name - properly positioned below name
  doc.setDrawColor(blue.r, blue.g, blue.b);
  doc.setLineWidth(1);
  doc.line(pageWidth / 2 - 60, 145, pageWidth / 2 + 60, 145);

  // Achievement text - well spaced below the line
  doc.setTextColor(dark.r, dark.g, dark.b);
  doc.setFontSize(16);
  doc.text(
    `has successfully completed the ${data.worktestLevel} Level`,
    pageWidth / 2,
    165,
    { align: "center" }
  );

  doc.setFontSize(15);
  doc.text(
    "3D Modeling Worktest with Outstanding Results",
    pageWidth / 2,
    180,
    { align: "center" }
  );

  // Footer area - moved further down to avoid overlap
  const footerStartY = pageHeight - margin - 35;

  // Logo area - left side with proper margin
  const logoUrl =
    "https://charpstar.se/Synsam/NewIntegrationtest/Charpstar-Logo.png";
  const logoBase64 = await getImageAsBase64(logoUrl);

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", margin + 15, footerStartY - 5, 35, 14);
    } catch (error) {
      doc.setTextColor(blue.r, blue.g, blue.b);
      doc.setFontSize(16);
      doc.text("CharpstAR", margin + 15, footerStartY + 5);
    }
  } else {
    doc.setTextColor(blue.r, blue.g, blue.b);
    doc.setFontSize(16);
    doc.text("CharpstAR", margin + 15, footerStartY + 5);
  }

  // Date - below logo, left aligned with proper spacing
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.setFontSize(10);
  doc.text("Date:", margin + 15, footerStartY + 15);
  doc.setTextColor(dark.r, dark.g, dark.b);
  doc.setFontSize(11);
  doc.text(data.completionDate, margin + 15, footerStartY + 23);

  // Certificate ID - centered at bottom
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.setFontSize(9);
  doc.text(
    `Certificate ID: ${data.certificateId}`,
    pageWidth / 2,
    footerStartY + 30,
    { align: "center" }
  );

  // Signature area - right side with proper margin
  const sigX = pageWidth - margin - 60;
  const sigY = footerStartY + 5;

  // Signature line
  doc.setDrawColor(dark.r, dark.g, dark.b);
  doc.setLineWidth(0.5);
  doc.line(sigX, sigY, sigX + 50, sigY);

  // Signature labels
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.setFontSize(9);
  doc.text("Authorized Signature", sigX + 25, sigY + 8, { align: "center" });
  doc.setTextColor(dark.r, dark.g, dark.b);
  doc.setFontSize(10);
  doc.text("CharpstAR Team", sigX + 25, sigY + 16, { align: "center" });

  return Buffer.from(doc.output("arraybuffer"));
}
