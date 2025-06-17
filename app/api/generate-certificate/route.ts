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
    const pdfBuffer = generateCertificatePDF({
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

function generateCertificatePDF(data: {
  candidateName: string;
  worktestLevel: string;
  completionDate: string;
  jobId: string;
  certificateId: string;
  similarityScores: any;
}): Buffer {
  // Create PDF in landscape mode
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Colors (jsPDF uses RGB values 0-255)
  const primaryBlue = { r: 102, g: 126, b: 234 };
  const darkGray = { r: 45, g: 55, b: 72 };
  const lightGray = { r: 113, g: 128, b: 150 };
  const green = { r: 56, g: 161, b: 105 };

  // Header background
  doc.setFillColor(primaryBlue.r, primaryBlue.g, primaryBlue.b);
  doc.rect(0, 0, pageWidth, 50, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text("CERTIFICATE OF ACHIEVEMENT", pageWidth / 2, 20, {
    align: "center",
  });

  doc.setFontSize(14);
  doc.text("3D Modeling Worktest Completion", pageWidth / 2, 35, {
    align: "center",
  });

  // Main content
  doc.setTextColor(darkGray.r, darkGray.g, darkGray.b);

  // "This is to certify that"
  doc.setFontSize(12);
  doc.text("This is to certify that", pageWidth / 2, 70, { align: "center" });

  // Candidate name
  doc.setFontSize(28);
  doc.text(data.candidateName, pageWidth / 2, 90, { align: "center" });

  // Achievement text
  doc.setFontSize(16);
  doc.text(
    `has successfully completed the ${data.worktestLevel} LEVEL`,
    pageWidth / 2,
    110,
    { align: "center" }
  );
  doc.text(
    "3D Modeling Worktest with outstanding results",
    pageWidth / 2,
    125,
    { align: "center" }
  );

  // Scores section
  const scores = [
    { label: "Silhouette", value: data.similarityScores.silhouette || "N/A" },
    { label: "Proportion", value: data.similarityScores.proportion || "N/A" },
    {
      label: "Color/Material",
      value: data.similarityScores.colorMaterial || "N/A",
    },
    { label: "Overall", value: data.similarityScores.overall || "N/A" },
  ];

  const startX = 60;
  const spacing = 45;

  scores.forEach((score, index) => {
    const x = startX + index * spacing;

    // Score value
    doc.setTextColor(...green);
    doc.setFontSize(18);
    const displayValue = `${score.value}${
      typeof score.value === "number" ? "%" : ""
    }`;
    doc.text(displayValue, x, 150, { align: "center" });

    // Score label
    doc.setTextColor(...lightGray);
    doc.setFontSize(8);
    doc.text(score.label.toUpperCase(), x, 160, { align: "center" });
  });

  // Footer
  doc.setTextColor(...lightGray);
  doc.setFontSize(10);
  doc.text(`Date: ${data.completionDate}`, 20, 180);
  doc.setFontSize(8);
  doc.text(`Certificate ID: ${data.certificateId}`, 20, 190);

  // Signature area
  doc.line(200, 185, 250, 185);
  doc.setFontSize(10);
  doc.text("CharpstAR Team", 225, 195, { align: "center" });

  // Company name
  doc.setTextColor(...primaryBlue);
  doc.setFontSize(16);
  doc.text("CharpstAR", 20, 195);

  // Return as buffer
  const pdfOutput = doc.output("arraybuffer");
  return Buffer.from(pdfOutput);
}
