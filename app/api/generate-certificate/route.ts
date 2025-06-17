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

    // Determine image type from URL or response
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

  // Professional color palette
  const blue = { r: 102, g: 126, b: 234 };
  const dark = { r: 45, g: 55, b: 72 };
  const gray = { r: 113, g: 128, b: 150 };
  const lightGray = { r: 248, g: 250, b: 252 };

  // Fetch logo
  const logoUrl =
    "https://charpstar.se/Synsam/NewIntegrationtest/Charpstar-Logo.png";
  const logoBase64 = await getImageAsBase64(logoUrl);

  // Outer border with subtle shadow effect
  doc.setFillColor(230, 230, 230);
  doc.rect(5, 5, pageWidth - 10, pageHeight - 10, "F");

  // Main certificate background
  doc.setFillColor(255, 255, 255);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20, "F");

  // Header section with gradient-like effect
  doc.setFillColor(blue.r, blue.g, blue.b);
  doc.rect(10, 10, pageWidth - 20, 75, "F");

  // Header accent line
  doc.setFillColor(blue.r - 20, blue.g - 20, blue.b - 20);
  doc.rect(10, 80, pageWidth - 20, 5, "F");

  // Logo placement - top left with proper spacing
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", 25, 25, 35, 14);
    } catch (error) {
      console.error("Error adding logo to PDF:", error);
    }
  }

  // Main title - better typography
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(32);
  doc.text("CERTIFICATE OF ACHIEVEMENT", pageWidth / 2, 40, {
    align: "center",
  });

  // Subtitle with better spacing
  doc.setFontSize(14);
  doc.text("3D Modeling Worktest Completion", pageWidth / 2, 60, {
    align: "center",
  });

  // Content area with proper margins
  const contentStartY = 110;
  const contentCenterX = pageWidth / 2;

  // Certificate text with improved hierarchy
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.setFontSize(14);
  doc.text("This is to certify that", contentCenterX, contentStartY, {
    align: "center",
  });

  // Candidate name - prominent styling
  doc.setTextColor(dark.r, dark.g, dark.b);
  doc.setFontSize(42);
  doc.text(data.candidateName, contentCenterX, contentStartY + 30, {
    align: "center",
  });

  // Decorative line under name
  doc.setDrawColor(blue.r, blue.g, blue.b);
  doc.setLineWidth(1);
  const nameWidth = doc.getTextWidth(data.candidateName) * 0.42; // Approximate width
  doc.line(
    contentCenterX - nameWidth / 2,
    contentStartY + 38,
    contentCenterX + nameWidth / 2,
    contentStartY + 38
  );

  // Achievement text with better spacing
  doc.setTextColor(dark.r, dark.g, dark.b);
  doc.setFontSize(16);
  doc.text(
    `has successfully completed the ${data.worktestLevel} Level`,
    contentCenterX,
    contentStartY + 55,
    { align: "center" }
  );

  doc.setFontSize(14);
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.text(
    "3D Modeling Worktest with Outstanding Results",
    contentCenterX,
    contentStartY + 75,
    { align: "center" }
  );

  // Footer section with professional layout
  const footerY = pageHeight - 45;

  // Footer background
  doc.setFillColor(lightGray.r, lightGray.g, lightGray.b);
  doc.rect(10, footerY - 15, pageWidth - 20, 40, "F");

  // Left section - Date
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.setFontSize(11);
  doc.text("Issued on", 30, footerY - 5);
  doc.setTextColor(dark.r, dark.g, dark.b);
  doc.setFontSize(12);
  doc.text(data.completionDate, 30, footerY + 5);

  // Center section - Certificate ID with better styling
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.setFontSize(9);
  doc.text("Certificate ID", contentCenterX, footerY - 5, { align: "center" });
  doc.setFontSize(10);
  doc.text(data.certificateId, contentCenterX, footerY + 5, {
    align: "center",
  });

  // Right section - Signature with professional styling
  const sigX = pageWidth - 70;

  // Signature line with proper styling
  doc.setDrawColor(dark.r, dark.g, dark.b);
  doc.setLineWidth(1);
  doc.line(sigX - 40, footerY - 8, sigX + 10, footerY - 8);

  // Signature labels
  doc.setTextColor(gray.r, gray.g, gray.b);
  doc.setFontSize(9);
  doc.text("Authorized by", sigX - 15, footerY + 2, { align: "center" });

  doc.setTextColor(dark.r, dark.g, dark.b);
  doc.setFontSize(11);
  doc.text("CharpstAR Team", sigX - 15, footerY + 12, { align: "center" });

  // Main border with professional styling
  doc.setDrawColor(gray.r, gray.g, gray.b);
  doc.setLineWidth(0.8);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

  // Inner border for elegance
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.rect(15, 15, pageWidth - 30, pageHeight - 30);

  return Buffer.from(doc.output("arraybuffer"));
}
